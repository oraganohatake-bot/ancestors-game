extends RefCounted
class_name ResourceSystem
##
## 資源ノードとインベントリ (Phase 2A)。
##
## Canvas版 (../game.js) の方針を踏襲:
##   - 「1地形 = 1資源」。山で果物、森で石、のような混在をさせない
##   - ノードは remaining を持ち、採ると減る。0 で枯れる
##   - 出現判定は座標ハッシュなので、同じマップなら毎回同じ場所に出る
##
## Phase 2A で入れないもの (意図的):
##   - regrow (再生)         … TurnSystem._regrow_resources() のフックに残す
##   - 集落資源圧による枯渇   … CAMP/人口が入る Phase 2B 以降
##   - 所持上限 / 納品        … BASE が入ってから
##   - 太い枝 / 皮 / 肉       … クラフト・狩りと同時に入れる

# 資源種別。文字列にしておくと辞書キー/セーブJSONにそのまま載せられる。
const FRUIT := "fruit"
const WOOD := "wood"
const STONE := "stone"
const FLINT := "flint"

const ORDER: Array[String] = [FRUIT, WOOD, STONE, FLINT]

const LABELS := {
	FRUIT: "果物",
	WOOD: "木",
	STONE: "石",
	FLINT: "火打石",
}

const SHORT_LABELS := {
	FRUIT: "果",
	WOOD: "木",
	STONE: "石",
	FLINT: "火",
}

# 地形ごとの出現率 (Canvas版の RESOURCE_* 定数と同じ値)
const CHANCE_FOREST_FRUIT := 0.24        # 小さい森: 果物のみ
const CHANCE_DEEP_FOREST_WOOD := 0.32    # 大きい森: 枝/木のみ
const CHANCE_MOUNTAIN_STONE := 0.22      # 普通の山: 石のみ
const CHANCE_HIGH_MOUNTAIN_FLINT := 0.26 # 高い山: フリントのみ
const CHANCE_GRASS_FRUIT := 0.38         # 森に隣接した草原: 果物

# ノードの初期量
const MAX_REMAINING := {
	FRUIT: 3,
	WOOD: 8,
	STONE: 5,
	FLINT: 5,
}

const GATHER_AMOUNT := 1                 # 1回の採集で得られる量 (Canvas版 gatherAmount)

## 資源ノード。キー "x,y" → { type, remaining, max_remaining, regrow_timer }
var nodes: Dictionary = {}

## プレイヤーの所持品。Phase 2A では上限なし。
var inventory: Dictionary = {}

func _init() -> void:
	reset_inventory()

func reset_inventory() -> void:
	inventory = {}
	for r in ORDER:
		inventory[r] = 0

## マップ全体に資源を配置する。外周1枚は除外 (海縁に資源が付かないように)。
func generate(tiles: Array, seed_value: int) -> void:
	nodes.clear()
	var h: int = tiles.size()
	var w: int = tiles[0].size()
	for y in range(1, h - 1):
		for x in range(1, w - 1):
			var tile: int = tiles[y][x]
			var n := _hash01(x, y, seed_value)
			var type := ""
			# 判定順は Canvas版と同じ。1地形1資源を崩さない。
			if tile == MapGenerator.Tile.GRASS \
					and _has_neighbor(tiles, x, y, MapGenerator.Tile.FOREST) \
					and n < CHANCE_GRASS_FRUIT:
				type = FRUIT
			elif tile == MapGenerator.Tile.FOREST and n < CHANCE_FOREST_FRUIT:
				type = FRUIT
			elif tile == MapGenerator.Tile.DEEP_FOREST and n < CHANCE_DEEP_FOREST_WOOD:
				type = WOOD
			elif tile == MapGenerator.Tile.MOUNTAIN and n < CHANCE_MOUNTAIN_STONE:
				type = STONE
			elif tile == MapGenerator.Tile.HIGH_MOUNTAIN and n < CHANCE_HIGH_MOUNTAIN_FLINT:
				type = FLINT
			if type != "":
				nodes["%d,%d" % [x, y]] = _make_node(type)

func _make_node(type: String) -> Dictionary:
	var m: int = MAX_REMAINING.get(type, 3)
	return {"type": type, "remaining": m, "max_remaining": m, "regrow_timer": 0}

## 座標ハッシュ 0.0-1.0。乱数ではなく座標から決まるので、
## 同じマップなら資源の位置も毎回同じになる (Canvas版 seededNoise と同じ狙い)。
func _hash01(x: int, y: int, seed_value: int) -> float:
	var v := (x * 374761393 + y * 668265263 + seed_value * 2147483647) & 0x7fffffff
	v = (v ^ (v >> 13)) * 1274126177
	v = v & 0x7fffffff
	return float(v % 100000) / 100000.0

func _has_neighbor(tiles: Array, x: int, y: int, target: int) -> bool:
	var h: int = tiles.size()
	var w: int = tiles[0].size()
	for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var nx: int = x + d.x
		var ny: int = y + d.y
		if nx < 0 or ny < 0 or nx >= w or ny >= h:
			continue
		if tiles[ny][nx] == target:
			return true
	return false

## そのタイルの資源ノード。無ければ空辞書。
func node_at(x: int, y: int) -> Dictionary:
	return nodes.get("%d,%d" % [x, y], {})

## 採取できる資源があるか (枯れたノードは false)。
func has_gatherable(x: int, y: int) -> bool:
	var n := node_at(x, y)
	return not n.is_empty() and n["remaining"] > 0

## 採集対象を探す。足元 → 上下左右 の順 (Canvas版 ACTION_DIRS と同じ優先順)。
## 見つかれば Vector2i、無ければ null を返す。
func find_gather_target(px: int, py: int):
	for d: Vector2i in [Vector2i(0, 0), Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]:
		var x: int = px + d.x
		var y: int = py + d.y
		if has_gatherable(x, y):
			return Vector2i(x, y)
	return null

## 採集する。成功したら { type, amount, depleted } を返す。失敗なら空辞書。
func gather(x: int, y: int) -> Dictionary:
	var key := "%d,%d" % [x, y]
	if not nodes.has(key):
		return {}
	var node: Dictionary = nodes[key]
	if node["remaining"] <= 0:
		return {}
	var type: String = node["type"]
	var amount: int = mini(GATHER_AMOUNT, node["remaining"])
	node["remaining"] -= amount
	inventory[type] = inventory.get(type, 0) + amount
	var depleted: bool = node["remaining"] <= 0
	if depleted:
		# Phase 2B で regrow を入れるときにここのタイマーを使う
		node["regrow_timer"] = 0
	return {"type": type, "amount": amount, "depleted": depleted}

## HUD 用の1行表示。
func inventory_text() -> String:
	var parts: Array[String] = []
	for r in ORDER:
		parts.append("%s %d" % [SHORT_LABELS[r], inventory.get(r, 0)])
	return " / ".join(parts)
