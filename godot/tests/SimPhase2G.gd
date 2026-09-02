extends SceneTree
##
## Phase 2G のバランス計測 (初期立地 + 食料消費)。
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tests/SimPhase2G.gd
##
## 見たいのは「BASE だけで永久に安定しないが、序盤は暮らせる」かどうか。

const SEEDS := [12345, 20260902, 777, 4242, 99991, 31337, 555, 87654, 2468, 13579]
const TURNS := 300

func _init() -> void:
	_header("BASE 半径4 の資源ノード数 (%d seeds 平均)" % SEEDS.size())
	_survey_kinds(SettlementSystem.WORK_RADIUS)
	_survey_kinds(SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)

	_header("食料収支 %d ターン (FOOD_INTERVAL=%d)" % [TURNS, SettlementSystem.FOOD_INTERVAL_TURNS])
	print("  POP / FOOD |  消費   採集   充足率   最終備蓄  周辺FRUIT残  不足ターン")
	for row in [[6, 0], [6, 1], [6, 2], [15, 1], [15, 3], [15, 5], [25, 3], [25, 5], [25, 8]]:
		_run(row[0], row[1])

	_header("CAMP の価値: BASE が枯れた後、新しい FRUIT 圏がどれだけ残っているか")
	_camp_value()
	quit()

func _header(t: String) -> void:
	print("\n== %s ==" % t)

func _build(seed_value: int) -> Dictionary:
	var gen := MapGenerator.new()
	var tiles := gen.generate(seed_value)
	var res := ResourceSystem.new()
	res.generate(tiles, seed_value)
	res.reset_inventory()
	var st := SettlementSystem.new()
	st.setup(tiles)
	var base := st.create_base(gen.find_spawn(tiles))
	var ts := TurnSystem.new()
	ts.resources = res
	ts.settlements = st
	return {"tiles": tiles, "resources": res, "settlements": st, "base": base, "turns": ts}

func _survey_kinds(radius: int) -> void:
	var counts := {}
	for r in ResourceSystem.ORDER:
		counts[r] = 0.0
	for sv in SEEDS:
		var w := _build(sv)
		var res: ResourceSystem = w["resources"]
		for pos in res.get_nodes_in_radius(w["base"]["position"], radius, "", false):
			counts[res.node_at(pos.x, pos.y)["type"]] += 1.0
	var parts: Array[String] = []
	for r in ResourceSystem.ORDER:
		parts.append("%s %.1f" % [ResourceSystem.SHORT_LABELS[r], counts[r] / SEEDS.size()])
	print("  半径%d: %s" % [radius, "   ".join(parts)])

## 備蓄0から始めて、労働者の自動採集だけで何ターン食えるかを測る。
## プレイヤーの手採集は入れていない (自動化ぶんの素の実力を見るため)。
func _run(pop: int, food_workers: int) -> void:
	var eaten := 0.0
	var got := 0.0
	var stock := 0.0
	var left := 0.0
	var short_turns := 0.0
	var samples := 0
	for sv in SEEDS:
		var w := _build(sv)
		var st: SettlementSystem = w["settlements"]
		var res: ResourceSystem = w["resources"]
		var ts: TurnSystem = w["turns"]
		var base: Dictionary = w["base"]
		base["population"] = pop
		st.set_workers(base, SettlementSystem.JOB_FOOD, food_workers)
		var before := res.get_nodes_in_radius(base["position"],
			SettlementSystem.SETTLEMENT_PRESSURE_RADIUS, ResourceSystem.FRUIT, false)
		var before_units := 0
		for p in before:
			before_units += int(res.node_at(p.x, p.y)["remaining"])
		var e := 0
		var g := 0
		var sh := 0
		for t in TURNS:
			base["population"] = pop        # 人口成長を止めて条件を揃える
			ts.advance_turn()
			for r in ts.last_events.get("food", []):
				e += int(r["need"])
			for r in ts.last_events.get("work", []):
				g += int(r["gathered"].get(SettlementSystem.JOB_FOOD, 0))
			if st.has_food_shortage(base):
				sh += 1
		eaten += float(e)
		got += float(g)
		stock += float(base["storage"][ResourceSystem.FRUIT])
		short_turns += 100.0 * float(sh) / float(TURNS)
		var after_units := 0
		for p in res.get_nodes_in_radius(base["position"],
				SettlementSystem.SETTLEMENT_PRESSURE_RADIUS, ResourceSystem.FRUIT, false):
			after_units += int(res.node_at(p.x, p.y)["remaining"])
		if before_units > 0:
			left += 100.0 * float(after_units) / float(before_units)
		samples += 1
	var n := float(samples)
	var need := eaten / n
	print("  POP%2d / F%d | %5.1f  %5.1f   %5.1f%%    %5.1f      %5.1f%%      %5.1f%%" % [
		pop, food_workers, need, got / n,
		100.0 * (got / n) / maxf(need, 1.0), stock / n, left / n, short_turns / n])

## BASE 周辺が枯れた後、離れた場所にどれだけ FRUIT が残っているか。
## ここが厚いままなら「CAMP を建てて新しい生活圏を使う」動機が残る。
func _camp_value() -> void:
	var near_left := 0.0
	var far_units := 0.0
	var far_best := 0.0
	for sv in SEEDS:
		var w := _build(sv)
		var st: SettlementSystem = w["settlements"]
		var res: ResourceSystem = w["resources"]
		var base: Dictionary = w["base"]
		base["population"] = 20
		st.set_workers(base, SettlementSystem.JOB_FOOD, 5)
		# can_build_camp() は BASE が設営資材を払えるかも見るので積んでおく
		base["storage"][ResourceSystem.WOOD] = 99
		base["storage"][ResourceSystem.STONE] = 99
		var center: Vector2i = base["position"]
		var b := _fruit_units(res, center, SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		for t in TURNS:
			base["population"] = 20
			w["turns"].advance_turn()
		var a := _fruit_units(res, center, SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		if b > 0:
			near_left += 100.0 * float(a) / float(b)
		# BASE から 12 マス以上離れた場所の最良 FRUIT 圏
		var total := 0
		var best := 0
		for y in range(2, MapGenerator.MAP_H - 2):
			for x in range(2, MapGenerator.MAP_W - 2):
				var p := Vector2i(x, y)
				if Vector2(p - center).length() < 12.0:
					continue
				if not st.can_build_camp(p):
					continue
				var u := _fruit_units(res, p, SettlementSystem.WORK_RADIUS)
				total += u
				best = maxi(best, u)
		far_units += float(total)
		far_best += float(best)
	var n := float(SEEDS.size())
	print("  POP20/F5 を %d ターン: BASE 周辺 FRUIT 残存 %.1f%%" % [TURNS, near_left / n])
	print("  同時点で BASE から12マス以上離れた候補地の最良 FRUIT 圏 (半径4): %.1f 個" % (far_best / n))

func _fruit_units(res: ResourceSystem, center: Vector2i, radius: int) -> int:
	var units := 0
	for p in res.get_nodes_in_radius(center, radius, ResourceSystem.FRUIT, false):
		units += int(res.node_at(p.x, p.y)["remaining"])
	return units
