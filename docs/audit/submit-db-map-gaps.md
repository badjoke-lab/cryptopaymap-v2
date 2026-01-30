# [CHK-02] submit/db/map 差分監査レポート

## 対象範囲
- app/submit/**
- app/api/submissions/**
- app/api/internal/submissions/**
- app/internal/**
- components/submit/**
- components/internal/**
- lib/submissions/**
- lib/db/**
- components/map/**

## チェック結果サマリ
- **欠落しているルート/ページ**: 画像配信用の `/api/media/submissions/...` および `/api/internal/media/submissions/...` が参照されているが、対応ルートが見当たらないため欠落扱い。
- **confirm-only POST**: `POST /api/submissions` が multipart 以外の JSON も受理するため、確認画面経由のみを保証できない。
- **owner/community/report 必須入力**: UI では必須に見えるがサーバー側で未強制の項目あり（特に submitter name / report placeName）。
- **証拠URL欄**: URL 入力欄が UI/型/ペイロードに存在しない。
- **media（R2保存/配信）**: R2 への保存は実装済みだが、配信ルートが欠落。
- **amenities**: DB/API にはあるが Submit UI/ペイロードにない。
- **approve/promote 副作用分離**: approve は status 更新のみ・promote は place 作成/更新で分離されている（現時点で違反は見当たらず）。

## 修正が必要な箇所（パス+行で確定）

### 1) 欠落しているルート/ページ
- **メディア配信ルート未実装**: `/api/media/submissions/...` と `/api/internal/media/submissions/...` が URL 生成で前提になっているが、対応する route 実装が存在しないため配信不可。
  - 参照元（public）: `lib/submissions.ts` L668-L673（`/api/media/submissions/...` を返す）
  - 参照元（internal）: `lib/internal/submissions.ts` L124-L129（`/api/internal/media/submissions/...` を返す）

### 2) confirm-only POST 違反の有無
- **confirm-only をサーバー側で担保していない**: `POST /api/submissions` は multipart だけでなく JSON も受理しており、確認画面経由のみで送信させる制御が存在しない。
  - `lib/submissions.ts` L741-L869（multipart と JSON の両方を処理）

### 3) owner/community/report の必須入力
- **UI と API の必須項目が不一致**: UI では owner/community の submitterName/submitterEmail を必須表示だが、サーバー側は `contactName` を必須としていない（length チェックのみ）。
  - UI 必須表示: `components/submit/SubmitForm.tsx` L503-L520
  - API 必須判定（contactEmail のみ必須）: `lib/submissions.ts` L326-L333, L358
- **report の placeName 必須が API 側で担保されない**: UI は placeName 必須だが、`normalizeSubmission` は report で `placeName` を必須チェックしていない。
  - UI 必須表示: `components/submit/SubmitForm.tsx` L423-L431
  - API 側（report で placeName 必須チェックなし）: `lib/submissions.ts` L308-L313, L372-L404
- **report の submitterName/submitterEmail が UI で optional**: 仕様で必須要件がある場合は未実装。
  - `components/submit/SubmitForm.tsx` L503-L520

### 4) 証拠URL欄の本数・追加UIの有無
- **証拠URL入力が存在しない**: Draft/ペイロード/フォームのいずれにも URL 入力がなく、証拠URL本数の制御が不可能。
  - Draft 型（URL フィールドなし）: `components/submit/types.ts` L3-L35
  - Payload 生成（URL フィールドなし）: `components/submit/payload.ts` L11-L51
  - UI はファイル入力のみ: `components/submit/SubmitForm.tsx` L458-L495

### 5) media（R2保存/配信）の実装有無
- **R2 保存は実装済み**: R2 にアップロードする処理は存在。
  - `lib/storage/r2.ts` L54-L80
  - `lib/submissions.ts` L678-L711
- **配信用 API が欠落**: 生成される URL に対応する route が無く、アップロード後に配信できない。
  - `lib/submissions.ts` L668-L673
  - `lib/internal/submissions.ts` L124-L129

### 6) amenities 等の DB/API/UI 欠落
- **DB/API は対応済み、UI だけ欠落**: DB に amenities 列があり、API も `amenities` を正規化しているが、Submit UI/ペイロードに amenities が無いため入力できない。
  - DB スキーマ: `migrations/compat_v3_min.sql` L100-L112
  - API 正規化: `lib/submissions.ts` L430-L436
  - Payload/Types に amenities がない: `components/submit/types.ts` L3-L35 / `components/submit/payload.ts` L27-L51
  - Place 変換で amenities を参照: `lib/submission-to-place.ts` L65-L88

### 7) approve/promote の副作用分離
- **現状は分離されている**: approve は status 更新＋履歴記録のみ、promote は place 作成/更新を担当。違反は見当たらない。
  - approve: `app/api/internal/submissions/[id]/approve/route.ts` L70-L128
  - promote: `lib/submissions/promote.ts` L108-L308

## 実装タスク起票用メモ（機械的に起票できる粒度）
1. `/api/media/submissions/[submissionId]/gallery/[mediaId]/route.ts` を新規追加（R2 からの読み出し・Content-Type・認可制御を実装）。
2. `/api/internal/media/submissions/[submissionId]/{proof|evidence}/[mediaId]/route.ts` を新規追加（内部認可を実装）。
3. `normalizeSubmission` に report の `placeName` 必須チェックを追加。
4. `normalizeSubmission` に owner/community の `contactName` 必須チェックを追加（仕様が必須の場合）。
5. submit フォーム/型/ペイロードに amenities 入力欄を追加。
6. 証拠URLの入力欄と保存先フィールド（payload + DB もしくは submissions payload 内）を追加。
7. confirm-only のサーバー側担保（トークン/nonce/セッション等）を追加。
