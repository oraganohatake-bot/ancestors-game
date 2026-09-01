# assets

Phase 1 では外部画像素材を使っていません。

マップ・プレイヤーはすべて `scripts/MapView.gd` の `_draw()` による矩形/多角形描画です。
理由:

- 素材制作を待たずに操作感の確認を始められる
- Godot を開けばすぐ動く (インポート待ちもテクスチャ管理も不要)
- Phase 1 のゴールは「絵の完成」ではなく「触れる」こと

## Phase 2 以降で差し替える場合

1. ここに 16px または 20px 角のタイル画像を置く
2. インポート設定で `Filter` を **Nearest** にする (ドット絵がボケないように)
3. `MapView.gd` の `_draw_tile_symbol()` を `draw_texture_rect()` に置き換える
   - `COLORS` / `TILE_PX` はそのまま流用できる
   - タイル種別 → テクスチャの対応辞書を1つ足すだけで済む構造にしてある

TileMapLayer へ移行する場合も、`MapGenerator` が返す `tiles[y][x]` (enum の2次元配列)
をそのまま `set_cell()` に流せます。生成側は描画方式に依存していません。
