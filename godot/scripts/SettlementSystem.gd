extends RefCounted
class_name SettlementSystem
##
## 拠点 (BASE / CAMP) と、その備蓄・人口・労働 (Phase 2B → 2F)。
##
## Phase 2F の位置づけ:
##   BASE   … ゲーム開始地点。唯一。最初から人がいる。
##   CAMP   … 遠征用の中継拠点。設置時は無人。人を送ると有人になる。
##
## 拠点1件の形:
##   {
##       "type": "BASE"|"CAMP",
##       "position": Vector2i,
##       "storage": { fruit:0, wood:0, stone:0, flint:0 },
##       "population": int,
##       "growth_progress": float,   # 端数の人口。1.0 を超えたら +1 人
##       "food_shortage": bool,      # 直近の食料周期で必要量を払えなかったか
##       "workers": { food:0, wood:0, stone:0 },
##       "job_cursor": String,       # UI で選択中の仕事 (割当ボタンの対象)
##   }
##
## 備蓄も人口も拠点ごとに完全に独立。BASE と CAMP、CAMP 同士の輸送/共有は無い。
## CAMP の人間が BASE の食料を食べることは無い (集落は自分の備蓄だけで食う)。
##
## Phase 2F で繋がる循環:
##   人口が増える → 一部を仕事に割り当てる → 拠点周辺から自動採集する
##   → 近場が枯れる → 遠くへ出る必要が出る → CAMP を建てる意味が増える
##   → CAMP へ人を送る → 新しい生活圏を使う
##
## 無人 CAMP は「収納場所」、有人 CAMP は「生活圏」。この差が今回の要。
##
## Phase 2F で入れないもの (意図的):
##   - FLINT 専従労働者   … 火打石は自分の足で探す希少資源のまま残す
##   - 餓死 / 人口減少     … 不足はまず「成長が止まる」だけで見せる
##   - CAMP 間輸送 / 備蓄共有 / 建物 / 生産チェーン … 都市化の手前で止める

const TYPE_BASE := "BASE"
const TYPE_CAMP := "CAMP"

## CAMP 上限。文明進行や人口で増やせるよう定数にしてある。
const MAX_CAMPS := 4

## CAMP 設置コスト。BASE の備蓄から支払う。
## 「遠征前に本拠地で用意した資材を使って設営する」扱いなので、
## 設置地点でプレイヤーが何を持っているかは関係しない。
const CAMP_COST := {
	ResourceSystem.WOOD: 3,
	ResourceSystem.STONE: 1,
}

## CAMP を設置できる地形。生活できる陸地だけ。
## 海/川/山は不可 (山は「登れるが住めない」という Canvas版の感覚に合わせる)。
const CAMP_TILES := [
	MapGenerator.Tile.GRASS,
	MapGenerator.Tile.FOREST,
	MapGenerator.Tile.DEEP_FOREST,
]

# ── 人口 (Phase 2E) ──────────────────────────────────────────────
## 「小さな集落・群れ」の規模。都市化する数字にはしない。
## いずれ文明段階や建物で押し上げる想定なので全て定数にしてある。
const BASE_INITIAL_POPULATION := 6
const BASE_POPULATION_CAP := 30
const CAMP_POPULATION_CAP := 12

## 1ターンあたりの成長率。現在人口に掛かるので、人が多いほど速く増える。
## 0.002 だと POP6 で +1 まで約100ターン、POP15 で約67ターン。
## 「数十〜数百ターンで集落の顔つきが変わる」速度をここで決める。
const GROWTH_RATE_PER_TURN := 0.002

## 食料 (FRUIT) の消費。毎ターン全員ぶんは重すぎるので周期でまとめて引く。
##   FOOD_INTERVAL_TURNS ターンごとに  必要量 = population * FOOD_PER_PERSON
##
## Phase 2G で 10 → 30 に緩和。10 のままだと POP15 で 1.5 個/ターンとなり、
## 果物ノードの密度と regrow (80-100ターン) では労働者を何人置いても届かなかった。
## 30 なら序盤は FOOD 労働者1〜2人で回り、人口が増えると足りなくなる。
const FOOD_INTERVAL_TURNS := 30
const FOOD_PER_PERSON := 1

