extends Control
##
## ANCESTORS — Godot 4 Phase 1 のエントリポイント。
##
## ここまでのスコープ:
##   ランダムマップ / タイル移動 / 探索(記憶される霧) / ターン進行 / スマホ向けUI /
##   資源の配置・採集 / 所持上限 / BASE 納入 / 資源regrow / CAMP (遠征用の中継拠点) /
##   拠点人口 (成長・食料消費・CAMP への移住)
## まだ載せないもの:
##   労働者アサイン・集落資源圧・餓死・動物・狩り・クラフト・CAMP間輸送・セーブ
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
@onready var inventory_label: Label = %InventoryLabel
@onready var storage_label: Label = %StorageLabel
@onready var log_label: Label = %LogLabel
@onready var btn_gather: Button = %BtnGather
@onready var btn_deposit: Button = %BtnDeposit
@onready var btn_camp: Button = %BtnCamp
@onready var btn_send: Button = %BtnSend

func _ready() -> void:
	# 毎ターンの世界側の処理 (資源回復 / 人口 / 食料) は TurnSystem に任せる。
	# Main は入力と表示だけを持つ。
	turn_system.resources = resources
	turn_system.settlements = settlements
	# 方向ボタン: 押しっぱなしでの連打は Phase 1 では不要 (1タップ1マス)
	%BtnUp.pressed.connect(_on_move_pressed.bind("up"))
	%BtnDown.pressed.connect(_on_move_pressed.bind("down"))
	%BtnLeft.pressed.connect(_on_move_pressed.bind("left"))
	%BtnRight.pressed.connect(_on_move_pressed.bind("right"))
	%BtnWait.pressed.connect(_on_wait_pressed)
	%BtnGather.pressed.connect(_on_gather_pressed)
	%BtnDeposit.pressed.connect(_on_deposit_pressed)
	%BtnCamp.pressed.connect(_on_camp_pressed)
	%BtnSend.pressed.connect(_on_send_pressed)
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
	settlements.setup(tiles)
	settlements.create_base(spawn)
	player.reset_fog()
	player.place_at(spawn)
	player.reveal(tiles)
	log_lines.clear()
	_add_log("> 拠点設置")
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
	elif event.is_action_pressed("build_camp"):
		_on_camp_pressed()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("send_pop"):
		_on_send_pressed()
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
		_add_log("> 移動不可")
		_refresh()
		return
	# 移動 → 探索範囲更新 → ターン+1 → 描画更新
	player.reveal(tiles)
	turn_system.advance_turn()
	_add_log("> %s 移動" % _dir_label(dir_name))
	_log_turn_events()
	_refresh()

## 採集。足元→隣接の順に探し、見つかればターンを消費する。
## 何も無ければターンは進めない (空振りでターンを損しない)。
func _on_gather_pressed() -> void:
	# 上限チェックを先に行う。持てないのにターンだけ減るのを防ぐ。
	if resources.is_full():
		_add_log("> 所持上限")
		_refresh()
		return
	var target = resources.find_gather_target(player.grid_x, player.grid_y)
	if target == null:
		_add_log("> 対象なし")
		_refresh()
		return
	var got := resources.gather(target.x, target.y)
	if got.is_empty():
		_add_log("> 対象なし")
		_refresh()
		return
	turn_system.advance_turn()
	var label: String = ResourceSystem.LABELS.get(got["type"], got["type"])
	_add_log("> %s +%d" % [label, got["amount"]])
	if got["depleted"]:
		_add_log("> 枯渇")
	if resources.is_full():
		_add_log("> 所持上限 %d/%d" % [resources.carried_total(), ResourceSystem.CARRY_CAPACITY])
	_log_turn_events()
	_refresh()

## 納品。立っている拠点へ納める。BASE か CAMP かで処理を分けない。
## 拠点外 / 手ぶら の空振りではターンを消費しない。
func _on_deposit_pressed() -> void:
	var here := Vector2i(player.grid_x, player.grid_y)
	var settlement := settlements.settlement_at(here.x, here.y)
	if settlement.is_empty():
		_add_log("> 拠点外")
		_refresh()
		return
	if resources.carried_total() <= 0:
		_add_log("> 所持なし")
		_refresh()
		return
	var taken := resources.take_all()
	var total := settlements.deposit_to_settlement(here, taken)
	turn_system.advance_turn()
	_add_log("> %s 納入 %d" % [settlement["type"], total])
	_log_turn_events()
	_refresh()

## CAMP 設営。BASE の備蓄から資材を払い、今立っている場所に中継拠点を作る。
## 失敗 (地形不適 / 重複 / 上限 / 資材不足) ではターンを消費しない。
func _on_camp_pressed() -> void:
	var here := Vector2i(player.grid_x, player.grid_y)
	var result := settlements.build_camp(here)
	if not result["ok"]:
		_add_log("> %s" % _camp_fail_label(result["reason"]))
		_refresh()
		return
	turn_system.advance_turn()
	_add_log("> CAMP SET %d/%d" % [settlements.camp_count(), SettlementSystem.MAX_CAMPS])
	_log_turn_events()
	_refresh()

