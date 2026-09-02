extends SceneTree
##
## Phase 2F の headless テスト (労働者アサイン + 集落資源圧)。
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tests/TestPhase2F.gd
##
## 資源配置は乱数マップに頼らず、テスト側で決め打ちして置く
## (「どこに何個あるか」を固定しないと枯渇の検証が確率の話になるため)。

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
func _flat_tiles(w: int, h: int) -> Array:
	var tiles: Array = []
	for y in h:
		var row: Array = []
		for x in w:
			row.append(MapGenerator.Tile.GRASS)
		tiles.append(row)
	return tiles

## 資源ゼロの空マップ + BASE。資源はテストごとに _place() で置く。
func _make_world(base_pos: Vector2i = Vector2i(10, 10)) -> Dictionary:
	var tiles := _flat_tiles(24, 24)
	var res := ResourceSystem.new()
	res.nodes.clear()
	res.reset_inventory()
	var st := SettlementSystem.new()
	st.setup(tiles)
	var base := st.create_base(base_pos)
	var ts := TurnSystem.new()
	ts.resources = res
	ts.settlements = st
	return {"tiles": tiles, "resources": res, "settlements": st, "base": base, "turns": ts}

func _place(res: ResourceSystem, x: int, y: int, type: String) -> Dictionary:
	var node := res._make_node(type)
	res.nodes["%d,%d" % [x, y]] = node
	return node

func _stock_build(base: Dictionary) -> void:
	base["storage"][ResourceSystem.WOOD] = 99
	base["storage"][ResourceSystem.STONE] = 99

func _advance(ts: TurnSystem, n: int) -> void:
	for i in n:
		ts.advance_turn()

func _init() -> void:
	print("=== Phase 2F: workers ===")
	_test_initial_and_limits()
	_test_assign_and_release()
	_test_empty_camp_cannot_work()
	print("=== Phase 2F: auto gathering ===")
	_test_work_interval()
	_test_each_job_gathers_its_resource()
	_test_no_target()
	_test_consumes_real_nodes()
	_test_regrow_returns_target()
	_test_storage_routing()
	_test_flint_never_worked()
	print("=== Phase 2F: settlement pressure ===")
	_test_pressure_needs_population()
	_test_pressure_scales()
	_test_pressure_distance()
	_test_pressure_fragility()
	print("=== Phase 2F: integrity ===")
	_test_migration_clamps_workers()
	_test_2e_still_works()
	print("---- %d passed / %d failed ----" % [_passed, _failed])
	quit(1 if _failed > 0 else 0)

# ── 1,2: 初期値と上限 ────────────────────────────────────────────
func _test_initial_and_limits() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var base: Dictionary = w["base"]
	_eq("1. 初期労働者は 0", st.assigned_workers(base), 0)
	for job in SettlementSystem.JOB_ORDER:
		_eq("1. %s の初期値 0" % job, st.get_workers(base).get(job), 0)
	_eq("2. POP6 の労働可能人数は 5 (population - 1)", st.max_workers(base), 5)
	_eq("2. 未割当は 5", st.available_workers(base), 5)
	# population - 1 を超えて割当できない
	for i in 20:
		st.cycle_worker(base, SettlementSystem.JOB_FOOD)
		if st.available_workers(base) <= 0:
			break
	_eq("2. FOOD に積んでも 5 で止まる", st.assigned_workers(base), 5)
	_eq("2. 未割当 0", st.available_workers(base), 0)
	var blocked := st.cycle_worker(base, SettlementSystem.JOB_WOOD)
	_eq("2. 空きが無ければ WOOD は増えない", st.get_workers(base).get(SettlementSystem.JOB_WOOD), 0)
	_eq("2. 空き無しの結果は none", blocked["result"], "none")
	# set_workers も必ず切り詰める
	st.set_workers(base, SettlementSystem.JOB_FOOD, 99)
	_eq("2. set_workers も population-1 で切り詰める", st.assigned_workers(base), 5)