## 移住1回で動く人数。
const SEND_POP_AMOUNT := 2

## 移住後に BASE に最低限残す人数。BASE を空にする移住は認めない。
const BASE_MIN_POPULATION := 1

# ── 労働 (Phase 2F) ──────────────────────────────────────────────
## 仕事は3種類だけ。FLINT 専従は作らない
## (火打石はプレイヤーが自分の足で探す希少資源のまま残す)。
const JOB_FOOD := "food"
const JOB_WOOD := "wood"
const JOB_STONE := "stone"
const JOB_ORDER: Array[String] = [JOB_FOOD, JOB_WOOD, JOB_STONE]

## 仕事 → 実際に採る資源。
const JOB_RESOURCE := {
	JOB_FOOD: ResourceSystem.FRUIT,
	JOB_WOOD: ResourceSystem.WOOD,
	JOB_STONE: ResourceSystem.STONE,
}

const JOB_SHORT := {JOB_FOOD: "F", JOB_WOOD: "W", JOB_STONE: "S"}
const JOB_LABELS := {JOB_FOOD: "FOOD", JOB_WOOD: "WOOD", JOB_STONE: "STONE"}

## 労働に回せない人数。子供・老人・見張りのぶん。
## これがあるので「人口 = 労働力」にはならない。
const NON_WORKER_POPULATION := 1

## 労働処理の間隔と収量。1周期で 労働者1人 = 最大1資源。
const WORK_INTERVAL_TURNS := 5
const WORK_YIELD_PER_WORKER := 1

## 労働者が通える範囲。拠点からこの半径内しか使えないので、
## 近場が枯れると「拠点ごと動かす (= CAMP)」しか手が無くなる。
const WORK_RADIUS := 4

## 生活圧の範囲。労働範囲より少し広い
## (通う範囲の外側にも、住んでいるだけで薄く影響が出る)。
const SETTLEMENT_PRESSURE_RADIUS := 5

## 労働者は非労働人口より環境を強く削る (実際に資源地へ通うため)。
const SETTLEMENT_WORKER_WEIGHT := 2.0

## 圧の全体係数。ここを触るとマップの痩せ方が丸ごと変わる。
const SETTLEMENT_PRESSURE_COEF := 0.002

# ── 設置できない理由 ─────────────────────────────────────────────
# ログ表示と分岐の両方で使うので文字列コードにしておく。
const OK := ""
const REASON_TERRAIN := "TERRAIN"     # 地形が不適
const REASON_OCCUPIED := "OCCUPIED"   # 既に拠点がある
const REASON_LIMIT := "LIMIT"         # CAMP 上限
const REASON_COST := "COST"           # BASE の備蓄が足りない

# 移住できない理由 (Phase 2E)
const REASON_NOT_CAMP := "NOT_CAMP"   # CAMP の上にいない
const REASON_BASE_LOW := "BASE_LOW"   # BASE の人口が少なすぎる
const REASON_CAMP_FULL := "CAMP_FULL" # CAMP の人口上限

## 拠点リスト。[0] が BASE とは限らない前提で扱う (get_base() を通す)。
var settlements: Array[Dictionary] = []

## 地形判定に使うマップ。Main から setup() で渡す。
## これを持たせることで「ここに建てられるか」の判断が Main に漏れない。
var tiles: Array = []

func setup(p_tiles: Array) -> void:
	tiles = p_tiles

func reset() -> void:
	settlements.clear()

## 拠点を作る。備蓄は全資源種を 0 で初期化しておく (キー欠けを気にしなくて済む)。
## 人口は既定 0。CAMP は「設置しただけでは無人」であることをここで表す。
func add_settlement(type: String, position: Vector2i, population: int = 0) -> Dictionary:
	var storage := {}
	for r in ResourceSystem.ORDER:
		storage[r] = 0
	var workers := {}
	for job in JOB_ORDER:
		workers[job] = 0
	var s := {
		"type": type,
		"position": position,
		"storage": storage,
		"population": population,
		"growth_progress": 0.0,
		"food_shortage": false,
		"workers": workers,
		"job_cursor": JOB_FOOD,
	}
	settlements.append(s)
	return s

