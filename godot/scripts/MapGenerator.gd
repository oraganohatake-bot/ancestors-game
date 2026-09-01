extends RefCounted
class_name MapGenerator
##
## ランダム島マップ生成 (Phase 1)。
##
## Canvas版 (../game.js) の生成方針を Godot で再構築したもの:
##   1. 中心が高い高度フィールドを作り、散らしたピークで起伏をつける
##   2. 高度のパーセンタイルで SEA / GRASS / MOUNTAIN / HIGH_MOUNTAIN に切る
##   3. 外周 EDGE_SEA_MARGIN 枚を必ず SEA にして島を海で閉じる
##   4. 内陸に取り残された「湖」状の SEA を GRASS に戻す (海は外周と繋がったものだけ)
##   5. 高山から海へ川を流し、その周辺を森にする (川が森の目印になる)
##
## Phase 1 では資源・動物・遺跡は載せない。地形だけを返す。

# ── タイル種別 ───────────────────────────────────────────────────
# 値は Canvas版 (game.js の Tile) と揃えてある。将来セーブ互換を取りやすくするため。
enum Tile { SEA = 0, GRASS = 1, FOREST = 2, MOUNTAIN = 3, DEEP_FOREST = 5, HIGH_MOUNTAIN = 6, RIVER = 7 }

const MAP_W := 48
const MAP_H := 32

const EDGE_SEA_MARGIN := 2      # 外周この枚数は必ず海
const RIVER_MAX_SOURCES := 3
const RIVER_SOURCE_SPACING := 8 # 川の源(高山頂)同士の最小間隔
const RIVER_DENSE_DIST := 1     # 川からこの距離まで → 大きい森
const RIVER_SMALL_DIST := 3     # さらにこの距離まで → 小さい森

var _rng := RandomNumberGenerator.new()

## マップを生成して 2次元配列 tiles[y][x] を返す。
func generate(seed_value: int = 0) -> Array:
	if seed_value == 0:
		_rng.randomize()
	else:
		_rng.seed = seed_value

	var height := _build_height_field()
	var tiles := _height_to_tiles(height)
	_force_sea_border(tiles)
	_fill_inland_lakes(tiles)
	_carve_rivers(tiles, height)
	_grow_forests(tiles)
	return tiles

# ── 1) 高度フィールド ────────────────────────────────────────────
func _build_height_field() -> Array:
	var cx := (MAP_W - 1) / 2.0
	var cy := (MAP_H - 1) / 2.0

	# ピーク: 中心の island core + 外周寄りに散らした小ピーク。
	# 等間隔に置くと「マス目っぽい島」になるので角度/距離をランダムに散らす。
	var peaks: Array = []
	peaks.append({"x": cx, "y": cy, "r": minf(MAP_W, MAP_H) * 0.42, "amp": 0.52})
	var n_peaks := _rng.randi_range(3, 5)
	for i in n_peaks:
		var ang := _rng.randf() * TAU
		var dist := _rng.randf_range(0.14, 0.30)
		peaks.append({
			"x": cx + cos(ang) * dist * MAP_W,
			"y": cy + sin(ang) * dist * MAP_H,
			"r": minf(MAP_W, MAP_H) * _rng.randf_range(0.10, 0.22),
			"amp": _rng.randf_range(0.28, 0.50),
		})

	# 細かい起伏用のノイズ (地形の輪郭をギザつかせる)
	var noise := FastNoiseLite.new()
	noise.seed = _rng.randi()
	noise.frequency = 0.09
	noise.fractal_octaves = 3

	var height: Array = []
	for y in MAP_H:
		var row := PackedFloat32Array()
		row.resize(MAP_W)
		for x in MAP_W:
			var h := 0.0
			for p in peaks:
				var d := Vector2(x - p["x"], y - p["y"]).length()
				var falloff: float = maxf(0.0, 1.0 - d / p["r"])
				h += p["amp"] * falloff * falloff      # 二乗で山裾をなだらかに
			# островを楕円状に閉じる: 中心から遠いほど下げる (端は必ず海になる)
			var edge_t := Vector2((x - cx) / (MAP_W * 0.5), (y - cy) / (MAP_H * 0.5)).length()
			h -= pow(maxf(0.0, edge_t), 3.0) * 0.55
			h += noise.get_noise_2d(float(x), float(y)) * 0.13
			row[x] = h
		height.append(row)
	return height