# ── 3,4: 割当と解除 ──────────────────────────────────────────────
func _test_assign_and_release() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var base: Dictionary = w["base"]
	base["population"] = 10          # 労働可能 9
	# 3. 3種すべてに割当できる
	_eq("3. カーソル初期値は FOOD", st.get_job_cursor(base), SettlementSystem.JOB_FOOD)
	st.cycle_worker(base, SettlementSystem.JOB_FOOD)
	st.cycle_worker(base, SettlementSystem.JOB_FOOD)
	_eq("3. FOOD へ割当", st.get_workers(base)[SettlementSystem.JOB_FOOD], 2)
	_eq("3. カーソル FOOD → WOOD", st.cycle_job_cursor(base), SettlementSystem.JOB_WOOD)
	st.cycle_worker(base, SettlementSystem.JOB_WOOD)
	_eq("3. WOOD へ割当", st.get_workers(base)[SettlementSystem.JOB_WOOD], 1)
	_eq("3. カーソル WOOD → STONE", st.cycle_job_cursor(base), SettlementSystem.JOB_STONE)
	st.cycle_worker(base, SettlementSystem.JOB_STONE)
	_eq("3. STONE へ割当", st.get_workers(base)[SettlementSystem.JOB_STONE], 1)
	_eq("3. カーソル STONE → FOOD (循環)", st.cycle_job_cursor(base), SettlementSystem.JOB_FOOD)
	_eq("3. 合計 4 / 未割当 5", st.assigned_workers(base), 4)
	_eq("3. HUD 表記", st.jobs_text(base), "JOB F2 W1 S1  FREE 5")

	# 4. 空きを使い切ってから押すと解除される
	while st.available_workers(base) > 0:
		st.cycle_worker(base, SettlementSystem.JOB_FOOD)
	_eq("4. FOOD が空きを吸って 7", st.get_workers(base)[SettlementSystem.JOB_FOOD], 7)
	var cleared := st.cycle_worker(base, SettlementSystem.JOB_FOOD)
	_eq("4. 空き無しで押すと FOOD が 0 に戻る", st.get_workers(base)[SettlementSystem.JOB_FOOD], 0)
	_eq("4. 解除の結果は clear", cleared["result"], "clear")
	_eq("4. 解除人数が delta に出る", cleared["delta"], -7)
	_eq("4. 解除後は WOOD/STONE が残る", st.assigned_workers(base), 2)

# ── 5: 無人 CAMP ─────────────────────────────────────────────────
func _test_empty_camp_cannot_work() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	_stock_build(w["base"])
	var camp: Dictionary = st.build_camp(Vector2i(16, 10))["settlement"]
	_eq("5. 無人 CAMP の労働可能人数は 0", st.max_workers(camp), 0)
	_eq("5. 無人 CAMP は未割当も 0", st.available_workers(camp), 0)
	var r := st.cycle_worker(camp, SettlementSystem.JOB_FOOD)
	_eq("5. 無人 CAMP には割当できない", st.assigned_workers(camp), 0)
	_eq("5. 結果は none", r["result"], "none")
	_place(res, 16, 11, ResourceSystem.FRUIT)
	var work := st.work_settlement(camp, res)
	_eq("5. 無人 CAMP は採集しない", work["total"], 0)
	_eq("5. 無人 CAMP の果物は減らない", res.node_at(16, 11)["remaining"], 3)

# ── 6: 労働周期 ──────────────────────────────────────────────────
func _test_work_interval() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var ts: TurnSystem = w["turns"]
	var base: Dictionary = w["base"]
	base["population"] = 3
	# WOOD で測る。FRUIT だと食料消費と同じ資源になって
	# 「労働で増えたぶん」が見えなくなるため。
	st.set_workers(base, SettlementSystem.JOB_WOOD, 1)
	for i in 6:
		_place(res, 10 + i, 13, ResourceSystem.WOOD)      # 圧の弱い外周へ散らす
	_advance(ts, 4)
	_eq("6. 4ターン目までは労働処理が起きない",
		base["storage"].get(ResourceSystem.WOOD, 0), 0)
	ts.advance_turn()                                     # turn 5
	_eq("6. 5ターン目に労働1回ぶん (worker 1 → +1)",
		base["storage"][ResourceSystem.WOOD], 1)
	_advance(ts, 5)                                       # turn 10
	_eq("6. 次の周期にもう1回", base["storage"][ResourceSystem.WOOD], 2)
	# 労働で採った果物はその周期の食事には間に合わない (順序: 食料 → 労働)
	var w2 := _make_world()
	var st2: SettlementSystem = w2["settlements"]
	var res2: ResourceSystem = w2["resources"]
	var base2: Dictionary = w2["base"]
	base2["population"] = 3
	st2.set_workers(base2, SettlementSystem.JOB_FOOD, 1)
	for i in 6:
		_place(res2, 10 + i, 13, ResourceSystem.FRUIT)
	# 食料周期のターンでは「食料消費 → 労働」の順なので、
	# その周期に採った果物はその場の食事には間に合わない。
	var iv := SettlementSystem.FOOD_INTERVAL_TURNS
	var cycles := iv / SettlementSystem.WORK_INTERVAL_TURNS   # 周期内の労働回数
	_advance(w2["turns"], iv)
	_eq("6. 収穫 %d - 食事 3 = %d (食料 → 労働の順)" % [cycles, cycles - 3],
		base2["storage"][ResourceSystem.FRUIT], cycles - 3)
	_ok("6. is_work_turn: 5/10 は true, 4/6 は false",
		st.is_work_turn(5) and st.is_work_turn(10) and not st.is_work_turn(4)
		and not st.is_work_turn(6) and not st.is_work_turn(0))

