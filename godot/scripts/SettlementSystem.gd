extends RefCounted
class_name SettlementSystem
##
## 拠点 (BASE / 将来の CAMP) と、その備蓄 (Phase 2B)。
##
## Phase 2B では BASE ひとつだけ。ただしデータは最初から複数拠点の配列で持ち、
## type で BASE/CAMP を区別する形にしてある。Phase 2C で CAMP を足すときに
## この構造のまま append すれば済む (Main.gd 側の呼び出しも変えなくていい)。
##
## 拠点1件の形:
##   { "type": "BASE", "position": Vector2i, "storage": { fruit:0, wood:0, ... } }
##
## Phase 2B で入れないもの (意図的):
##   - CAMP の設置コスト/条件      … Phase 2C
##   - 人口・労働者・消費          … 拠点が資源を「使う」のは人口が入ってから
##   - 集落資源圧による周辺枯渇    … 同上

const TYPE_BASE := "BASE"
const TYPE_CAMP := "CAMP"

## 拠点リスト。Phase 2B では BASE 1件のみ。
var settlements: Array[Dictionary] = []

func reset() -> void:
	settlements.clear()

## 拠点を作る。備蓄は全資源種を 0 で初期化しておく (キー欠けを気にしなくて済む)。
func add_settlement(type: String, position: Vector2i) -> Dictionary:
	var storage := {}
	for r in ResourceSystem.ORDER:
		storage[r] = 0
	var s := {"type": type, "position": position, "storage": storage}
	settlements.append(s)
	return s

## ゲーム開始時の BASE を作る。
func create_base(position: Vector2i) -> Dictionary:
	return add_settlement(TYPE_BASE, position)

## その座標にある拠点。無ければ空辞書。
func settlement_at(x: int, y: int) -> Dictionary:
	for s in settlements:
		var p: Vector2i = s["position"]
		if p.x == x and p.y == y:
			return s
	return {}

func has_settlement_at(x: int, y: int) -> bool:
	return not settlement_at(x, y).is_empty()

## 最初の BASE。Phase 2B では常にこれ1件。
func get_base() -> Dictionary:
	for s in settlements:
		if s["type"] == TYPE_BASE:
			return s
	return {}

## 拠点へ資源を積む。実際に積んだ合計個数を返す。
func deposit(settlement: Dictionary, amounts: Dictionary) -> int:
	var total := 0
	var storage: Dictionary = settlement["storage"]
	for r in amounts:
		var n: int = amounts[r]
		if n <= 0:
			continue
		storage[r] = storage.get(r, 0) + n
		total += n
	return total

## HUD 用の1行表示。スマホの縦を圧迫しないよう短い記号で並べる。
func storage_text(settlement: Dictionary) -> String:
	if settlement.is_empty():
		return ""
	var storage: Dictionary = settlement["storage"]
	var parts: Array[String] = []
	for r in ResourceSystem.ORDER:
		parts.append("%s %d" % [ResourceSystem.SHORT_LABELS[r], storage.get(r, 0)])
	return "BASE  " + " ".join(parts)