# ── 2) 高度 → タイル ─────────────────────────────────────────────
func _height_to_tiles(height: Array) -> Array:
	# 絶対値ではなくパーセンタイルで切る。生成のたびに陸/海の比率が安定する。
	var flat: Array[float] = []
	for row in height:
		for v in row:
			flat.append(v)
	flat.sort()

	var sea_level := _percentile(flat, 0.40)     # 下位40% → 海
	var mtn_level := _percentile(flat, 0.875)    # 上位12.5% → 山岳帯
	var high_level := _percentile(flat, 0.965)   # さらに上位 → 高い山

	var tiles: Array = []
	for y in MAP_H:
		var row: Array[int] = []
		for x in MAP_W:
			var h: float = height[y][x]
			if h < sea_level:
				row.append(Tile.SEA)
			elif h >= high_level:
				row.append(Tile.HIGH_MOUNTAIN)
			elif h >= mtn_level:
				row.append(Tile.MOUNTAIN)
			else:
				row.append(Tile.GRASS)
		tiles.append(row)
	return tiles

func _percentile(sorted_values: Array, t: float) -> float:
	if sorted_values.is_empty():
		return 0.0
	var idx := int(clampf(t, 0.0, 1.0) * (sorted_values.size() - 1))
	return sorted_values[idx]

# ── 3) 外周を海で閉じる ──────────────────────────────────────────
func _force_sea_border(tiles: Array) -> void:
	for y in MAP_H:
		for x in MAP_W:
			if x < EDGE_SEA_MARGIN or y < EDGE_SEA_MARGIN \
					or x >= MAP_W - EDGE_SEA_MARGIN or y >= MAP_H - EDGE_SEA_MARGIN:
				tiles[y][x] = Tile.SEA

# ── 4) 内陸の孤立した海を陸に戻す ────────────────────────────────
func _fill_inland_lakes(tiles: Array) -> void:
	# 外周から flood fill して「本物の海」を特定する。到達しない SEA は湖なので
	# GRASS に戻す。これで島の内側に不自然な水たまりが残らない。
	var ocean := {}
	var queue: Array[Vector2i] = []

	var push_ocean := func(x: int, y: int) -> void:
		if x < 0 or y < 0 or x >= MAP_W or y >= MAP_H:
			return
		var key := y * MAP_W + x
		if tiles[y][x] == Tile.SEA and not ocean.has(key):
			ocean[key] = true
			queue.append(Vector2i(x, y))

	for x in MAP_W:
		push_ocean.call(x, 0)
		push_ocean.call(x, MAP_H - 1)
	for y in MAP_H:
		push_ocean.call(0, y)
		push_ocean.call(MAP_W - 1, y)

	while not queue.is_empty():
		var c: Vector2i = queue.pop_back()
		push_ocean.call(c.x + 1, c.y)
		push_ocean.call(c.x - 1, c.y)
		push_ocean.call(c.x, c.y + 1)
		push_ocean.call(c.x, c.y - 1)

	for y in MAP_H:
		for x in MAP_W:
			if tiles[y][x] == Tile.SEA and not ocean.has(y * MAP_W + x):
				tiles[y][x] = Tile.GRASS

# ── 5) 川: 高山頂から海へ下る ────────────────────────────────────
func _carve_rivers(tiles: Array, height: Array) -> void:
	# 川の源になる高山を、互いに離れた位置から選ぶ (源が固まると川が束になる)。
	var peaks: Array = []
	for y in MAP_H:
		for x in MAP_W:
			if tiles[y][x] == Tile.HIGH_MOUNTAIN:
				peaks.append({"x": x, "y": y, "h": height[y][x]})
	peaks.sort_custom(func(a, b): return a["h"] > b["h"])

	var sources: Array = []
	for p in peaks:
		if sources.size() >= RIVER_MAX_SOURCES:
			break
		var too_close := false
		for s in sources:
			if Vector2(p["x"] - s["x"], p["y"] - s["y"]).length() < RIVER_SOURCE_SPACING:
				too_close = true
				break
		if not too_close:
			sources.append(p)

	for s in sources:
		_flow_river(tiles, height, int(s["x"]), int(s["y"]))

