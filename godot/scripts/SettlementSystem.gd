extends RefCounted
class_name SettlementSystem
##
## 拠点 (BASE / CAMP) と、その備蓄・人口 (Phase 2B → 2E)。
##
## Phase 2E の位置づけ:
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
##   }
##
## 備蓄も人口も拠点ごとに完全に独立。BASE と CAMP、CAMP 同士の輸送/共有は無い。
## CAMP の人間が BASE の食料を食べることは無い (集落は自分の備蓄だけで食う)。
##
## Phase 2E で入れないもの (意図的):
##   - 労働者アサイン / 自動採集   … Phase 2F。今は「人がいる」だけでいい
##   - CAMP 周辺の資源圧/枯渇      … 人口が入った次の段階
##   - 餓死 / 人口減少             … 不足はまず「成長が止まる」だけで見せる
##   - CAMP 間輸送 / 備蓄共有       … 独立備蓄のままにして、輸送を後で「手段」にする

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
const FOOD_INTERVAL_TURNS := 10
const FOOD_PER_PERSON := 1

## 移住1回で動く人数。
const SEND_POP_AMOUNT := 2

## 移住後に BASE に最低限残す人数。BASE を空にする移住は認めない。
const BASE_MIN_POPULATION := 1

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
	var s := {
		"type": type,
		"position": position,
		"storage": storage,
		"population": population,
		"growth_progress": 0.0,
		"food_shortage": false,
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
		return {"ok": false, "reason": reason, "amount": 0}
	var base := get_base()
	base["population"] = get_population(base) - amount
	camp["population"] = get_population(camp) + amount
	return {"ok": true, "reason": OK, "amount": amount}

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
