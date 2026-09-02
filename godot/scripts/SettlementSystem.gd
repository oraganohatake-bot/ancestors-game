extends RefCounted
class_name SettlementSystem
##
## 拠点 (BASE / CAMP) と、その備蓄 (Phase 2B → 2D)。
##
## Phase 2D の位置づけ:
##   BASE   … ゲーム開始地点。唯一。全ての資材の出所。
##   CAMP   … 遠征用の中継拠点。人口を持たない「置ける納入先」。
##            遠くを探索したときに「BASEまで戻る」以外の選択肢を作るためだけの存在。
##
## 拠点1件の形:
##   { "type": "BASE"|"CAMP", "position": Vector2i, "storage": { fruit:0, wood:0, ... } }
##
## 備蓄は拠点ごとに完全に独立。BASE と CAMP、CAMP 同士の輸送/共有は無い。
##
## Phase 2D で入れないもの (意図的):
##   - 人口・労働者・維持コスト  … Phase 2E 以降。CAMP は今は「便利なだけ」でいい
##   - CAMP 周辺の資源圧/枯渇    … 人口が入ってから
##   - CAMP 間輸送 / 備蓄共有     … 独立備蓄のままにして、輸送を後で「手段」にする
##   - 視界の恒久拡張             … CAMP は納入拠点であって物見櫓ではない

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

# ── 設置できない理由 ─────────────────────────────────────────────
# ログ表示と分岐の両方で使うので文字列コードにしておく。
const OK := ""
const REASON_TERRAIN := "TERRAIN"     # 地形が不適
const REASON_OCCUPIED := "OCCUPIED"   # 既に拠点がある
const REASON_LIMIT := "LIMIT"         # CAMP 上限
const REASON_COST := "COST"           # BASE の備蓄が足りない

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
func add_settlement(type: String, position: Vector2i) -> Dictionary:
	var storage := {}
	for r in ResourceSystem.ORDER:
		storage[r] = 0
	var s := {"type": type, "position": position, "storage": storage}
	settlements.append(s)
	return s

## ゲーム開始時の BASE を作る。
func create_base(position: Vector2i) -> Dictionary:
	return add_settlement(TYPE_BASE, position)

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

# ── 表示 ─────────────────────────────────────────────────────────
## HUD 用の1行表示。拠点種別を先頭に置くので BASE/CAMP どちらでも使える。
## 全拠点の一覧は出さない (画面に情報を並べない = プロトタイプ版の作法)。
func storage_text(settlement: Dictionary) -> String:
	if settlement.is_empty():
		return ""
	var storage: Dictionary = settlement["storage"]
	var parts: Array[String] = []
	for r in ResourceSystem.ORDER:
		parts.append("%s %02d" % [ResourceSystem.SHORT_LABELS[r], storage.get(r, 0)])
	return str(settlement["type"]) + " " + " ".join(parts)
