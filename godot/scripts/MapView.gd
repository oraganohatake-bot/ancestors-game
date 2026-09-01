extends Node2D
class_name MapView
##
## マップ描画 (Phase 1)。
##
## TileMap を使わず _draw() の矩形描画で組む。Phase 1 の目的は操作感の確認なので、
## タイルセット資産を作らずに色と記号だけでドット絵風を成立させるのが早い。
## (外部画像なしで動く = すぐ試せる、という Phase 1 の要件にも合う)
##
## 見た目の方針は Canvas版を踏襲:
##   - 色数は少なめ・彩度低め
##   - 地形は「色 + 小さな記号」で区別する (森=点、山=三角、川/海=横線)
##   - 未探索は暗いグレー一色で潰す
##   - 現在地が一目で分かる

const TILE_PX := 20            # 見た目16〜24px相当

# 地形色 (探索済み)。低彩度でまとめ、記号で差を作る。
const COLORS := {
	MapGenerator.Tile.SEA:           Color("2a3b52"),
	MapGenerator.Tile.GRASS:         Color("6f8f5a"),
	MapGenerator.Tile.FOREST:        Color("4e7343"),
	MapGenerator.Tile.DEEP_FOREST:   Color("3a5a34"),
	MapGenerator.Tile.MOUNTAIN:      Color("7d7a72"),
	MapGenerator.Tile.HIGH_MOUNTAIN: Color("9a978f"),
	MapGenerator.Tile.RIVER:         Color("4a7c94"),
}

const COLOR_UNEXPLORED := Color("14161c")   # 未探索: ほぼ黒
const COLOR_GRID := Color(0, 0, 0, 0.16)    # タイル境界のごく薄い線
const COLOR_PLAYER := Color("f2e6c8")
const COLOR_PLAYER_RING := Color("e8b64c")

# 資源マーカーの色。地形色から浮くように彩度を上げ、種類を色で区別する。
const RESOURCE_COLORS := {
	ResourceSystem.FRUIT: Color("e05a4d"),
	ResourceSystem.WOOD:  Color("c98a3e"),
	ResourceSystem.STONE: Color("d3d7dc"),
	ResourceSystem.FLINT: Color("8d7ce0"),
}
const COLOR_TARGET_RING := Color("f5e27a")  # 採集できる資源の強調
const COLOR_DEPLETED := Color("b7b7b7")     # 枯渇跡 (淡いグレーで控えめに)
const COLOR_BASE := Color("d9c9a3")         # 拠点の枠 (地形より明るく)
const COLOR_BASE_FILL := Color("5a4a33")    # 拠点の土台

var tiles: Array = []
var player: PlayerController = null
var resources: ResourceSystem = null
var settlements: SettlementSystem = null
var gather_target = null                    # Vector2i or null

func setup(p_tiles: Array, p_player: PlayerController, p_resources: ResourceSystem,
		p_settlements: SettlementSystem) -> void:
	tiles = p_tiles
	player = p_player
	resources = p_resources
	settlements = p_settlements
	queue_redraw()

func _draw() -> void:
	if tiles.is_empty() or player == null:
		return
	var h: int = tiles.size()
	var w: int = tiles[0].size()

	for y in h:
		for x in w:
			var r := Rect2(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX)
			if not player.is_explored(x, y):
				draw_rect(r, COLOR_UNEXPLORED, true)
				continue
			var t: int = tiles[y][x]
			var col: Color = COLORS.get(t, Color("505050"))
			draw_rect(r, col, true)
			_draw_tile_symbol(t, x, y, col)
			_draw_resource(x, y)
			draw_rect(r, COLOR_GRID, false, 1.0)

	_draw_settlements()
	_draw_gather_target()
	_draw_player()

