extends Node2D
class_name MapView
##
## マップ描画。
##
## 方針: 地形を「絵として描く」のではなく「符号で表す」。
## HTML/Canvas プロトタイプの無機質さ (モノクロ / 荒い / 記号的 / 説明しすぎない)
## を基準にする。色は白〜灰〜黒のみで、資源の種類も色では区別しない。
##
## ピクセル感を保つための決めごと:
##   - 座標は整数。線幅は 1px
##   - 円・曲線は使わない (角ばった形だけで表す)
##   - グリッド線は引かない (タイルが繋がって見えるほうが荒く見える)

const TILE_PX := 20

# ── パレット (モノクロのみ) ──────────────────────────────────────
#
# HTML版に合わせ、地面はほぼ黒で塗り、地形の違いは「符号の形と明るさ」で表す。
# タイルごとに明るい灰色をベタ塗りすると高低差マップのように見えてしまい、
# プロトタイプ版より豪華・重たい印象になるため、塗りの差はごく僅かに留める。
const COLOR_UNEXPLORED := Color("000000")
const COLORS := {
	MapGenerator.Tile.SEA:           Color("080808"),
	MapGenerator.Tile.GRASS:         Color("121212"),
	MapGenerator.Tile.FOREST:        Color("151515"),
	MapGenerator.Tile.DEEP_FOREST:   Color("181818"),
	MapGenerator.Tile.MOUNTAIN:      Color("1c1c1c"),
	MapGenerator.Tile.HIGH_MOUNTAIN: Color("202020"),
	MapGenerator.Tile.RIVER:         Color("141414"),
}

# 地形グリフの色。情報はすべてこちらが担う。
# 高いところほど明るくして、符号の形と併せて地形を読ませる。
const GLYPH_COLORS := {
	MapGenerator.Tile.SEA:           Color("111111"),
	MapGenerator.Tile.GRASS:         Color("303030"),
	MapGenerator.Tile.FOREST:        Color("555555"),
	MapGenerator.Tile.DEEP_FOREST:   Color("707070"),
	MapGenerator.Tile.MOUNTAIN:      Color("999999"),
	MapGenerator.Tile.HIGH_MOUNTAIN: Color("cccccc"),
	MapGenerator.Tile.RIVER:         Color("777777"),
}

const COLOR_INK := Color("e0e0e0")        # 資源・拠点・プレイヤーの明るい符号
const COLOR_DEPLETED := Color("555555")   # 枯渇跡

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
			var ox := x * TILE_PX
			var oy := y * TILE_PX
			if not player.is_explored(x, y):
				draw_rect(Rect2(ox, oy, TILE_PX, TILE_PX), COLOR_UNEXPLORED, true)
				continue
			var t: int = tiles[y][x]
			draw_rect(Rect2(ox, oy, TILE_PX, TILE_PX), COLORS.get(t, Color("303030")), true)
			_draw_tile_glyph(t, ox, oy, x, y)
			_draw_resource(x, y, ox, oy)

	_draw_settlements()
	_draw_gather_target()
	_draw_player()

# ── 地形の符号 ───────────────────────────────────────────────────
## 座標から決まる 0-3 の値。点の位置をばらけさせて「荒さ」を出すのに使う。
func _jitter(x: int, y: int, salt: int) -> int:
	return (x * 7 + y * 13 + salt * 31) % 4

func _draw_tile_glyph(t: int, ox: int, oy: int, x: int, y: int) -> void:
	var c: Color = GLYPH_COLORS.get(t, Color("4a4a4a"))
	match t:
		MapGenerator.Tile.SEA:
			# ほぼ黒。まばらに 1px の横線だけ
			if _jitter(x, y, 1) == 0:
				draw_rect(Rect2(ox + 5, oy + 10, 6, 1), c, true)
		MapGenerator.Tile.GRASS:
			# 1px の点を2つ。位置は座標でばらす
			draw_rect(Rect2(ox + 5 + _jitter(x, y, 2), oy + 12, 1, 1), c, true)
			draw_rect(Rect2(ox + 12, oy + 6 + _jitter(x, y, 3), 1, 1), c, true)
		MapGenerator.Tile.FOREST:
			# 縦線3本 (木に見えるギリギリ)
			for i in 3:
				var lx := ox + 5 + i * 5
				draw_rect(Rect2(lx, oy + 7 + _jitter(x, y, i), 1, 6), c, true)
		MapGenerator.Tile.DEEP_FOREST:
			# FOREST より密度を上げるだけ
			for i in 5:
				var lx2 := ox + 3 + i * 3
				draw_rect(Rect2(lx2, oy + 6 + _jitter(x, y, i), 1, 8), c, true)
		MapGenerator.Tile.MOUNTAIN:
			_draw_caret(ox + 10, oy + 8, 5, c)
		MapGenerator.Tile.HIGH_MOUNTAIN:
			# 山記号を2段に (雪冠のようなリアル表現はしない)
			_draw_caret(ox + 10, oy + 10, 6, c)
			_draw_caret(ox + 10, oy + 5, 4, c)
		MapGenerator.Tile.RIVER:
			draw_rect(Rect2(ox + 3, oy + 10, 14, 1), c, true)

## 「^」。1px の階段状で角ばらせる (斜め線の代わり)。
## 中心(頂点)を上に、外側ほど下がるように置く。
func _draw_caret(cx: int, apex_y: int, size: int, c: Color) -> void:
	for i in size:
		draw_rect(Rect2(cx - i, apex_y + i, 1, 1), c, true)
		draw_rect(Rect2(cx + i, apex_y + i, 1, 1), c, true)

