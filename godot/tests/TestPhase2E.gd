extends SceneTree
##
## Phase 2E の headless テスト。
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tests/TestPhase2E.gd
##
## Main.gd (UI) は触らず、SettlementSystem / TurnSystem / ResourceSystem の
## 振る舞いだけを確認する。既存 Phase (採集/納入/CAMP/regrow/Fog/移動) の
## 回帰確認もここに含める。

var _passed := 0
var _failed := 0

func _ok(name: String, cond: bool) -> void:
	if cond:
		_passed += 1
		print("  PASS  ", name)
	else:
		_failed += 1
		print("  FAIL  ", name)

func _eq(name: String, got, want) -> void:
	_ok("%s (got %s / want %s)" % [name, str(got), str(want)], got == want)

# ── 足場 ─────────────────────────────────────────────────────────
## 地形を使わないテスト用に、全面 GRASS のマップを作る。
func _flat_tiles(w: int, h: int) -> Array:
	var tiles: Array = []
	for y in h:
		var row: Array = []
		for x in w:
			row.append(MapGenerator.Tile.GRASS)
		tiles.append(row)
	return tiles

func _make_world() -> Dictionary:
	var tiles := _flat_tiles(16, 16)
	var st := SettlementSystem.new()
	st.setup(tiles)
	var base := st.create_base(Vector2i(8, 8))
	var ts := TurnSystem.new()
	ts.settlements = st
	return {"tiles": tiles, "settlements": st, "base": base, "turns": ts}

## BASE を確実に食わせられるだけ果物を積む。
func _stock_fruit(s: Dictionary, n: int) -> void:
	s["storage"][ResourceSystem.FRUIT] = n

## CAMP 設営費を払えるだけ BASE に資材を積む。
func _stock_build(base: Dictionary) -> void:
	base["storage"][ResourceSystem.WOOD] = 99
	base["storage"][ResourceSystem.STONE] = 99

func _advance(ts: TurnSystem, n: int) -> void:
	for i in n:
		ts.advance_turn()

func _init() -> void:
	print("=== Phase 2E: population ===")
	_test_initial_population()
	_test_caps()
	_test_growth_is_proportional()
	_test_growth_slows_near_cap()
	_test_food_interval()
	_test_food_independent()
	_test_food_shortage()
	_test_send_population()
	print("=== regression: Phase 2A-2D ===")
	_test_regression()
	print("---- %d passed / %d failed ----" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)

# ── 1-3: 初期人口と上限 ──────────────────────────────────────────
func _test_initial_population() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	_eq("1. BASE 初期人口 = 6", st.get_population(w["base"]), 6)
	_eq("1. BASE 初期人口 = 定数", st.get_population(w["base"]),
		SettlementSystem.BASE_INITIAL_POPULATION)
	_stock_build(w["base"])
	var camp: Dictionary = st.build_camp(Vector2i(9, 8))["settlement"]
	_ok("2. CAMP を設営できた", not camp.is_empty())
	_eq("2. CAMP は人口 0 で設置される", st.get_population(camp), 0)
	_eq("2. CAMP の growth_progress は 0", camp["growth_progress"], 0.0)

func _test_caps() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	_stock_fruit(w["base"], 99)
	w["base"]["storage"][ResourceSystem.WOOD] = 99
	w["base"]["storage"][ResourceSystem.STONE] = 99
	var camp: Dictionary = st.build_camp(Vector2i(9, 8))["settlement"]
	_eq("3. BASE 上限 30", st.get_population_cap(w["base"]), 30)
	_eq("3. CAMP 上限 12", st.get_population_cap(camp), 12)
	_ok("3. BASE と CAMP で上限が異なる",
		st.get_population_cap(w["base"]) != st.get_population_cap(camp))

# ── 4-7: 成長 ────────────────────────────────────────────────────
## 人口 p から +1 されるまでのターン数を測る。
func _turns_to_grow(p: int) -> int:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var base: Dictionary = w["base"]
	base["population"] = p
	var t := 0
	while st.get_population(base) == p and t < 100000:
		st.update_population_growth(base)
		t += 1
	return t

