extends Control
##
## ANCESTORS — Godot 4 Phase 1 のエントリポイント。
##
## Phase 1 のスコープ:
##   ランダムマップ / タイル移動 / 探索(記憶される霧) / ターン進行 / スマホ向けUI
## まだ載せないもの:
##   人口・労働者・CAMP・資源枯渇・動物・納品・クラフト
##
## 画面構成 (Canvas版に合わせた縦持ち):
##   上部: ステータス   中央: マップ   下部: ログ + 方向ボタン
##
## ゲーム状態は辞書/配列で素直に持つ。Phase 1 でセーブは作らないが、
## 後から JSON 化しやすい形にしておく。

const MOVE_DIRS := {
	"up": Vector2i(0, -1),
	"down": Vector2i(0, 1),
	"left": Vector2i(-1, 0),
	"right": Vector2i(1, 0),
}

const LOG_LINES := 3          # ログは数行だけ (画面をごちゃつかせない)

var map_gen := MapGenerator.new()
var turn_system := TurnSystem.new()
var player := PlayerController.new()

var tiles: Array = []
var log_lines: Array[String] = []

@onready var map_view: MapView = %MapView
@onready var map_camera: Camera2D = %MapCamera
@onready var status_label: Label = %StatusLabel
@onready var terrain_label: Label = %TerrainLabel
@onready var log_label: Label = %LogLabel

func _ready() -> void:
	# 方向ボタン: 押しっぱなしでの連打は Phase 1 では不要 (1タップ1マス)
	%BtnUp.pressed.connect(_on_move_pressed.bind("up"))
	%BtnDown.pressed.connect(_on_move_pressed.bind("down"))
	%BtnLeft.pressed.connect(_on_move_pressed.bind("left"))
	%BtnRight.pressed.connect(_on_move_pressed.bind("right"))
	%BtnWait.pressed.connect(_on_wait_pressed)
	%BtnNewGame.pressed.connect(new_game)
	# SubViewportContainer.stretch = true なので SubViewport は
	# コンテナサイズに自動追従する (端末ごとの縦横比はここで吸収される)。
	new_game()

func new_game() -> void:
	tiles = map_gen.generate()
	turn_system.reset()
	player.place_at(map_gen.find_spawn(tiles))
	player.reveal(tiles)
	log_lines.clear()
	_add_log("島に降り立った。")
	map_view.setup(tiles, player)
	_refresh()

# ── 入力 ─────────────────────────────────────────────────────────
func _unhandled_input(event: InputEvent) -> void:
	if event.is_echo() or not event.is_pressed():
		return
	for dir_name in MOVE_DIRS:
		if event.is_action_pressed("move_" + dir_name):
			_on_move_pressed(dir_name)
			get_viewport().set_input_as_handled()
			return
	if event.is_action_pressed("wait_turn"):
		_on_wait_pressed()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("new_game"):
		new_game()
		get_viewport().set_input_as_handled()

func _on_move_pressed(dir_name: String) -> void:
	var d: Vector2i = MOVE_DIRS[dir_name]
	if not player.try_move(tiles, d.x, d.y):
		# 海/マップ外。ターンは消費しない (Canvas版の「無駄手が出ない」感覚に合わせる)
		_add_log("そちらへは進めない。")
		_refresh()
		return
	# 移動 → 探索範囲更新 → ターン+1 → 描画更新
	player.reveal(tiles)
	turn_system.advance_turn()
	_add_log("%s へ進んだ。" % _dir_label(dir_name))
	_refresh()

func _on_wait_pressed() -> void:
	player.reveal(tiles)
	turn_system.advance_turn()
	_add_log("その場で待った。")
	_refresh()

# ── 表示更新 ─────────────────────────────────────────────────────
func _refresh() -> void:
	map_view.queue_redraw()
	# プレイヤー中心カメラ (マップは画面に収まらないのでスクロールさせる)
	map_camera.position = Vector2(
		player.grid_x * MapView.TILE_PX + MapView.TILE_PX * 0.5,
		player.grid_y * MapView.TILE_PX + MapView.TILE_PX * 0.5)
	status_label.text = turn_system.status_text()
	terrain_label.text = "足元: %s" % _terrain_name(tiles[player.grid_y][player.grid_x])
	log_label.text = "\n".join(log_lines)

func _add_log(line: String) -> void:
	log_lines.append(line)
	while log_lines.size() > LOG_LINES:
		log_lines.pop_front()

func _dir_label(dir_name: String) -> String:
	match dir_name:
		"up": return "北"
		"down": return "南"
		"left": return "西"
		"right": return "東"
	return dir_name

func _terrain_name(t: int) -> String:
	match t:
		MapGenerator.Tile.SEA: return "海"
		MapGenerator.Tile.GRASS: return "草原"
		MapGenerator.Tile.FOREST: return "小さい森"
		MapGenerator.Tile.DEEP_FOREST: return "大きい森"
		MapGenerator.Tile.MOUNTAIN: return "山"
		MapGenerator.Tile.HIGH_MOUNTAIN: return "高い山"
		MapGenerator.Tile.RIVER: return "川"
	return "?"