# ── 資源の符号 ───────────────────────────────────────────────────
## 資源は色で区別せず、すべて白〜灰の小さな象形記号で表す。
## どの明るさの地形の上でも読めるよう、暗い下敷きを1枚敷く。
func _draw_resource(x: int, y: int, ox: int, oy: int) -> void:
	if resources == null:
		return
	var node := resources.node_at(x, y)
	if node.is_empty():
		return
	var depleted: bool = node["remaining"] <= 0
	var c := COLOR_DEPLETED if depleted else COLOR_INK
	var cx := ox + 10
	var cy := oy + 10
	match node["type"]:
		ResourceSystem.FRUIT:
			# 小さい点3個
			draw_rect(Rect2(cx - 2, cy - 2, 1, 1), c, true)
			draw_rect(Rect2(cx + 1, cy - 1, 1, 1), c, true)
			draw_rect(Rect2(cx - 1, cy + 1, 1, 1), c, true)
		ResourceSystem.WOOD:
			# 短い横棒
			draw_rect(Rect2(cx - 3, cy - 1, 6, 1), c, true)
		ResourceSystem.STONE:
			# 小さい菱形 (1px の段で描く)
			draw_rect(Rect2(cx - 1, cy - 3, 2, 1), c, true)
			draw_rect(Rect2(cx - 2, cy - 2, 4, 1), c, true)
			draw_rect(Rect2(cx - 3, cy - 1, 6, 2), c, true)
			draw_rect(Rect2(cx - 2, cy + 1, 4, 1), c, true)
			draw_rect(Rect2(cx - 1, cy + 2, 2, 1), c, true)
		ResourceSystem.FLINT:
			# 小さい三角
			draw_rect(Rect2(cx, cy - 3, 1, 1), c, true)
			draw_rect(Rect2(cx - 1, cy - 2, 3, 1), c, true)
			draw_rect(Rect2(cx - 2, cy - 1, 5, 1), c, true)
			draw_rect(Rect2(cx - 3, cy, 7, 1), c, true)

# ── 拠点 ─────────────────────────────────────────────────────────
## 拠点は文字ではなく記号で示す。地図上に "BASE" / "CAMP" とは書かない。
##   BASE … 1px の囲い + 屋根。「囲われた場所」
##   CAMP … 屋根 + 柱2本だけの天幕。囲いが無いぶん小さく、仮設に見える
## どちらもプレイヤーが上に立つ前提なので、中央は空けておく。
func _draw_settlements() -> void:
	if settlements == null:
		return
	for s in settlements.settlements:
		var p: Vector2i = s["position"]
		if not player.is_explored(p.x, p.y):
			continue
		var ox: int = p.x * TILE_PX
		var oy: int = p.y * TILE_PX
		if s["type"] == SettlementSystem.TYPE_CAMP:
			_draw_camp_mark(ox, oy)
		else:
			_draw_base_mark(ox, oy)

func _draw_base_mark(ox: int, oy: int) -> void:
	# 1px の枠だけ。中央は空けておき、プレイヤーが立っても両方読めるようにする。
	draw_rect(Rect2(ox + 1, oy + 1, TILE_PX - 2, TILE_PX - 2), COLOR_INK, false, 1.0)
	# 屋根の短線 (上辺の内側に "^" を1つ)
	_draw_caret(ox + 10, oy + 3, 3, COLOR_INK)

func _draw_camp_mark(ox: int, oy: int) -> void:
	# 天幕: 屋根の "^" と、その下に柱2本。囲いは描かない。
	# 柱はタイルの左右端寄りに置き、中央に立つプレイヤーの人型と重ねない。
	_draw_caret(ox + 10, oy + 2, 5, COLOR_INK)
	draw_rect(Rect2(ox + 5, oy + 7, 1, 6), COLOR_INK, true)
	draw_rect(Rect2(ox + 14, oy + 7, 1, 6), COLOR_INK, true)

## 採集対象は角の括弧だけで示す (円は使わない)。
func _draw_gather_target() -> void:
	if gather_target == null:
		return
	var t: Vector2i = gather_target
	var ox: int = t.x * TILE_PX
	var oy: int = t.y * TILE_PX
	var c := Color("ffffff")
	var n := 4
	for i in n:
		draw_rect(Rect2(ox + i, oy, 1, 1), c, true)
		draw_rect(Rect2(ox, oy + i, 1, 1), c, true)
		draw_rect(Rect2(ox + TILE_PX - 1 - i, oy, 1, 1), c, true)
		draw_rect(Rect2(ox + TILE_PX - 1, oy + i, 1, 1), c, true)
		draw_rect(Rect2(ox + i, oy + TILE_PX - 1, 1, 1), c, true)
		draw_rect(Rect2(ox, oy + TILE_PX - 1 - i, 1, 1), c, true)
		draw_rect(Rect2(ox + TILE_PX - 1 - i, oy + TILE_PX - 1, 1, 1), c, true)
		draw_rect(Rect2(ox + TILE_PX - 1, oy + TILE_PX - 1 - i, 1, 1), c, true)

# ── プレイヤー ───────────────────────────────────────────────────
## 細い人型ドット。顔なし・アウトラインなし・白1色。
func _draw_player() -> void:
	var ox: int = player.grid_x * TILE_PX
	var oy: int = player.grid_y * TILE_PX
	var c := COLOR_INK
	var cx := ox + 10
	var top := oy + 4
	draw_rect(Rect2(cx - 1, top, 2, 2), c, true)          # 頭 (小さめ = 頭身を高く見せる)
	draw_rect(Rect2(cx, top + 3, 1, 6), c, true)          # 胴
	draw_rect(Rect2(cx - 2, top + 4, 5, 1), c, true)      # 腕
	draw_rect(Rect2(cx - 1, top + 9, 1, 3), c, true)      # 左脚
	draw_rect(Rect2(cx + 1, top + 9, 1, 3), c, true)      # 右脚
