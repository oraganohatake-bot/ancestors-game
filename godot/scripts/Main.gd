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
var resources := ResourceSystem.new()
var settlements := SettlementSystem.new()

var tiles: Array = []
var log_lines: Array[String] = []

@onready var map_view: MapView = %MapView
@onready var map_camera: Camera2D = %MapCamera
@onready var status_label: Label = %StatusLabel
@onready var terrain_label: Label = %TerrainLabel
@onready var inventory_label: Label = %InventoryLabel
@onready var storage_label: Label = %StorageLabel
@onready var log_label: Label = %LogLabel
@onready var btn_gather: Button = %BtnGather
@onready var btn_deposit: Button = %BtnDeposit

func _ready() -> void:
	# 毎ターンの資源回復を TurnSystem に任せる (Main は流れだけを持つ)
	turn_system.resources = resources
	# 方向ボタン: 押しっぱなしでの連打は Phase 1 では不要 (1タップ1マス)
	%BtnUp.pressed.connect(_on_move_pressed.bind("up"))
	%BtnDown.pressed.connect(_on_move_pressed.bind("down"))
	%BtnLeft.pressed.connect(_on_move_pressed.bind("left"))
	%BtnRight.pressed.connect(_on_move_pressed.bind("right"))
	%BtnWait.pressed.connect(_on_wait_pressed)
	%BtnGather.pressed.connect(_on_gather_pressed)
	%BtnDeposit.pressed.connect(_on_deposit_pressed)
	%BtnNewGame.pressed.connect(new_game)
	# SubViewportContainer.stretch = true なので SubViewport は
	# コンテナサイズに自動追従する (端末ごとの縦横比はここで吸収される)。
	new_game()

func new_game() -> void:
	# マップと資源で同じ seed を使い、「このマップならこの資源配置」を固定する。
	var seed_value := randi() & 0x7fffffff
	tiles = map_gen.generate(seed_value)
	resources.generate(tiles, seed_value)
	resources.reset_inventory()
	turn_system.reset()
	# 開始地点をそのまま BASE にする。ここが往復の起点になる。
	var spawn := map_gen.find_spawn(tiles)
	settlements.reset()
	settlements.create_base(spawn)
	player.reset_fog()
	player.place_at(spawn)
	player.reveal(tiles)
	log_lines.clear()
	_add_log("ここに拠点を築いた。")
	map_view.setup(tiles, player, resources, settlements)
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
	if event.is_action_pressed("gather"):
		_on_gather_pressed()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("deposit"):
		_on_deposit_pressed()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("wait_turn"):
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

## 採集。足元→隣接の順に探し、見つかればターンを消費する。
## 何も無ければターンは進めない (空振りでターンを損しない)。
func _on_gather_pressed() -> void:
	# 上限チェックを先に行う。持てないのにターンだけ減るのを防ぐ。
	if resources.is_full():
		_add_log("持ちきれない。拠点へ戻ろう。")
		_refresh()
		return
	var target = resources.find_gather_target(player.grid_x, player.grid_y)
	if target == null:
		_add_log("近くに採集できるものがない。")
		_refresh()
		return
	var got := resources.gather(target.x, target.y)
	if got.is_empty():
		_add_log("近くに採集できるものがない。")
		_refresh()
		return
	turn_system.advance_turn()
	var label: String = ResourceSystem.LABELS.get(got["type"], got["type"])
	_add_log("%s を %d 採集した。" % [label, got["amount"]])
	if got["depleted"]:
		_add_log("ここは採り尽くした。")
	if resources.is_full():
		_add_log("もう持てない。")
	_refresh()

## 納品。BASE の上にいて、かつ所持品がある場合のみ成功しターンを消費する。
func _on_deposit_pressed() -> void:
	var settlement := settlements.settlement_at(player.grid_x, player.grid_y)
	if settlement.is_empty():
		_add_log("ここは拠点ではない。")
		_refresh()
		return
	if resources.carried_total() <= 0:
		_add_log("納めるものがない。")
		_refresh()
		return
	var taken := resources.take_all()
	var total := settlements.deposit(settlement, taken)
	turn_system.advance_turn()
	_add_log("拠点に %d 納めた。" % total)
	_refresh()

func _on_wait_pressed() -> void:
	player.reveal(tiles)
	turn_system.advance_turn()
	_add_log("その場で待った。")
	_refresh()

# ── 表示更新 ─────────────────────────────────────────────────────
func _refresh() -> void:
	# 採集対象を先に決めてから描く (マップ上の強調とボタン表示を一致させる)
	var target = resources.find_gather_target(player.grid_x, player.grid_y)
	map_view.gather_target = target
	map_view.queue_redraw()
	_update_gather_button(target)
	_update_deposit_button()
	# プレイヤー中心カメラ (マップは画面に収まらないのでスクロールさせる)
	map_camera.position = Vector2(
		player.grid_x * MapView.TILE_PX + MapView.TILE_PX * 0.5,
		player.grid_y * MapView.TILE_PX + MapView.TILE_PX * 0.5)
	status_label.text = turn_system.status_text()
	terrain_label.text = "足元: %s" % _terrain_name(tiles[player.grid_y][player.grid_x])
	inventory_label.text = resources.inventory_text()
	storage_label.text = settlements.storage_text(settlements.get_base())
	log_label.text = "\n".join(log_lines)

## 採れるものが無いときはボタンを無効化する。
## 「押せるのに何も起きない」を無くしてスマホでの空タップを減らす。
func _update_gather_button(target) -> void:
	if resources.is_full():
		btn_gather.disabled = true
		btn_gather.text = "満杯"
		return
	if target == null:
		btn_gather.disabled = true
		btn_gather.text = "採る"
		return
	btn_gather.disabled = false
	var node := resources.node_at(target.x, target.y)
	var type: String = node.get("type", "")
	btn_gather.text = "採る:%s" % ResourceSystem.SHORT_LABELS.get(type, "?")

## 納品ボタン: BASE 上かつ所持品ありのときだけ押せる。
func _update_deposit_button() -> void:
	var on_base := settlements.has_settlement_at(player.grid_x, player.grid_y)
	var carrying := resources.carried_total()
	var can_deposit := on_base and carrying > 0
	btn_deposit.disabled = not can_deposit
	btn_deposit.text = "納品:%d" % carrying if can_deposit else "納品"

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