func _test_growth_is_proportional() -> void:
	var t5 := _turns_to_grow(5)
	var t15 := _turns_to_grow(15)
	_ok("4. 成長は固定+1ではない (1ターンで増えない): %d ターン" % t5, t5 > 1)
	_ok("5. POP15 (%d ターン) は POP5 (%d ターン) より速い" % [t15, t5], t15 < t5)
	print("      参考: POP6 で +1 まで %d ターン" % _turns_to_grow(6))

func _test_growth_slows_near_cap() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var base: Dictionary = w["base"]
	# 上限直下 (29) と中盤 (15) の1ターンあたり増分を比べる
	base["population"] = 15
	base["growth_progress"] = 0.0
	st.update_population_growth(base)
	var g15: float = base["growth_progress"]
	base["population"] = 29
	base["growth_progress"] = 0.0
	st.update_population_growth(base)
	var g29: float = base["growth_progress"]
	_ok("6. 上限付近で成長が鈍る (POP29 %.5f < POP15 %.5f)" % [g29, g15], g29 < g15)
	# 上限を超えない
	base["population"] = 30
	base["growth_progress"] = 0.9
	st.update_population_growth(base)
	_eq("7. 上限では増えない", st.get_population(base), 30)
	base["population"] = 29
	base["growth_progress"] = 0.99
	for i in 5000:
		st.update_population_growth(base)
	_eq("7. 長く回しても上限を超えない", st.get_population(base), 30)

# ── 8-11: 食料 ───────────────────────────────────────────────────
func _test_food_interval() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var ts: TurnSystem = w["turns"]
	var base: Dictionary = w["base"]
	var iv := SettlementSystem.FOOD_INTERVAL_TURNS
	_stock_fruit(base, 30)
	_advance(ts, iv - 1)
	_eq("8. 周期の直前までは食料を消費しない",
		base["storage"][ResourceSystem.FRUIT], 30)
	ts.advance_turn()   # turn = iv
	_eq("8. %dターン目に population ぶん消費 (6)" % iv,
		base["storage"][ResourceSystem.FRUIT], 24)
	_advance(ts, iv)    # turn = iv * 2
	_eq("8. 次の周期でもう一度消費",
		base["storage"][ResourceSystem.FRUIT], 18)

func _test_food_independent() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var ts: TurnSystem = w["turns"]
	var base: Dictionary = w["base"]
	base["storage"][ResourceSystem.WOOD] = 9
	base["storage"][ResourceSystem.STONE] = 9
	_stock_fruit(base, 40)
	var camp: Dictionary = st.build_camp(Vector2i(9, 8))["settlement"]
	_stock_fruit(camp, 20)
	st.send_population_to_camp(camp)          # BASE 6→4, CAMP 0→2
	_eq("9. 移住後 BASE 人口 4", st.get_population(base), 4)
	_eq("9. 移住後 CAMP 人口 2", st.get_population(camp), 2)
	_advance(ts, SettlementSystem.FOOD_INTERVAL_TURNS)
	_eq("9. BASE は自分の備蓄から 4 消費",
		base["storage"][ResourceSystem.FRUIT], 36)
	_eq("9. CAMP は自分の備蓄から 2 消費",
		camp["storage"][ResourceSystem.FRUIT], 18)
	# 無人 CAMP は食わない
	var camp2: Dictionary = st.build_camp(Vector2i(7, 8))["settlement"]
	_stock_fruit(camp2, 5)
	_advance(ts, SettlementSystem.FOOD_INTERVAL_TURNS)
	_eq("9. 無人 CAMP は食料を消費しない",
		camp2["storage"][ResourceSystem.FRUIT], 5)

