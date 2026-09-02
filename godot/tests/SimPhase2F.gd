extends SceneTree
##
## Phase 2F のバランス計測 (テストではなく観測用)。
##   /Applications/Godot.app/Contents/MacOS/Godot --headless --path godot \
##       --script res://tests/SimPhase2F.gd
##
## 実際に生成されるマップの上で BASE 周辺がどれくらいの速さで痩せるかを測る。
## 数字を目で見て定数を決めるためのもので、CI で通す類のものではない。

const SEEDS := [12345, 20260902, 777, 4242, 99991]
const TURNS := 300

func _init() -> void:
	_header("BASE周辺の資源 (半径5) が %d ターンでどれだけ残るか" % TURNS)
	print("  pop / workers |  残存%   枯渇ノード   収穫(W+S)")
	for pop in [5, 15, 25]:
		for workers in [0, 3, 6]:
			if workers > maxi(pop - 1, 0):
				continue
			_run_case(pop, workers)
	_header("無人CAMP と 有人CAMP (POP8/FOOD3) の周辺 %d ターン" % TURNS)
	_run_camp_case(0, 0)
	_run_camp_case(8, 0)
	_run_camp_case(8, 3)
	_header("FOOD worker を増やしたときの実収穫 (POP15)")
	for r in [SettlementSystem.WORK_RADIUS, 6, 8]:
		_survey_kinds(r)
	print("  workers |  100T収穫  300T収穫   半径5残存%")
	for fw in [0, 1, 3, 6, 9]:
		_run_food_case(fw)
	_header("STONE worker (BASE周辺で実際に豊富な資源) POP15")
	print("  workers |  100T収穫  300T収穫   半径5残存%")
	for sw in [0, 1, 3, 6, 9]:
		_run_food_case(sw, SettlementSystem.JOB_STONE)
	_header("食料収支 (1ターンあたり)")
	for pop in [6, 10, 15, 20, 25]:
		_food_balance(pop)
	quit()