## ゲーム開始時の BASE を作る。最初から人がいる唯一の拠点。
func create_base(position: Vector2i) -> Dictionary:
	return add_settlement(TYPE_BASE, position, BASE_INITIAL_POPULATION)

# ── 参照 ─────────────────────────────────────────────────────────
## その座標にある拠点。無ければ空辞書。
func settlement_at(x: int, y: int) -> Dictionary:
	for s in settlements:
		var p: Vector2i = s["position"]
		if p.x == x and p.y == y:
			return s
	return {}

func has_settlement_at(x: int, y: int) -> bool:
	return not settlement_at(x, y).is_empty()

## 唯一の BASE。
func get_base() -> Dictionary:
	for s in settlements:
		if s["type"] == TYPE_BASE:
			return s
	return {}

func get_camps() -> Array[Dictionary]:
	var camps: Array[Dictionary] = []
	for s in settlements:
		if s["type"] == TYPE_CAMP:
			camps.append(s)
	return camps

func camp_count() -> int:
	return get_camps().size()

func get_storage(settlement: Dictionary) -> Dictionary:
	if settlement.is_empty():
		return {}
	return settlement["storage"]

# ── CAMP 設置 ────────────────────────────────────────────────────
## 設置できない理由を返す。OK ("") なら建てられる。
## 判定順は「その場で分かること → 資材」。地形不適なのに
## 「資材不足」と出るような紛らわしいログを避ける。
func camp_block_reason(position: Vector2i) -> String:
	if has_settlement_at(position.x, position.y):
		return REASON_OCCUPIED
	if not _is_camp_terrain(position):
		return REASON_TERRAIN
	if camp_count() >= MAX_CAMPS:
		return REASON_LIMIT
	if not _base_can_pay():
		return REASON_COST
	return OK

func can_build_camp(position: Vector2i) -> bool:
	return camp_block_reason(position) == OK

## CAMP を建てる。成否と理由を返す。
##   { "ok": bool, "reason": String, "settlement": Dictionary }
## 失敗時は何も変更しない (呼び出し側がターンを消費しないで済む)。
func build_camp(position: Vector2i) -> Dictionary:
	var reason := camp_block_reason(position)
	if reason != OK:
		return {"ok": false, "reason": reason, "settlement": {}}
	_pay_camp_cost()
	var camp := add_settlement(TYPE_CAMP, position)
	return {"ok": true, "reason": OK, "settlement": camp}

func _is_camp_terrain(position: Vector2i) -> bool:
	if tiles.is_empty():
		return false
	if position.y < 0 or position.y >= tiles.size():
		return false
	var row: Array = tiles[position.y]
	if position.x < 0 or position.x >= row.size():
		return false
	return CAMP_TILES.has(int(row[position.x]))

func _base_can_pay() -> bool:
	var base := get_base()
	if base.is_empty():
		return false
	var storage: Dictionary = base["storage"]
	for r in CAMP_COST:
		if storage.get(r, 0) < CAMP_COST[r]:
			return false
	return true

func _pay_camp_cost() -> void:
	var storage: Dictionary = get_base()["storage"]
	for r in CAMP_COST:
		storage[r] = storage.get(r, 0) - CAMP_COST[r]

# ── 納入 ─────────────────────────────────────────────────────────
## 拠点へ資源を積む。実際に積んだ合計個数を返す。
func deposit(settlement: Dictionary, amounts: Dictionary) -> int:
	var total := 0
	var storage: Dictionary = settlement["storage"]
	for r in amounts:
		var n: int = amounts[r]
		if n <= 0:
			continue
		storage[r] = storage.get(r, 0) + n
		total += n
	return total