func _test_food_shortage() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var ts: TurnSystem = w["turns"]
	var base: Dictionary = w["base"]
	var iv := SettlementSystem.FOOD_INTERVAL_TURNS
	_stock_fruit(base, 2)                     # 必要 6 に対して 2 しかない
	_advance(ts, iv)                          # 最初の食料周期で不足が確定
	_eq("10/11. 不足時も備蓄は 0 止まり (マイナスにしない)",
		base["storage"][ResourceSystem.FRUIT], 0)
	_ok("10. food_shortage が立つ", st.has_food_shortage(base))
	_eq("11. 不足でも人口は減らない", st.get_population(base), 6)

	# 不足が確定したあとは人口も端数も一切動かない
	var pop_before := st.get_population(base)
	base["growth_progress"] = 0.99            # あと一押しで +1 のはずの状態
	_advance(ts, 5)
	_eq("10. 不足中は成長しない", st.get_population(base), pop_before)
	_eq("10. 不足中は端数も進まない (0.99 のまま +1 されない)",
		base["growth_progress"], 0.99)

	# 食料が戻れば shortage が解除され、成長が再開する
	_stock_fruit(base, 50)
	_advance(ts, iv - 5)                      # 次の食料周期で再判定
	_ok("10. 補充後は shortage が解除される", not st.has_food_shortage(base))
	_eq("10. 補充後は必要量ぶんだけ引かれる",
		base["storage"][ResourceSystem.FRUIT], 44)
	# 0.99 + 6*0.002*(1-6/30) = +0.0096/ターン なので数ターンで 1.0 を跨ぐ
	var progress_before: float = base["growth_progress"]
	ts.advance_turn()
	_ok("10. 解除後は端数が再び進む (%.4f → %.4f)" % [progress_before, base["growth_progress"]],
		base["growth_progress"] > progress_before)
	_advance(ts, 3)
	_eq("10. 解除後は成長が再開する (0.99 → +1)",
		st.get_population(base), pop_before + 1)

# ── 12-17: 移住 ──────────────────────────────────────────────────
func _test_send_population() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var base: Dictionary = w["base"]
	base["storage"][ResourceSystem.WOOD] = 99
	base["storage"][ResourceSystem.STONE] = 99
	var camp: Dictionary = st.build_camp(Vector2i(9, 8))["settlement"]

	var r := st.send_population_to_camp(camp)
	_ok("12. CAMP へ2人送れる", r["ok"] and r["amount"] == 2)
	_eq("12. BASE 6-2 = 4", st.get_population(base), 4)
	_eq("12. CAMP 0+2 = 2", st.get_population(camp), 2)

	# 13. CAMP 以外へは送れない (BASE 自身 / 拠点なしの空辞書)
	var to_base := st.send_population_to_camp(base)
	_ok("13. BASE へは送れない", not to_base["ok"] and to_base["reason"] == SettlementSystem.REASON_NOT_CAMP)
	var to_none := st.send_population_to_camp({})
	_ok("13. 拠点外では送れない", not to_none["ok"] and to_none["reason"] == SettlementSystem.REASON_NOT_CAMP)
	_eq("13. 失敗時に人口は動かない", st.get_population(base), 4)

	# 14. BASE 人口が少なすぎる場合
	base["population"] = 2                     # 2-2=0 → BASE が空になる
	var low := st.send_population_to_camp(camp)
	_ok("14. BASE 人口 2 では送れない", not low["ok"] and low["reason"] == SettlementSystem.REASON_BASE_LOW)
	_eq("14. BASE は 0 にならない", st.get_population(base), 2)
	base["population"] = 3
	_ok("14. BASE 人口 3 なら送れる", st.can_send_population(camp))

	# 15. CAMP 上限超え
	base["population"] = 20
	camp["population"] = 11                    # 11+2 = 13 > 12
	var full := st.send_population_to_camp(camp)
	_ok("15. CAMP 上限を超える移住は不可", not full["ok"] and full["reason"] == SettlementSystem.REASON_CAMP_FULL)
	camp["population"] = 10                    # 10+2 = 12 = cap → ちょうど可
	_ok("15. ちょうど上限までは送れる", st.can_send_population(camp))

	# 16/17: ターン消費は Main.gd 側の分岐だが、ここでは
	# 「成功/失敗が明確に返る」ことを確認する (Main はこの ok を見て advance する)。
	camp["population"] = 0
	base["population"] = 6
	var before_pop := st.get_population(base)
	var ok_result := st.send_population_to_camp(camp)
	_ok("16. 成功は ok=true を返す (Main はここで1ターン消費)", ok_result["ok"])
	base["population"] = 1
	var ng_result := st.send_population_to_camp(camp)
	_ok("17. 失敗は ok=false を返し、状態を変えない (ターン非消費)",
		not ng_result["ok"] and st.get_population(base) == 1)

