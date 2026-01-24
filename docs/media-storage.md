```md
# Media Storage — CryptoPayMap v2 (Authoritative)

**File:** `docs/media-storage.md`  
**Status:** Final（画像まわりはこの1枚を正本にする）  
**Scope:** Submit 添付画像のみ（place 本体の公開画像は別）  
**Covers only:**  
1) 保存先（R2）  
2) 公開/非公開（gallery vs proof/evidence）  
3) URL発行（public URL / internal URL、署名URL禁止）  
4) 無料運営のための保持期限＆圧縮ルール

---

## 1) 保存先（R2）

- Submit 添付画像（`submission_media`）の保存先は **Cloudflare R2** を使用する。
- DB に画像バイナリを保存しない。
- オブジェクトキー（例・規約）：
  - `submissions/{submissionId}/{kind}/{mediaId}.webp`
- kind は次の3つのみ：
  - `gallery` / `proof` / `evidence`

---

## 2) 公開/非公開（gallery vs proof/evidence）

- `gallery`：**公開OK**（サイト閲覧者が見られる）
- `proof`：**非公開**（運営のみ。owner申請の証拠）
- `evidence`：**非公開**（運営のみ。reportの証拠）

> UI/運用の鉄則：**proof/evidence を public UI/API に出さない**（ログ含む）。

---

## 3) URL発行（public URL / internal URL、署名URL禁止）

### 3.1 永続URLの正本
`submission_media.url` は **永続参照**として DB に保存する。  
そのため、`url` に保存するのは **アプリの配信エンドポイントURL** とする。

- gallery（public）：
  - `GET /api/media/submissions/{submissionId}/gallery/{mediaId}`
- proof/evidence（internal）：
  - `GET /api/internal/media/submissions/{submissionId}/{kind}/{mediaId}`  
    ※ kind は `proof` または `evidence`

### 3.2 禁止事項（最重要）
- **署名URL（期限付きURL）を `submission_media.url` に保存してはならない。**  
  理由：期限切れで参照不能になり、仕様の「永続参照」を破壊するため。

### 3.3 キャッシュ方針（要点のみ）
- public gallery：キャッシュ可
- internal proof/evidence：`Cache-Control: no-store`（キャッシュ禁止）

---

## 4) 無料運営のための保持期限＆圧縮ルール

### 4.1 圧縮/変換（必須）
アップロード時にサーバ側で必ず行う：
- EXIF削除
- WebP化（固定圧縮）
- 最大辺リサイズ（上限固定）
- 形式制限（jpeg/png/webp）＋サイズ上限（≤2MB）＋枚数上限（kind別）

目的：
- 個人情報漏洩（EXIF）防止
- 保存量/転送量を抑え、無料運営を維持する

### 4.2 保持期限（固定方針）
- `proof` と `evidence` は **恒久保存しない**（保持期限を必ず設ける）。
  - 推奨：`proof` 90日 / `evidence` 180日（運用開始時に確定）
- 期限経過後は R2 から削除し、DBは次のどちらかに統一：
  - (a) 行削除
  - (b) tombstone（削除済み）に置換

- `gallery` は公開候補として長期保持してよいが、容量圧迫時は採用されなかったものから整理対象にできる。

---

## References（整合先）
- `docs/api.md`（Media endpoints / URL禁止事項）
- `docs/ops.md`（R2 env / 変換 / フェイルセーフ）
- `docs/policies.md`（公開範囲 / retention の原則）
```