# ── 7,8,9: 各職が自分の資源を採る ────────────────────────────────
func _test_each_job_gathers_its_resource() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var base: Dictionary = w["base"]
	base["population"] = 12
	st.set_workers(base, SettlementSystem.JOB_FOOD, 2)
	st.set_workers(base, SettlementSystem.JOB_WOOD, 3)
	st.set_workers(base, SettlementSystem.JOB_STONE, 1)
	# 半径4以内に十分な数を置く
	for i in 3:
		_place(res, 8 + i, 8, ResourceSystem.FRUIT)
		_place(res, 8 + i, 12, ResourceSystem.WOOD)
		_place(res, 12, 8 + i, ResourceSystem.STONE)
	var r := st.work_settlement(base, res)
	_eq("7. FOOD worker 2 → FRUIT +2", base["storage"][ResourceSystem.FRUIT], 2)
	_eq("8. WOOD worker 3 → WOOD +3", base["storage"][ResourceSystem.WOOD], 3)
	_eq("9. STONE worker 1 → STONE +1", base["storage"][ResourceSystem.STONE], 1)
	_eq("7-9. 合計収穫 6", r["total"], 6)
	_eq("7-9. 労働者数 6", r["workers"], 6)
	_ok("7-9. idle ではない", not r["idle"])

	# 範囲外 (半径5) は採らない
	var w2 := _make_world()
	var st2: SettlementSystem = w2["settlements"]
	var res2: ResourceSystem = w2["resources"]
	var base2: Dictionary = w2["base"]
	base2["population"] = 3
	st2.set_workers(base2, SettlementSystem.JOB_FOOD, 1)
	_place(res2, 15, 10, ResourceSystem.FRUIT)            # 距離 5 = WORK_RADIUS 超え
	var r2 := st2.work_settlement(base2, res2)
	_eq("7. WORK_RADIUS(4) の外は採らない", r2["total"], 0)
	_place(res2, 14, 10, ResourceSystem.FRUIT)            # 距離 4 = ちょうど範囲内
	_eq("7. 半径ちょうどは採る", st2.work_settlement(base2, res2)["total"], 1)

# ── 10: 対象なし ─────────────────────────────────────────────────
func _test_no_target() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var base: Dictionary = w["base"]
	base["population"] = 6
	st.set_workers(base, SettlementSystem.JOB_STONE, 3)
	_place(res, 11, 10, ResourceSystem.FRUIT)             # 石ではない
	var r := st.work_settlement(base, res)
	_eq("10. 対象資源が無ければ 0", r["total"], 0)
	_eq("10. 他資源は巻き添えにしない", res.node_at(11, 10)["remaining"], 3)
	_ok("10. idle が立つ (AREA DEPLETED の合図)", r["idle"])