## 立っている座標の拠点へ納入する。BASE / CAMP を区別しない。
## 拠点が無ければ -1 (呼び出し側で「拠点外」として扱う)。
func deposit_to_settlement(position: Vector2i, amounts: Dictionary) -> int:
	var s := settlement_at(position.x, position.y)
	if s.is_empty():
		return -1
	return deposit(s, amounts)

# ── 人口 ─────────────────────────────────────────────────────────
func get_population(settlement: Dictionary) -> int:
	if settlement.is_empty():
		return 0
	return int(settlement.get("population", 0))

## 拠点種別ごとの人口上限。BASE の方が多く抱えられる。
func get_population_cap(settlement: Dictionary) -> int:
	if settlement.is_empty():
		return 0
	if settlement["type"] == TYPE_BASE:
		return BASE_POPULATION_CAP
	return CAMP_POPULATION_CAP

func has_food_shortage(settlement: Dictionary) -> bool:
	if settlement.is_empty():
		return false
	return bool(settlement.get("food_shortage", false))

## 全拠点の人口合計 (Phase 2F の労働力プールの下地)。
func total_population() -> int:
	var total := 0
	for s in settlements:
		total += get_population(s)
	return total

## 1ターンぶんの人口成長。
##
## 固定 +1 ではなく現在人口に比例させる (POP15 は POP5 より速い)。
## さらに上限に近いほど space_factor で鈍らせ、
## 「小さく指数、上限手前で頭打ち」の形にする。
##   growth = population * GROWTH_RATE_PER_TURN * (1 - population / cap)
##
## 成長するのは「食料不足でない」かつ「上限未満」のときだけ。
## 増えた人数を返す (ログ用。通常は 0 か 1)。
func update_population_growth(settlement: Dictionary) -> int:
	if settlement.is_empty():
		return 0
	var population := get_population(settlement)
	if population <= 0:
		return 0
	if has_food_shortage(settlement):
		return 0
	var cap := get_population_cap(settlement)
	if population >= cap:
		return 0
	var space_factor := 1.0 - float(population) / float(cap)
	var progress: float = float(settlement.get("growth_progress", 0.0))
	progress += float(population) * GROWTH_RATE_PER_TURN * space_factor
	var born := 0
	while progress >= 1.0 and population + born < cap:
		born += 1
		progress -= 1.0
	# 上限に達したら端数は持ち越さない (上限で溜め込んで一気に増えるのを防ぐ)
	if population + born >= cap:
		progress = 0.0
	settlement["population"] = population + born
	settlement["growth_progress"] = progress
	return born

## 食料周期かどうか。ターン0では回さない。
func is_food_turn(turn: int) -> bool:
	return turn > 0 and turn % FOOD_INTERVAL_TURNS == 0

## 食料周期の消費を1拠点ぶん行う。
##
##   必要量 = population * FOOD_PER_PERSON  (FRUIT)
##
## 備蓄が足りなければ、あるだけ食べて 0 で止め food_shortage を立てる。
## Phase 2E では餓死させない — 不足はまず「増えなくなる」形でだけ見せる。
## 戻り値: { "need": int, "eaten": int, "shortage": bool }
func consume_food(settlement: Dictionary) -> Dictionary:
	if settlement.is_empty():
		return {"need": 0, "eaten": 0, "shortage": false}
	var need := get_population(settlement) * FOOD_PER_PERSON
	if need <= 0:
		settlement["food_shortage"] = false
		return {"need": 0, "eaten": 0, "shortage": false}
	var storage: Dictionary = settlement["storage"]
	var stock: int = storage.get(ResourceSystem.FRUIT, 0)
	var eaten: int = mini(need, stock)
	storage[ResourceSystem.FRUIT] = stock - eaten
	var shortage := eaten < need
	settlement["food_shortage"] = shortage
	return {"need": need, "eaten": eaten, "shortage": shortage}

