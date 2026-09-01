extends RefCounted
class_name PlayerController
##
## プレイヤーの位置・移動・視界 (Phase 1)。
##
## Canvas版と同じく:
##   - 移動はタイル単位 (1入力 = 1マス = 1ターン)
##   - 視界は半径固定で、一度見たタイルは explored に残り続ける (記憶される霧)
##   - 海は「進めない」ではなく Phase 1 では単純に侵入不可としておく
##     (Canvas版では passable だが、Phase 1 は陸の探索感を優先する)

const VISION_RADIUS := 3       # Canvas版 VISION_RADII の初期段階 (2〜5) に合わせた値

var grid_x: int = 0
var grid_y: int = 0

## 探索済みタイル。キー "x,y" → true。将来のセーブに載せやすい素の辞書で持つ。
var explored: Dictionary = {}

## プレイヤーを指定タイルへ置く。探索済みの記憶は消さない。
## (新規ゲームで霧をリセットしたい場合は reset_fog() を別途呼ぶ)
func place_at(pos: Vector2i) -> void:
	grid_x = pos.x
	grid_y = pos.y

## 探索済みの記憶を消す。新規ゲーム開始時のみ使う。
func reset_fog() -> void:
	explored.clear()

## 指定方向へ移動できるか。マップ外と海はブロックする。
func can_move(tiles: Array, dx: int, dy: int) -> bool:
	var nx := grid_x + dx
	var ny := grid_y + dy
	if nx < 0 or ny < 0 or ny >= tiles.size() or nx >= tiles[0].size():
		return false
	return tiles[ny][nx] != MapGenerator.Tile.SEA

## 移動を試みる。成功したら true (呼び出し側でターンを進める)。
func try_move(tiles: Array, dx: int, dy: int) -> bool:
	if not can_move(tiles, dx, dy):
		return false
	grid_x += dx
	grid_y += dy
	return true

## 現在地の周囲を探索済みにする。移動後・待機後の両方で呼ぶ。
func reveal(tiles: Array) -> void:
	var h: int = tiles.size()
	var w: int = tiles[0].size()
	var r := VISION_RADIUS
	for y in range(grid_y - r, grid_y + r + 1):
		if y < 0 or y >= h:
			continue
		for x in range(grid_x - r, grid_x + r + 1):
			if x < 0 or x >= w:
				continue
			# 円形に見せる (正方形だと視界が四角くて硬い)
			if Vector2(x - grid_x, y - grid_y).length() <= r + 0.35:
				explored["%d,%d" % [x, y]] = true

func is_explored(x: int, y: int) -> bool:
	return explored.has("%d,%d" % [x, y])