# ── 18: 既存機能の回帰 ───────────────────────────────────────────
func _test_regression() -> void:
	var seed_value := 12345
	var gen := MapGenerator.new()
	var tiles := gen.generate(seed_value)
	var res := ResourceSystem.new()
	res.generate(tiles, seed_value)
	res.reset_inventory()
	var spawn := gen.find_spawn(tiles)
	var st := SettlementSystem.new()
	st.setup(tiles)
	var base := st.create_base(spawn)
	var pc := PlayerController.new()
	pc.reset_fog()
	pc.place_at(spawn)
	pc.reveal(tiles)
	var ts := TurnSystem.new()
	ts.resources = res
	ts.settlements = st

	_ok("18. 資源が生成される", res.nodes.size() > 0)
	_ok("18. Fog: 開始地点が可視", pc.explored.size() > 0)

	# 移動
	var moved := false
	for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		if pc.try_move(tiles, d.x, d.y):
			moved = true
			break
	_ok("18. 移動できる", moved)
	var explored_before := pc.explored.size()
	pc.reveal(tiles)
	_ok("18. Fog が広がる", pc.explored.size() >= explored_before)

	# 採集 → 納入
	var target_key := ""
	for key in res.nodes:
		if res.nodes[key]["type"] == ResourceSystem.FRUIT:
			target_key = key
			break
	_ok("18. 果物ノードが存在する", target_key != "")
	var parts: PackedStringArray = target_key.split(",")
	var gx := int(parts[0])
	var gy := int(parts[1])
	var got := res.gather(gx, gy)
	_ok("18. 採集できる", not got.is_empty() and got["amount"] == 1)
	_eq("18. インベントリに入る", res.carried_total(), 1)
	var total := st.deposit_to_settlement(spawn, res.take_all())
	_eq("18. BASE へ納入できる", total, 1)
	_eq("18. 納入後インベントリは空", res.carried_total(), 0)
	_eq("18. BASE 備蓄に載る", base["storage"][ResourceSystem.FRUIT], 1)
	_eq("18. 拠点外への納入は -1", st.deposit_to_settlement(Vector2i(-5, -5), {}), -1)

	# regrow: ノードを枯らして復活まで回す
	var node: Dictionary = res.nodes[target_key]
	node["remaining"] = 0
	node["regrow_timer"] = 3
	_ok("18. 枯渇マークが出る", res.is_depleted(gx, gy))
	_advance(ts, 3)
	_eq("18. regrow で満量に戻る", node["remaining"], node["max_remaining"])
	_ok("18. 復活で枯渇マークが消える", not res.is_depleted(gx, gy))

	# CAMP 設営 (資材を積んでから)
	base["storage"][ResourceSystem.WOOD] = 9
	base["storage"][ResourceSystem.STONE] = 9
	var built := false
	for y in range(1, tiles.size() - 1):
		for x in range(1, tiles[0].size() - 1):
			if st.can_build_camp(Vector2i(x, y)):
				built = st.build_camp(Vector2i(x, y))["ok"]
				break
		if built:
			break
	_ok("18. CAMP を設営できる", built)
	_eq("18. CAMP 設営で BASE の資材が減る", base["storage"][ResourceSystem.WOOD], 6)
	_eq("18. CAMP が1件", st.camp_count(), 1)
	_ok("18. HUD 1行に POP が入る", st.storage_text(base).begins_with("BASE POP 06/30"))
	print("      HUD: ", st.storage_text(base))
	print("      HUD: ", st.storage_text(st.get_camps()[0]))
