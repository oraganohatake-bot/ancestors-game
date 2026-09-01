extends RefCounted
class_name TurnSystem
##
## ターン進行 (Phase 1)。
##
## 今はターン数を数え、年/世代の表示用カウンタを進めるだけ。
## Phase 1 の流れは Main.gd 側で:
##     移動 → 探索範囲更新 → advance_turn() → 描画更新
##
## Phase 2 以降でここに載せる予定の処理を _on_turn_advanced() に
## 順序付きのフックとして先に置いてある。呼び出し側 (Main.gd) を
## 変えずに中身だけ足していけるようにするのが狙い。

signal turn_advanced(turn: int)

const TURNS_PER_YEAR := 12       # Canvas版と同じく 1年 = 12ターン相当の見せ方

var turn: int = 0
var year: int = 1
var generation: int = 1

func reset() -> void:
	turn = 0
	year = 1
	generation = 1

## 1ターン進める。移動/待機のどちらでも呼ぶ。
func advance_turn() -> void:
	turn += 1
	year = 1 + int(turn / TURNS_PER_YEAR)
	_on_turn_advanced()
	turn_advanced.emit(turn)

## Phase 2 以降の追加ポイント。
## 意図的に順序を固定しておく (資源 → 人口 → 労働 → 圧力 → 動物 → イベント)。
func _on_turn_advanced() -> void:
	_regrow_resources()
	_grow_population()
	_process_workers()
	_apply_settlement_pressure()
	_move_animals()
	_process_events()

# ── Phase 2 以降で実装するフック群 (今は意図的に空) ──────────────
func _regrow_resources() -> void:
	pass          # 資源回復 (森の果物 / 山の石 の regrow)

func _grow_population() -> void:
	pass          # 人口増加 (食料と拠点キャパから)

func _process_workers() -> void:
	pass          # 労働者処理 (採集/運搬の自動割当)

func _apply_settlement_pressure() -> void:
	pass          # 集落資源圧 (CAMP 周辺の枯渇)

func _move_animals() -> void:
	pass          # 動物移動

func _process_events() -> void:
	pass          # イベント処理 (天候/災害/来訪者)

## 表示用の短い状態文字列。
func status_text() -> String:
	return "世代 %d / 年 %d / ターン %d" % [generation, year, turn]
