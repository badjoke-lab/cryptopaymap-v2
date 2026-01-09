# DATA_SOURCE / NEXT_PUBLIC_DATA_SOURCE

`/api/places` のデータ取得元を切り替えるための設定です。DB 障害時でも 0 件で落ちないように `auto` がデフォルトです。

## 優先順位

1. `DATA_SOURCE`
2. `NEXT_PUBLIC_DATA_SOURCE`
3. 既定値: `auto`

## 値と挙動

| 値 | 挙動 |
| --- | --- |
| `auto` | まず DB を試し、失敗 / 0 件 / 例外の場合は `data/places.json` にフォールバック |
| `db` | DB のみ使用。DB 失敗時は `503` を返す |
| `json` | 常に `data/places.json` を返す |

## 追加ヘッダー

レスポンスには `X-CPM-Data-Source` が付きます。

| 値 | 説明 |
| --- | --- |
| `db` | DB から取得 |
| `json` | JSON 保険データから取得 |