func _camp_fail_label(reason: String) -> String:
	match reason:
		SettlementSystem.REASON_TERRAIN: return "設営不可 地形"
		SettlementSystem.REASON_OCCUPIED: return "設営不可 拠点上"
		SettlementSystem.REASON_LIMIT: return "設営不可 上限 %d" % SettlementSystem.MAX_CAMPS
		SettlementSystem.REASON_COST: return "資材不足 W%d S%d" % [
			SettlementSystem.CAMP_COST[ResourceSystem.WOOD],
			SettlementSystem.CAMP_COST[ResourceSystem.STONE]]
	return "設営不可"

## 移住。今立っている CAMP へ BASE から SEND_POP_AMOUNT 人を移す。
## Phase 2E では送った人は「そこにいる」だけで、まだ働かない。
## 失敗 (CAMP外 / BASE人口不足 / CAMP上限) ではターンを消費しない。
func _on_send_pressed() -> void:
	var camp := settlements.settlement_at(player.grid_x, player.grid_y)
	var result := settlements.send_population_to_camp(camp)
	if not result["ok"]:
		_add_log("> %s" % _send_fail_label(result["reason"]))
		_refresh()
		return
	turn_system.advance_turn()
	_add_log("> SEND %d" % result["amount"])
	_log_turn_events()
	_refresh()

func _send_fail_label(reason: String) -> String:
	match reason:
		SettlementSystem.REASON_NOT_CAMP: return "移住不可 CAMP外"
		SettlementSystem.REASON_BASE_LOW: return "移住不可 BASE人口"
		SettlementSystem.REASON_CAMP_FULL: return "移住不可 CAMP上限 %d" % SettlementSystem.CAMP_POPULATION_CAP
	return "移住不可"

## そのターンに起きた人口/食料の出来事を短く出す。
## 集落ごとに並べず1行にまとめる (ログ3行を行動の記録として残す)。
func _log_turn_events() -> void:
	var events: Dictionary = turn_system.last_events
	for s in events.get("grown", []):
		_add_log("> %s POP +1" % s["type"])
	var food: Array = events.get("food", [])
	if food.is_empty():
		return
	var eaten := 0
	var shortage := false
	for r in food:
		eaten += int(r["eaten"])
		if r["shortage"]:
			shortage = true
	if eaten > 0:
		_add_log("> FOOD -%d" % eaten)
	if shortage:
		_add_log("> FOOD LOW")

func _on_wait_pressed() -> void:
	player.reveal(tiles)
	turn_system.advance_turn()
	_add_log("> 待機")
	_log_turn_events()
	_refresh()

# ── 表示更新 ─────────────────────────────────────────────────────
func _refresh() -> void:
	# 採集対象を先に決めてから描く (マップ上の強調とボタン表示を一致させる)
	var target = resources.find_gather_target(player.grid_x, player.grid_y)
	map_view.gather_target = target
	map_view.queue_redraw()
	_update_gather_button(target)
	_update_deposit_button()
	_update_camp_button()
	_update_send_button()
	# プレイヤー中心カメラ (マップは画面に収まらないのでスクロールさせる)
	map_camera.position = Vector2(
		player.grid_x * MapView.TILE_PX + MapView.TILE_PX * 0.5,
		player.grid_y * MapView.TILE_PX + MapView.TILE_PX * 0.5)
	status_label.text = "TURN %04d   CARRY %d/%d" % [
		turn_system.turn, resources.carried_total(), ResourceSystem.CARRY_CAPACITY]
	inventory_label.text = resources.inventory_text()
	# 拠点の上ならその拠点の備蓄、拠点外なら BASE の備蓄 (CAMP 設営の原資) を出す。
	# 全 CAMP の一覧は出さない。行は常に1本だけ。
	var here_settlement := settlements.settlement_at(player.grid_x, player.grid_y)
	var shown := here_settlement if not here_settlement.is_empty() else settlements.get_base()
	storage_label.text = settlements.storage_text(shown)
	log_label.text = "\n".join(log_lines)

## 採れるものが無いときはボタンを無効化する。
## 「押せるのに何も起きない」を無くしてスマホでの空タップを減らす。
func _update_gather_button(target) -> void:
	btn_gather.disabled = resources.is_full() or target == null

## 納品ボタン: 拠点 (BASE/CAMP) の上かつ所持品ありのときだけ押せる。
func _update_deposit_button() -> void:
	var on_settlement := settlements.has_settlement_at(player.grid_x, player.grid_y)
	var carrying := resources.carried_total()
	btn_deposit.disabled = not (on_settlement and carrying > 0)

## 設営ボタン: 地形・重複・上限・資材が全て満たされたときだけ押せる。
func _update_camp_button() -> void:
	btn_camp.disabled = not settlements.can_build_camp(
		Vector2i(player.grid_x, player.grid_y))

## 移住ボタン: CAMP の上で、BASE に余力があり、CAMP に空きがあるときだけ押せる。
func _update_send_button() -> void:
	var here := settlements.settlement_at(player.grid_x, player.grid_y)
	btn_send.disabled = not settlements.can_send_population(here)

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