## FOOD 労働者だけを変えて、実際に何個 FRUIT が入るかを測る。
## 収穫は storage の差分ではなく TurnSystem の労働イベントから数える
## (同じ周期に食料消費が走ると差分では収穫が見えなくなるため)。
func _run_food_case(food_workers: int, job: String = SettlementSystem.JOB_FOOD) -> void:
	var h100 := 0.0
	var h300 := 0.0
	var left := 0.0
	var samples := 0
	for sv in SEEDS:
		var w := _build(sv)
		var st: SettlementSystem = w["settlements"]
		var res: ResourceSystem = w["resources"]
		var ts: TurnSystem = w["turns"]
		var base: Dictionary = w["base"]
		base["population"] = 15
		st.set_workers(base, job, food_workers)
		var before := _survey(res, base["position"], SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		if before["units"] == 0:
			continue
		var got := 0
		for t in 300:
			base["storage"][ResourceSystem.FRUIT] = 9999   # 飢餓を計測から外す
			ts.advance_turn()
			for r in ts.last_events.get("work", []):
				got += int(r["gathered"].get(job, 0))
			if t == 99:
				h100 += float(got)
		h300 += float(got)
		var after := _survey(res, base["position"], SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		left += 100.0 * float(after["units"]) / float(before["units"])
		samples += 1
	if samples == 0:
		return
	print("  %-5s %d  |  %6.1f   %6.1f      %5.1f%%" % [
		SettlementSystem.JOB_LABELS[job], food_workers,
		h100 / samples, h300 / samples, left / samples])

## BASE 周辺に何がどれだけあるのかを資源種別に数える。
## 「FOOD worker を置ける土地なのか」を確かめるための計測。
func _survey_kinds(radius: int) -> void:
	var counts := {}
	for r in ResourceSystem.ORDER:
		counts[r] = 0.0
	var samples := 0
	for sv in SEEDS:
		var w := _build(sv)
		var res: ResourceSystem = w["resources"]
		for pos in res.get_nodes_in_radius(w["base"]["position"], radius, "", false):
			counts[res.node_at(pos.x, pos.y)["type"]] += 1.0
		samples += 1
	var parts: Array[String] = []
	for r in ResourceSystem.ORDER:
		parts.append("%s %.1f" % [ResourceSystem.SHORT_LABELS[r], counts[r] / samples])
	print("  半径%d: %s  (BASE周辺のノード数 平均)" % [radius, "  ".join(parts)])

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

## 半径内の資源総量 (remaining の合計) と枯渇ノード数。
func _survey(res: ResourceSystem, center: Vector2i, radius: int) -> Dictionary:
	var units := 0
	var depleted := 0
	var total := 0
	for pos in res.get_nodes_in_radius(center, radius, "", false):
		var n := res.node_at(pos.x, pos.y)
		total += 1
		units += int(n["remaining"])
		if n["remaining"] <= 0:
			depleted += 1
	return {"units": units, "depleted": depleted, "nodes": total}

func _run_case(pop: int, workers: int) -> void:
	var left := 0.0
	var depleted := 0.0
	var harvest := 0.0
	var samples := 0
	for sv in SEEDS:
		var w := _build(sv)
		var st: SettlementSystem = w["settlements"]
		var res: ResourceSystem = w["resources"]
		var base: Dictionary = w["base"]
		base["population"] = pop
		# 食料/木/石へ均等に散らす (偏らせると資源ごとの差が出てしまう)
		var jobs := SettlementSystem.JOB_ORDER
		for i in workers:
			st.set_workers(base, jobs[i % jobs.size()],
				int(st.get_workers(base).get(jobs[i % jobs.size()], 0)) + 1)
		base["storage"][ResourceSystem.FRUIT] = 99999   # 飢餓で成長が止まらないように
		var before := _survey(res, base["position"], SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		if before["nodes"] == 0:
			continue
		for i in TURNS:
			w["turns"].advance_turn()
		var after := _survey(res, base["position"], SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		left += 100.0 * float(after["units"]) / float(maxi(before["units"], 1))
		depleted += float(after["depleted"])
		harvest += float(int(base["storage"][ResourceSystem.WOOD])
			+ int(base["storage"][ResourceSystem.STONE]))
		samples += 1
	if samples == 0:
		return
	print("  POP%2d / W%d     | %5.1f%%      %4.1f     %5.1f" % [
		pop, workers, left / samples, depleted / samples, harvest / samples])

func _run_camp_case(pop: int, workers: int) -> void:
	var left := 0.0
	var samples := 0
	for sv in SEEDS:
		var w := _build(sv)
		var st: SettlementSystem = w["settlements"]
		var res: ResourceSystem = w["resources"]
		var base: Dictionary = w["base"]
		base["storage"][ResourceSystem.WOOD] = 99
		base["storage"][ResourceSystem.STONE] = 99
		base["population"] = 1                          # BASE 側の影響を消す
		# BASE から十分離れた場所に CAMP を建てる
		var found = _find_camp_spot(st, res, base["position"])
		if found == null:
			continue
		var spot: Vector2i = found
		var camp: Dictionary = st.build_camp(spot)["settlement"]
		if camp.is_empty():
			continue
		camp["population"] = pop
		for i in workers:
			st.set_workers(camp, SettlementSystem.JOB_ORDER[i % 3],
				int(st.get_workers(camp).get(SettlementSystem.JOB_ORDER[i % 3], 0)) + 1)
		var before := _survey(res, spot, SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		if before["units"] < 20:
			continue
		for i in TURNS:
			w["turns"].advance_turn()
		var after := _survey(res, spot, SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
		left += 100.0 * float(after["units"]) / float(before["units"])
		samples += 1
	if samples == 0:
		print("  (計測できる CAMP 適地なし)")
		return
	var label := "無人CAMP" if pop == 0 else "有人CAMP POP%d W%d" % [pop, workers]
	print("  %-20s 周辺資源 残存 %5.1f%%  (%d seeds)" % [label, left / samples, samples])

## BASE から離れた、資源が多い設営適地を探す。
func _find_camp_spot(st: SettlementSystem, res: ResourceSystem, base_pos: Vector2i):
	var best = null
	var best_units := 0
	for y in range(2, MapGenerator.MAP_H - 2):
		for x in range(2, MapGenerator.MAP_W - 2):
			var p := Vector2i(x, y)
			if Vector2(p - base_pos).length() < 12.0:
				continue
			if not st.can_build_camp(p):
				continue
			var s := _survey(res, p, SettlementSystem.SETTLEMENT_PRESSURE_RADIUS)
			if s["units"] > best_units:
				best_units = s["units"]
				best = p
	return best

## 1ターンあたりの食料収支。
##   消費 = population * FOOD_PER_PERSON / FOOD_INTERVAL_TURNS
##   生産 = food_workers * WORK_YIELD_PER_WORKER / WORK_INTERVAL_TURNS
func _food_balance(pop: int) -> void:
	var eat := float(pop * SettlementSystem.FOOD_PER_PERSON) \
		/ float(SettlementSystem.FOOD_INTERVAL_TURNS)
	var per_worker := float(SettlementSystem.WORK_YIELD_PER_WORKER) \
		/ float(SettlementSystem.WORK_INTERVAL_TURNS)
	var need := ceili(eat / per_worker)
	var max_w := maxi(pop - SettlementSystem.NON_WORKER_POPULATION, 0)
	print("  POP%2d  消費 %.1f/T   自給に必要な FOOD worker %d 人 (労働可能 %d 人 = %d%%)" % [
		pop, eat, need, max_w, int(100.0 * float(need) / float(maxi(max_w, 1)))])
