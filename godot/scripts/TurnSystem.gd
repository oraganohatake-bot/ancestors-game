extends RefCounted
class_name TurnSystem
##
## ターン進行 (Phase 1 → 2F)。
##
## ターン数を数え、年/世代の表示用カウンタを進め、
## 毎ターンの世界側の処理 (資源回復 / 人口 / 食料) をここで回す。
## Main.gd 側の流れは変わらない:
##     行動 → 探索範囲更新 → advance_turn() → 描画更新
##
## Phase 2 以降の処理は _on_turn_advanced() に順序付きのフックとして
## 並べてある。呼び出し側 (Main.gd) を変えずに中身だけ足していける。

signal turn_advanced(turn: int)

const TURNS_PER_YEAR := 12       # Canvas版と同じく 1年 = 12ターン相当の見せ方

var turn: int = 0
var year: int = 1
var generation: int = 1

## 毎ターン処理の対象。Main.gd から注入する。
## TurnSystem がシステムを直接 new せず参照だけ持つことで、
## Phase 2E 以降で人口/労働者を足すときも同じやり方で並べられる。
var resources: ResourceSystem = null
var settlements: SettlementSystem = null

## このターンに起きた出来事。Main.gd がログに落とすためだけに使う。
## TurnSystem は文言を組み立てない (表示は Main の責務のまま)。
##   { "grown": [...], "food": [...], "work": [...] }
var last_events: Dictionary = {"grown": [], "food": [], "work": []}

func reset() -> void:
	turn = 0
	year = 1
	generation = 1
	last_events = {"grown": [], "food": [], "work": []}

## 1ターン進める。移動/待機のどちらでも呼ぶ。
func advance_turn() -> void:
	turn += 1
	year = 1 + int(turn / TURNS_PER_YEAR)
	_on_turn_advanced()
	turn_advanced.emit(turn)

## 毎ターンの世界処理。順序は固定:
##   資源回復 → 人口成長 → 食料周期 → 労働周期 → 生活圧 → 動物 → イベント
##
## 「回復 → 消費」の順にしてあるので、世界が回復したあとに集落が取り分を引く。
## 人口成長は食料判定より前。成長は「前の周期の食料結果」で決まり、
## その周期の消費結果は次の10ターンに効く。
## 労働は食料消費の後に置く — その周期に採った果物はその場で食べられず、
## 次の食料周期に回る (採ってすぐ帳尻が合うと備蓄の意味が薄れるため)。
func _on_turn_advanced() -> void:
	last_events = {"grown": [], "food": [], "work": []}
	_regrow_resources()
	_grow_population()
	_consume_food()
	_process_workers()
	_apply_settlement_pressure()
	_move_animals()
	_process_events()

# ── Phase 2 以降で実装するフック群 (今は意図的に空) ──────────────
func _regrow_resources() -> void:
	# 枯れたノードのタイマーを進め、0 になったものを満量で復活させる。
	# 復活した座標は Phase 2C では使っていない (見た目の枯渇跡が消えるのが合図)。
	if resources != null:
		resources.tick_regrow()

## 人口増加 (Phase 2E)。拠点ごとに独立。
## 食料不足の拠点と上限に達した拠点は増えない。
func _grow_population() -> void:
	if settlements == null:
		return
	last_events["grown"] = settlements.update_population_growth_all()

## 食料消費 (Phase 2E)。FOOD_INTERVAL_TURNS ターンごとにまとめて引く。
## 拠点ごとに自分の備蓄だけから食う。
func _consume_food() -> void:
	if settlements == null:
		return
	if not settlements.is_food_turn(turn):
		return
	last_events["food"] = settlements.consume_food_all()

## 労働者の自動採集 (Phase 2F)。WORK_INTERVAL_TURNS ターンごと。
## 拠点周辺の実在ノードから取るので、プレイヤーと同じ資源プールを削る。
func _process_workers() -> void:
	if settlements == null or resources == null:
		return
	if not settlements.is_work_turn(turn):
		return
	last_events["work"] = settlements.work_all(resources)

## 集落の生活圧 (Phase 2F)。毎ターン、拠点周辺に薄く効く。
##
## 自動採集とは別物。採集は「取りに行った量」、圧は「住んでいるだけで擦り減る量」。
## ログは出さない — マップに枯渇マークが増えていくことが唯一の合図でいい。
func _apply_settlement_pressure() -> void:
	if settlements == null or resources == null:
		return
	settlements.apply_settlement_pressure_all(resources)

func _move_animals() -> void:
	pass          # 動物移動

func _process_events() -> void:
	pass          # イベント処理 (天候/災害/来訪者)

## 表示用の短い状態文字列。
func status_text() -> String:
	return "世代 %d / 年 %d / ターン %d" % [generation, year, turn]