# ── 11,12: 実在ノードを削る / 枯渇処理に入る ─────────────────────
func _test_consumes_real_nodes() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var base: Dictionary = w["base"]
	base["population"] = 6
	st.set_workers(base, SettlementSystem.JOB_FOOD, 1)
	var node := _place(res, 11, 10, ResourceSystem.FRUIT)
	_eq("11. FRUIT ノードは 3 個", node["remaining"], 3)
	st.work_settlement(base, res)
	_eq("11. 自動採集で remaining が減る", node["remaining"], 2)
	_eq("11. 減ったぶんが storage に入る", base["storage"][ResourceSystem.FRUIT], 1)
	st.work_settlement(base, res)
	st.work_settlement(base, res)
	_eq("12. 0 まで採れる", node["remaining"], 0)
	_ok("12. 既存の枯渇マークが立つ", res.is_depleted(11, 10))
	_ok("12. 既存の regrow_timer が動き出す", node["regrow_timer"] > 0)
	_eq("12. 枯れたら採れない", st.work_settlement(base, res)["total"], 0)
	# 一番近いノードから順に使う (決定的)
	var w2 := _make_world()
	var st2: SettlementSystem = w2["settlements"]
	var res2: ResourceSystem = w2["resources"]
	w2["base"]["population"] = 6
	st2.set_workers(w2["base"], SettlementSystem.JOB_FOOD, 1)
	_place(res2, 13, 10, ResourceSystem.FRUIT)            # 距離 3
	var near := _place(res2, 11, 10, ResourceSystem.FRUIT) # 距離 1
	st2.work_settlement(w2["base"], res2)
	_eq("11. 近いノードから使う", near["remaining"], 2)
	_eq("11. 遠いノードは手つかず", res2.node_at(13, 10)["remaining"], 3)

# ── 13: regrow 後に再び対象になる ────────────────────────────────
func _test_regrow_returns_target() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var ts: TurnSystem = w["turns"]
	var base: Dictionary = w["base"]
	base["population"] = 6
	st.set_workers(base, SettlementSystem.JOB_FOOD, 1)
	var node := _place(res, 11, 10, ResourceSystem.FRUIT)
	node["remaining"] = 0
	node["regrow_timer"] = 3
	_eq("13. 枯れている間は採れない", st.work_settlement(base, res)["total"], 0)
	_advance(ts, 3)
	_eq("13. regrow で満量に戻る", node["remaining"], node["max_remaining"])
	_ok("13. 枯渇マークが消える", not res.is_depleted(11, 10))
	_ok("13. 再び労働対象になる", st.work_settlement(base, res)["total"] == 1)

# ── 14,15: storage の行き先 ──────────────────────────────────────
func _test_storage_routing() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var base: Dictionary = w["base"]
	_stock_build(base)
	base["population"] = 6
	var camp: Dictionary = st.build_camp(Vector2i(18, 18))["settlement"]
	camp["population"] = 6
	st.set_workers(base, SettlementSystem.JOB_FOOD, 2)
	st.set_workers(camp, SettlementSystem.JOB_FOOD, 3)
	for i in 4:
		_place(res, 9 + i, 9, ResourceSystem.FRUIT)       # BASE 圏
		_place(res, 17 + i, 17, ResourceSystem.FRUIT)     # CAMP 圏
	st.work_all(res)
	_eq("14. BASE の収穫は BASE storage へ", base["storage"][ResourceSystem.FRUIT], 2)
	_eq("14. CAMP の収穫は CAMP storage へ", camp["storage"][ResourceSystem.FRUIT], 3)
	_eq("14. プレイヤーの carry には入らない", res.carried_total(), 0)
	_ok("15. BASE と CAMP の storage は混ざらない",
		base["storage"][ResourceSystem.FRUIT] != camp["storage"][ResourceSystem.FRUIT])

# ── 21: FLINT は労働対象外 ───────────────────────────────────────
func _test_flint_never_worked() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var base: Dictionary = w["base"]
	base["population"] = 12
	for job in SettlementSystem.JOB_ORDER:
		st.set_workers(base, job, 3)
	var flint := _place(res, 11, 10, ResourceSystem.FLINT)
	st.work_settlement(base, res)
	_eq("21. FLINT は労働者に採られない", flint["remaining"], 5)
	_eq("21. FLINT は storage に入らない", base["storage"].get(ResourceSystem.FLINT, 0), 0)
	_ok("21. FLINT を担当する仕事が存在しない",
		not SettlementSystem.JOB_RESOURCE.values().has(ResourceSystem.FLINT))

