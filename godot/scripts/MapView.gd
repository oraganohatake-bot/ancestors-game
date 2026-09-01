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

var tiles: Array = []
var player: PlayerController = null

func setup(p_tiles: Array, p_player: PlayerController) -> void:
	tiles = p_tiles
	player = p_player
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
			draw_rect(r, COLOR_GRID, false, 1.0)

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

func _draw_player() -> void:
	var cx := player.grid_x * TILE_PX + TILE_PX * 0.5
	var cy := player.grid_y * TILE_PX + TILE_PX * 0.5
	# 現在地リング (見失わないように)
	draw_arc(Vector2(cx, cy), TILE_PX * 0.52, 0, TAU, 20, COLOR_PLAYER_RING, 2.0)
	# 小さな人型: 頭 + 胴
	draw_rect(Rect2(cx - 2, cy - 6, 4, 4), COLOR_PLAYER, true)
	draw_rect(Rect2(cx - 3, cy - 1, 6, 6), COLOR_PLAYER, true)