func _flow_river(tiles: Array, height: Array, sx: int, sy: int) -> void:
	# 最急降下で海まで流す。行き止まりでは近傍のランダムな低い方へ逃がす。
	var x := sx
	var y := sy
	var steps := 0
	var max_steps := MAP_W * MAP_H
	while steps < max_steps:
		steps += 1
		if tiles[y][x] == Tile.SEA:
			return                                   # 海に到達 = 川の完成
		if tiles[y][x] != Tile.HIGH_MOUNTAIN:
			tiles[y][x] = Tile.RIVER

		var best_x := -1
		var best_y := -1
		var best_h: float = height[y][x]
		for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = x + d.x
			var ny: int = y + d.y
			if nx < 0 or ny < 0 or nx >= MAP_W or ny >= MAP_H:
				continue
			if tiles[ny][nx] == Tile.RIVER:
				continue                             # 既存の川に合流させない (束を防ぐ)
			var nh: float = height[ny][nx]
			if nh < best_h:
				best_h = nh
				best_x = nx
				best_y = ny
		if best_x < 0:
			return                                   # 窪地で行き止まり
		x = best_x
		y = best_y

# ── 6) 川沿いに森を育てる ────────────────────────────────────────
func _grow_forests(tiles: Array) -> void:
	# 川からの距離で森の種類を決める。近い=大きい森 / 少し離れる=小さい森。
	# 「川を辿れば森がある」という Canvas版の読みやすさをそのまま残す。
	var dist := _river_distance_field(tiles)
	for y in MAP_H:
		for x in MAP_W:
			if tiles[y][x] != Tile.GRASS:
				continue
			var d: int = dist[y][x]
			if d < 0:
				continue
			if d <= RIVER_DENSE_DIST:
				tiles[y][x] = Tile.DEEP_FOREST
			elif d <= RIVER_SMALL_DIST:
				# 外側はまばらに: 全部森にすると島が森で埋まって単調になる
				if _rng.randf() < 0.55:
					tiles[y][x] = Tile.FOREST

func _river_distance_field(tiles: Array) -> Array:
	# 川タイルからの BFS 距離。川が無い場合は全て -1 (森なし)。
	var dist: Array = []
	var queue: Array[Vector2i] = []
	for y in MAP_H:
		var row: Array[int] = []
		for x in MAP_W:
			if tiles[y][x] == Tile.RIVER:
				row.append(0)
				queue.append(Vector2i(x, y))
			else:
				row.append(-1)
		dist.append(row)

	var head := 0
	while head < queue.size():
		var c: Vector2i = queue[head]
		head += 1
		var d: int = dist[c.y][c.x]
		for dd: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var nx: int = c.x + dd.x
			var ny: int = c.y + dd.y
			if nx < 0 or ny < 0 or nx >= MAP_W or ny >= MAP_H:
				continue
			if dist[ny][nx] != -1:
				continue
			if d + 1 > RIVER_SMALL_DIST:
				continue
			dist[ny][nx] = d + 1
			queue.append(Vector2i(nx, ny))
	return dist

## プレイヤーの初期位置を探す。島の中心に近い GRASS を選ぶ。
func find_spawn(tiles: Array) -> Vector2i:
	var cx := MAP_W / 2
	var cy := MAP_H / 2
	var best := Vector2i(cx, cy)
	var best_d := 1e9
	for y in MAP_H:
		for x in MAP_W:
			var t: int = tiles[y][x]
			if t != Tile.GRASS and t != Tile.FOREST:
				continue
			var d := Vector2(x - cx, y - cy).length()
			if d < best_d:
				best_d = d
				best = Vector2i(x, y)
	return best