# ── 16,17: 人口と圧の有無 ────────────────────────────────────────
func _test_pressure_needs_population() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var ts: TurnSystem = w["turns"]
	_stock_build(w["base"])
	var camp: Dictionary = st.build_camp(Vector2i(18, 18))["settlement"]
	var node := _place(res, 19, 18, ResourceSystem.FRUIT)
	_eq("16. 無人 CAMP の圧は 0", st.settlement_pressure(camp), 0.0)
	_advance(ts, 200)
	_eq("16. 無人 CAMP の周辺は減らない", node["remaining"], 3)
	_eq("16. 圧の端数も溜まらない", node["pressure"], 0.0)
	camp["population"] = 8
	_ok("17. 有人 CAMP は圧を持つ", st.settlement_pressure(camp) > 0.0)
	_advance(ts, 200)
	_ok("17. 有人 CAMP の周辺は減る (%d/3)" % node["remaining"], node["remaining"] < 3)

# ── 18,19: 圧の強さ ──────────────────────────────────────────────
## 人口 pop / 労働者 workers で 1ノードに溜まる圧を測る。
func _pressure_after(pop: int, workers: int, turns: int) -> float:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var ts: TurnSystem = w["turns"]
	w["base"]["population"] = pop
	if workers > 0:
		st.set_workers(w["base"], SettlementSystem.JOB_STONE, workers)  # 採集対象を置かない
	var node := _place(res, 11, 10, ResourceSystem.WOOD)
	node["remaining"] = 99                                # 削られても測れるよう十分に
	node["max_remaining"] = 99
	_advance(ts, turns)
	return float(99 - node["remaining"]) + float(node["pressure"])

func _test_pressure_scales() -> void:
	var p5 := _pressure_after(5, 0, 100)
	var p15 := _pressure_after(15, 0, 100)
	var p25 := _pressure_after(25, 0, 100)
	_ok("18. POP5 %.3f < POP15 %.3f < POP25 %.3f" % [p5, p15, p25], p5 < p15 and p15 < p25)
	_ok("18. 圧は人口に比例する (POP15 ≒ POP5 x3)", absf(p15 - p5 * 3.0) < 0.01)
	var w0 := _pressure_after(15, 0, 100)
	var w3 := _pressure_after(15, 3, 100)
	var w6 := _pressure_after(15, 6, 100)
	_ok("19. 労働者 0 %.3f < 3 %.3f < 6 %.3f" % [w0, w3, w6], w0 < w3 and w3 < w6)
	_ok("19. 労働者は重み 2.0 で効く",
		absf((w3 - w0) - (w0 / 15.0) * 3.0 * SettlementSystem.SETTLEMENT_WORKER_WEIGHT) < 0.01)

# ── 20: 距離減衰 ─────────────────────────────────────────────────
func _test_pressure_distance() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var res: ResourceSystem = w["resources"]
	var ts: TurnSystem = w["turns"]
	w["base"]["population"] = 20
	var near := _place(res, 11, 10, ResourceSystem.WOOD)   # 距離 1
	var mid := _place(res, 13, 10, ResourceSystem.WOOD)    # 距離 3
	var far := _place(res, 14, 10, ResourceSystem.WOOD)    # 距離 4
	var out := _place(res, 15, 10, ResourceSystem.WOOD)    # 距離 5 = 半径ちょうど → 係数0
	for n in [near, mid, far, out]:
		n["remaining"] = 99
		n["max_remaining"] = 99
	_advance(ts, 100)
	var dn: float = 99 - near["remaining"] + near["pressure"]
	var dm: float = 99 - mid["remaining"] + mid["pressure"]
	var df: float = 99 - far["remaining"] + far["pressure"]
	_ok("20. 近いほど強い d1 %.3f > d3 %.3f > d4 %.3f" % [dn, dm, df], dn > dm and dm > df)
	_eq("20. 半径ちょうど (d5) は圧ゼロ", out["remaining"], 99)
	# 拠点タイルそのものは対象外
	var center := _place(res, 10, 10, ResourceSystem.WOOD)
	center["remaining"] = 99
	_advance(ts, 100)
	_eq("20. 拠点タイルは対象外", center["remaining"], 99)