## 全拠点の食料周期。拠点ごとに完全に独立して引く
## (CAMP の人間が BASE の備蓄を食べることは無い)。
## 戻り値: [{ "settlement": Dictionary, "need": int, "eaten": int, "shortage": bool }, ...]
func consume_food_all() -> Array[Dictionary]:
	var results: Array[Dictionary] = []
	for s in settlements:
		var r := consume_food(s)
		if r["need"] <= 0:
			continue
		r["settlement"] = s
		results.append(r)
	return results

## 全拠点の人口成長。増えた拠点だけ返す。
func update_population_growth_all() -> Array[Dictionary]:
	var grown: Array[Dictionary] = []
	for s in settlements:
		if update_population_growth(s) > 0:
			grown.append(s)
	return grown

# ── 労働者 (Phase 2F) ────────────────────────────────────────────
func get_workers(settlement: Dictionary) -> Dictionary:
	if settlement.is_empty():
		return {}
	return settlement["workers"]

## 割当済みの合計人数。
func assigned_workers(settlement: Dictionary) -> int:
	var total := 0
	var workers := get_workers(settlement)
	for job in JOB_ORDER:
		total += int(workers.get(job, 0))
	return total

## 労働に回せる上限。人口全部は使えない (NON_WORKER_POPULATION は必ず残る)。
func max_workers(settlement: Dictionary) -> int:
	return maxi(get_population(settlement) - NON_WORKER_POPULATION, 0)

## まだ仕事に就いていない人数。
##   available = population - NON_WORKER_POPULATION - assigned
func available_workers(settlement: Dictionary) -> int:
	return maxi(max_workers(settlement) - assigned_workers(settlement), 0)

## 割当が人口を超えないように直す。解除した人数を返す。
##
## 移住で人口が抜けたときなど、population が後から減っても
##   assigned_workers <= max(population - 1, 0)
## を常に保つ。解除順は STONE → WOOD → FOOD の決定的な順序
## (食料が最後まで残るように。飢えるのが一番まずい)。
func clamp_workers(settlement: Dictionary) -> int:
	if settlement.is_empty():
		return 0
	var over := assigned_workers(settlement) - max_workers(settlement)
	if over <= 0:
		return 0
	var workers := get_workers(settlement)
	var released := 0
	for job in [JOB_STONE, JOB_WOOD, JOB_FOOD]:
		if over <= 0:
			break
		var n: int = int(workers.get(job, 0))
		var cut: int = mini(n, over)
		workers[job] = n - cut
		over -= cut
		released += cut
	return released

## UI で選択中の仕事。
func get_job_cursor(settlement: Dictionary) -> String:
	if settlement.is_empty():
		return JOB_FOOD
	return str(settlement.get("job_cursor", JOB_FOOD))

## 選択中の仕事を次へ回す (FOOD → WOOD → STONE → FOOD)。
func cycle_job_cursor(settlement: Dictionary) -> String:
	if settlement.is_empty():
		return JOB_FOOD
	var i := JOB_ORDER.find(get_job_cursor(settlement))
	var next: String = JOB_ORDER[(i + 1) % JOB_ORDER.size()]
	settlement["job_cursor"] = next
	return next

## 指定の仕事の人数を1周させる。専用画面を作らないための循環方式。
##
##   空き人口がある → +1
##   空き人口が無い → その仕事を 0 に戻す (= 減員)
##   どちらも不可   → 何もしない
##
## 戻り値: { "result": "add"|"clear"|"none", "job": String, "delta": int }
func cycle_worker(settlement: Dictionary, job: String) -> Dictionary:
	if settlement.is_empty() or not JOB_ORDER.has(job):
		return {"result": "none", "job": job, "delta": 0}
	var workers := get_workers(settlement)
	if available_workers(settlement) > 0:
		workers[job] = int(workers.get(job, 0)) + 1
		return {"result": "add", "job": job, "delta": 1}
	var n: int = int(workers.get(job, 0))
	if n > 0:
		workers[job] = 0
		return {"result": "clear", "job": job, "delta": -n}
	return {"result": "none", "job": job, "delta": 0}