## 地形ごとの小さな記号。ドット感を出しつつ地形を読めるようにする。
func _draw_tile_symbol(t: int, x: int, y: int, base: Color) -> void:
	var ox := x * TILE_PX
	var oy := y * TILE_PX
	var mid := TILE_PX * 0.5

	match t:
		MapGenerator.Tile.FOREST:
			# 小さい森: 点を2つ
			var d := base.darkened(0.35)
			draw_rect(Rect2(ox + mid - 4, oy + mid - 2, 3, 3), d, true)
			draw_rect(Rect2(ox + mid + 1, oy + mid + 1, 3, 3), d, true)
		MapGenerator.Tile.DEEP_FOREST:
			# 大きい森: 点を密に
			var d2 := base.darkened(0.4)
			draw_rect(Rect2(ox + 4, oy + 4, 3, 3), d2, true)
			draw_rect(Rect2(ox + 11, oy + 6, 3, 3), d2, true)
			draw_rect(Rect2(ox + 6, oy + 11, 3, 3), d2, true)
			draw_rect(Rect2(ox + 12, oy + 13, 2, 2), d2, true)
		MapGenerator.Tile.MOUNTAIN:
			# 山: 小さい三角
			var m := base.darkened(0.45)
			draw_colored_polygon(PackedVector2Array([
				Vector2(ox + mid, oy + 4),
				Vector2(ox + mid + 5, oy + TILE_PX - 5),
				Vector2(ox + mid - 5, oy + TILE_PX - 5)]), m)
		MapGenerator.Tile.HIGH_MOUNTAIN:
			# 高い山: 大きい三角 + 白い頂 (雪)
			var m2 := base.darkened(0.5)
			draw_colored_polygon(PackedVector2Array([
				Vector2(ox + mid, oy + 2),
				Vector2(ox + mid + 7, oy + TILE_PX - 3),
				Vector2(ox + mid - 7, oy + TILE_PX - 3)]), m2)
			draw_colored_polygon(PackedVector2Array([
				Vector2(ox + mid, oy + 2),
				Vector2(ox + mid + 3, oy + 7),
				Vector2(ox + mid - 3, oy + 7)]), Color("e9edf2"))
		MapGenerator.Tile.RIVER, MapGenerator.Tile.SEA:
			# 水: 横の細い線 (波)
			var lw := base.lightened(0.18)
			draw_rect(Rect2(ox + 3, oy + 6, 8, 1), lw, true)
			draw_rect(Rect2(ox + 9, oy + 12, 8, 1), lw, true)

## 資源マーカー。枯れたノードは「使い尽くした跡」に描き替える。
## 跡が残ることで「ここは採り尽くした / まだ戻っていない」が目で分かり、
## 復活したら通常マーカーに戻る (Phase 2C)。
func _draw_resource(x: int, y: int) -> void:
	if resources == null:
		return
	var node := resources.node_at(x, y)
	if node.is_empty():
		return
	if node["remaining"] <= 0:
		_draw_depleted_mark(node["type"], x, y)
		return
	var type: String = node["type"]
	var col: Color = RESOURCE_COLORS.get(type, Color.WHITE)
	var cx := x * TILE_PX + TILE_PX * 0.5
	var cy := y * TILE_PX + TILE_PX * 0.5

	# 背面の暗い縁取り。地形色に埋もれないようにする。
	draw_circle(Vector2(cx, cy), 4.2, Color(0, 0, 0, 0.55))
	match type:
		ResourceSystem.FRUIT:
			draw_circle(Vector2(cx, cy), 3.0, col)          # 実: 丸
		ResourceSystem.WOOD:
			draw_rect(Rect2(cx - 3, cy - 1.5, 6, 3), col, true)   # 枝: 横棒
		ResourceSystem.STONE:
			draw_colored_polygon(PackedVector2Array([        # 石: 四角を傾けた形
				Vector2(cx, cy - 3), Vector2(cx + 3, cy),
				Vector2(cx, cy + 3), Vector2(cx - 3, cy)]), col)
		ResourceSystem.FLINT:
			draw_colored_polygon(PackedVector2Array([        # 火打石: 鋭い三角
				Vector2(cx, cy - 3.5), Vector2(cx + 3, cy + 2.5),
				Vector2(cx - 3, cy + 2.5)]), col)