# ── 5(資源別): 枯れやすさ ────────────────────────────────────────
func _test_pressure_fragility() -> void:
	var w := _make_world()
	var res: ResourceSystem = w["resources"]
	var ts: TurnSystem = w["turns"]
	w["base"]["population"] = 20
	var kinds := [ResourceSystem.FRUIT, ResourceSystem.WOOD,
		ResourceSystem.STONE, ResourceSystem.FLINT]
	var placed := {}
	for i in kinds.size():
		var n := _place(res, 11, 8 + i, kinds[i])          # 全て距離 2 前後に揃える
		n["remaining"] = 99
		n["max_remaining"] = 99
		placed[kinds[i]] = n
	# 距離を完全に揃えるため、同じ距離のタイルに置き直す
	res.nodes.clear()
	var spots := [Vector2i(11, 10), Vector2i(9, 10), Vector2i(10, 11), Vector2i(10, 9)]
	for i in kinds.size():
		var n := _place(res, spots[i].x, spots[i].y, kinds[i])
		n["remaining"] = 999
		n["max_remaining"] = 999
		placed[kinds[i]] = n
	_advance(ts, 300)
	var d := {}
	for k in kinds:
		d[k] = 999 - placed[k]["remaining"] + placed[k]["pressure"]
	_ok("資源別: FRUIT %.2f > WOOD %.2f > STONE %.2f > FLINT %.2f"
		% [d[ResourceSystem.FRUIT], d[ResourceSystem.WOOD],
		   d[ResourceSystem.STONE], d[ResourceSystem.FLINT]],
		d[ResourceSystem.FRUIT] > d[ResourceSystem.WOOD]
		and d[ResourceSystem.WOOD] > d[ResourceSystem.STONE]
		and d[ResourceSystem.STONE] > d[ResourceSystem.FLINT])
	_ok("資源別: FLINT も環境圧ではゼロではない", d[ResourceSystem.FLINT] > 0.0)

# ── 22: 移住後の整合 ─────────────────────────────────────────────
func _test_migration_clamps_workers() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var base: Dictionary = w["base"]
	_stock_build(base)
	var camp: Dictionary = st.build_camp(Vector2i(16, 10))["settlement"]
	base["population"] = 6
	st.set_workers(base, SettlementSystem.JOB_FOOD, 2)
	st.set_workers(base, SettlementSystem.JOB_WOOD, 2)
	st.set_workers(base, SettlementSystem.JOB_STONE, 1)
	_eq("22. 移住前 5人が就労中", st.assigned_workers(base), 5)
	var r := st.send_population_to_camp(camp)
	_ok("22. 移住成功", r["ok"])
	_eq("22. BASE 人口 4", st.get_population(base), 4)
	_eq("22. 就労は 3 (population-1) に補正される", st.assigned_workers(base), 3)
	_ok("22. 割当 <= max(population-1, 0) を守る",
		st.assigned_workers(base) <= st.max_workers(base))
	_eq("22. 解除は STONE から (FOOD は残す)",
		st.get_workers(base)[SettlementSystem.JOB_STONE], 0)
	_eq("22. FOOD は削られていない", st.get_workers(base)[SettlementSystem.JOB_FOOD], 2)
	_eq("22. released が返る", r["released"], 2)
	# 人口 1 まで落ちたら全員解除
	base["population"] = 1
	st.clamp_workers(base)
	_eq("22. POP1 では就労者 0", st.assigned_workers(base), 0)

# ── 23: Phase 2E の回帰 ──────────────────────────────────────────
func _test_2e_still_works() -> void:
	var w := _make_world()
	var st: SettlementSystem = w["settlements"]
	var ts: TurnSystem = w["turns"]
	var base: Dictionary = w["base"]
	var iv := SettlementSystem.FOOD_INTERVAL_TURNS
	base["storage"][ResourceSystem.FRUIT] = 30
	_advance(ts, iv)
	_eq("23. 食料周期は健在 (POP6 → -6)",
		base["storage"][ResourceSystem.FRUIT], 24)
	_eq("23. 人口は据え置き", st.get_population(base), 6)
	# 成長
	base["growth_progress"] = 0.999
	ts.advance_turn()
	_eq("23. 人口成長は生きている", st.get_population(base), 7)
	# 不足
	base["storage"][ResourceSystem.FRUIT] = 0
	_advance(ts, iv - 1)                                  # 次の食料周期まで
	_ok("23. 食料不足は立つ", st.has_food_shortage(base))
	_eq("23. 不足でも人口は減らない", st.get_population(base), 7)
	_eq("23. HUD の POP 行は健在", st.storage_text(base).substr(0, 14), "BASE POP 07/30")