## 直接指定 (セーブ復元やテスト用)。人口上限で必ず切り詰める。
func set_workers(settlement: Dictionary, job: String, count: int) -> void:
	if settlement.is_empty() or not JOB_ORDER.has(job):
		return
	get_workers(settlement)[job] = maxi(count, 0)
	clamp_workers(settlement)

# ── 労働者の自動採集 ─────────────────────────────────────────────
func is_work_turn(turn: int) -> bool:
	return turn > 0 and turn % WORK_INTERVAL_TURNS == 0

## 1拠点ぶんの自動採集。
##
## 労働者1人につき、担当資源の「一番近い採取可能ノード」から1つ取る。
## 取った資源は無から湧かせず、必ず実在ノードの remaining を減らす
## (プレイヤーと同じ資源プールを奪い合う)。枯れれば既存の regrow に乗る。
##
## 収穫はその拠点の storage に直接入る。プレイヤーの carry は経由しない。
##
## 戻り値: { "gathered": {job: n}, "total": int, "workers": int, "idle": bool }
##   idle … 労働者がいるのに何も採れなかった (周辺が枯れた合図)
func work_settlement(settlement: Dictionary, resources: ResourceSystem) -> Dictionary:
	var result := {"gathered": {}, "total": 0, "workers": 0, "idle": false}
	if settlement.is_empty() or resources == null:
		return result
	clamp_workers(settlement)
	var center: Vector2i = settlement["position"]
	var storage: Dictionary = settlement["storage"]
	var workers := get_workers(settlement)
	for job in JOB_ORDER:
		var n: int = int(workers.get(job, 0))
		if n <= 0:
			continue
		result["workers"] = int(result["workers"]) + n
		var res_type: String = JOB_RESOURCE[job]
		var got := 0
		for i in n:
			var target = resources.find_nearest_available(center, WORK_RADIUS, res_type)
			if target == null:
				break        # 範囲内に残っていない。残りの労働者も空振り
			got += resources.take_from_node(target.x, target.y, WORK_YIELD_PER_WORKER)
		if got > 0:
			storage[res_type] = storage.get(res_type, 0) + got
			result["gathered"][job] = got
			result["total"] = int(result["total"]) + got
	result["idle"] = int(result["workers"]) > 0 and int(result["total"]) <= 0
	return result

## 全拠点の自動採集。労働者がいる拠点の結果だけ返す。
func work_all(resources: ResourceSystem) -> Array[Dictionary]:
	var results: Array[Dictionary] = []
	for s in settlements:
		var r := work_settlement(s, resources)
		if int(r["workers"]) <= 0:
			continue
		r["settlement"] = s
		results.append(r)
	return results

# ── 集落の環境圧 ─────────────────────────────────────────────────
## その拠点がかける圧の強さ。自分の拠点の人口だけを使う
## (部族全体の人口を各拠点にフルで乗せない — 人口は拠点ごとに分かれているので
##  Godot版では自然にこう書ける)。
##
##   pressure = population + assigned_workers * SETTLEMENT_WORKER_WEIGHT
##
## 人口0の CAMP は 0 になり、圧もかからない (無人 CAMP = ただの収納場所)。
func settlement_pressure(settlement: Dictionary) -> float:
	var pop := get_population(settlement)
	if pop <= 0:
		return 0.0
	return float(pop) + float(assigned_workers(settlement)) * SETTLEMENT_WORKER_WEIGHT

## 毎ターンの生活圧。中心ほど強く、外側ほど弱い。
##
##   distance_factor = 1.0 - distance / SETTLEMENT_PRESSURE_RADIUS
##   amount = pressure * SETTLEMENT_PRESSURE_COEF * distance_factor
##
## 拠点タイルそのものは対象外。資源ごとの減りやすさは ResourceSystem 側で掛かる。
## 削れた資源の総数を返す。
func apply_settlement_pressure(settlement: Dictionary, resources: ResourceSystem) -> int:
	if settlement.is_empty() or resources == null:
		return 0
	var pressure := settlement_pressure(settlement)
	if pressure <= 0.0:
		return 0
	var center: Vector2i = settlement["position"]
	var base_amount := pressure * SETTLEMENT_PRESSURE_COEF
	var removed := 0
	for pos in resources.get_nodes_in_radius(center, SETTLEMENT_PRESSURE_RADIUS):
		var d := Vector2(pos - center).length()
		if d <= 0.0:
			continue        # 拠点そのもののタイルは対象外
		var distance_factor := 1.0 - d / float(SETTLEMENT_PRESSURE_RADIUS)
		if distance_factor <= 0.0:
			continue
		removed += resources.apply_pressure(pos.x, pos.y, base_amount * distance_factor)
	return removed