## 枯渇跡。淡いグレーの小さな記号で、資源マーカーより明確に弱く描く。
## 果物→切り株 / 木→落ちた枯れ枝 / 石→掘った穴 / 火打石→削り跡。
## (Canvas版 drawDepletedMark と同じ考え方)
func _draw_depleted_mark(type: String, x: int, y: int) -> void:
	var cx := x * TILE_PX + TILE_PX * 0.5
	var cy := y * TILE_PX + TILE_PX * 0.5
	var c := COLOR_DEPLETED
	c.a = 0.55                                   # 主張しすぎない
	match type:
		ResourceSystem.FRUIT:
			# 実の落ちた切り株: 低い台形 + 年輪の横線
			draw_rect(Rect2(cx - 3, cy, 6, 3), c, false, 1.0)
			draw_line(Vector2(cx - 1.5, cy + 1.5), Vector2(cx + 1.5, cy + 1.5), c, 1.0)
		ResourceSystem.WOOD:
			# 地面に落ちた枯れ枝: 横線 + 小枝
			draw_line(Vector2(cx - 3.5, cy + 1.5), Vector2(cx + 3.5, cy + 0.5), c, 1.0)
			draw_line(Vector2(cx, cy + 1), Vector2(cx + 1.5, cy - 1.5), c, 1.0)
		ResourceSystem.STONE:
			# 掘り返した穴: 潰れた楕円の輪郭
			draw_arc(Vector2(cx, cy + 1), 3.0, 0, TAU, 12, c, 1.0)
		ResourceSystem.FLINT:
			# 採取後の削り跡: 交差する2本の線
			draw_line(Vector2(cx - 3, cy + 2), Vector2(cx + 3, cy - 2), c, 1.0)
			draw_line(Vector2(cx - 1, cy - 1), Vector2(cx + 1, cy + 2.5), c, 1.0)

## 拠点 (BASE)。小屋を思わせる「四角 + 屋根」の記号で描く。
## プレイヤーと重なっても分かるよう、タイル全体の枠として描き、
## プレイヤーより先に (下に) 置く。
func _draw_settlements() -> void:
	if settlements == null:
		return
	for s in settlements.settlements:
		var p: Vector2i = s["position"]
		if not player.is_explored(p.x, p.y):
			continue
		var ox := p.x * TILE_PX
		var oy := p.y * TILE_PX
		# 土台: タイルを塗り替えて「ここは拠点」と分かるようにする
		draw_rect(Rect2(ox + 2, oy + 2, TILE_PX - 4, TILE_PX - 4), COLOR_BASE_FILL, true)
		# 外枠の二重線 (プレイヤーが上に立っても外周は見える)
		draw_rect(Rect2(ox + 1, oy + 1, TILE_PX - 2, TILE_PX - 2), COLOR_BASE, false, 1.0)
		draw_rect(Rect2(ox + 3, oy + 3, TILE_PX - 6, TILE_PX - 6), COLOR_BASE, false, 1.0)
		# 屋根: 上辺の三角
		draw_colored_polygon(PackedVector2Array([
			Vector2(ox + TILE_PX * 0.5, oy + 2),
			Vector2(ox + TILE_PX - 4, oy + 7),
			Vector2(ox + 4, oy + 7)]), COLOR_BASE)

## 今まさに採れる資源を囲む。「採集ボタンが何に効くか」を迷わせない。
func _draw_gather_target() -> void:
	if gather_target == null:
		return
	var t: Vector2i = gather_target
	var cx := t.x * TILE_PX + TILE_PX * 0.5
	var cy := t.y * TILE_PX + TILE_PX * 0.5
	draw_arc(Vector2(cx, cy), TILE_PX * 0.42, 0, TAU, 16, COLOR_TARGET_RING, 1.5)

func _draw_player() -> void:
	var cx := player.grid_x * TILE_PX + TILE_PX * 0.5
	var cy := player.grid_y * TILE_PX + TILE_PX * 0.5
	# 現在地リング (見失わないように)
	draw_arc(Vector2(cx, cy), TILE_PX * 0.52, 0, TAU, 20, COLOR_PLAYER_RING, 2.0)
	# 小さな人型: 頭 + 胴
	draw_rect(Rect2(cx - 2, cy - 6, 4, 4), COLOR_PLAYER, true)
	draw_rect(Rect2(cx - 3, cy - 1, 6, 6), COLOR_PLAYER, true)