func apply_settlement_pressure_all(resources: ResourceSystem) -> int:
	var removed := 0
	for s in settlements:
		removed += apply_settlement_pressure(s, resources)
	return removed

# ── 移住 (BASE → CAMP) ───────────────────────────────────────────
## 送れない理由。OK ("") なら送れる。
func send_block_reason(camp: Dictionary, amount: int = SEND_POP_AMOUNT) -> String:
	if camp.is_empty() or camp["type"] != TYPE_CAMP:
		return REASON_NOT_CAMP
	var base := get_base()
	if base.is_empty():
		return REASON_BASE_LOW
	# BASE を空にする移住は禁止。最低 BASE_MIN_POPULATION 人は残す。
	if get_population(base) - amount < BASE_MIN_POPULATION:
		return REASON_BASE_LOW
	if get_population(camp) + amount > get_population_cap(camp):
		return REASON_CAMP_FULL
	return OK

func can_send_population(camp: Dictionary, amount: int = SEND_POP_AMOUNT) -> bool:
	return send_block_reason(camp, amount) == OK

## BASE から CAMP へ人を送る。成否と理由を返す。
##   { "ok": bool, "reason": String, "amount": int }
## 失敗時は何も変更しない (呼び出し側がターンを消費しないで済む)。
func send_population_to_camp(camp: Dictionary, amount: int = SEND_POP_AMOUNT) -> Dictionary:
	var reason := send_block_reason(camp, amount)
	if reason != OK:
		return {"ok": false, "reason": reason, "amount": 0, "released": 0}
	var base := get_base()
	base["population"] = get_population(base) - amount
	camp["population"] = get_population(camp) + amount
	# 人が抜けたぶん、BASE の割当が人口を超えないよう安全側に直す。
	var released := clamp_workers(base)
	return {"ok": true, "reason": OK, "amount": amount, "released": released}

# ── 表示 ─────────────────────────────────────────────────────────
## HUD 用の1行表示。拠点種別を先頭に置くので BASE/CAMP どちらでも使える。
## 全拠点の一覧は出さない (画面に情報を並べない = プロトタイプ版の作法)。
##
##   BASE POP 06/30  F00 W00 S00 L00
##
## 食料不足のときだけ末尾に LOW を足す。行は常に1本のまま。
func storage_text(settlement: Dictionary) -> String:
	if settlement.is_empty():
		return ""
	var storage: Dictionary = settlement["storage"]
	var parts: Array[String] = []
	for r in ResourceSystem.ORDER:
		parts.append("%s%02d" % [ResourceSystem.SHORT_LABELS[r], storage.get(r, 0)])
	var text := "%s POP %02d/%02d  %s" % [
		str(settlement["type"]),
		get_population(settlement),
		get_population_cap(settlement),
		" ".join(parts)]
	if has_food_shortage(settlement):
		text += " LOW"
	return text

## HUD 用の労働1行。
##
##   JOB F2 W1 S0  FREE 2
##
## 全拠点の一覧は出さない。今いる拠点 (拠点外なら BASE) の1本だけ。
func jobs_text(settlement: Dictionary) -> String:
	if settlement.is_empty():
		return ""
	var workers := get_workers(settlement)
	var parts: Array[String] = []
	for job in JOB_ORDER:
		parts.append("%s%d" % [JOB_SHORT[job], int(workers.get(job, 0))])
	return "JOB %s  FREE %d" % [" ".join(parts), available_workers(settlement)]
