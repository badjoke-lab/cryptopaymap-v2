# Place系4クラス フィールド差分表

## 対象
- `Place` (`types/places.ts`)
- `PlaceSummary` (`app/api/places/route.ts` の `toSummary` 返却shape)
- `DbPlace` (`lib/places/detail.ts`)
- `FallbackPlace` (`lib/places/detail.ts` の `type FallbackPlace = (typeof fallbackPlaces)[number]`。`fallbackPlaces` は `Place[]`)

---

## 表1: フィールド一覧（全列挙）

| field | Place | PlaceSummary | DbPlace | FallbackPlace |
|---|---|---|---|---|
| id | ○ `string` | ○ `string` | ○ `string` | ○ `string` |
| name | ○ `string` | ○ `string` | ○ `string` | ○ `string` |
| category | ○ `string` | ○ `string` | ○ `string \| null` | ○ `string` |
| verification | ○ `"owner" \| "community" \| "directory" \| "unverified"` | ○ `Verification`（同等union） | ○ `string \| null` | ○ `"owner" \| "community" \| "directory" \| "unverified"` |
| lat | ○ `number` | ○ `number` | ○ `number` | ○ `number` |
| lng | ○ `number` | ○ `number` | ○ `number` | ○ `number` |
| country | ○ `string` | ○ `string` | ○ `string \| null` | ○ `string` |
| city | ○ `string` | ○ `string` | ○ `string \| null` | ○ `string` |
| address_full | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| supported_crypto | ○ `string[]`（optional） | × | × | ○ `string[]`（optional） |
| photos | ○ `string[] \| null`（optional） | × | × | ○ `string[] \| null`（optional） |
| social_twitter | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| social_instagram | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| social_website | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| description | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| accepted | ○ `string[]`（optional） | ○ `string[]` | × | ○ `string[]`（optional） |
| address | ○ `string`（optional） | × | ○ `string \| null` | ○ `string`（optional） |
| website | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| phone | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| twitter | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| instagram | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| facebook | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| amenities | ○ `string[] \| null`（optional） | × | ○ `string[] \| string \| null` | ○ `string[] \| null`（optional） |
| submitterName | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| images | ○ `string[]`（optional） | × | × | ○ `string[]`（optional） |
| updatedAt | ○ `string`（optional） | × | × | ○ `string`（optional） |
| coverImage | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| about | ○ `string \| null`（optional） | × | ○ `string \| null` | ○ `string \| null`（optional） |
| paymentNote | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| payment_note | × | × | ○ `string \| null` | × |
| submitter_name | × | × | ○ `string \| null` | × |
| hours | × | × | ○ `string \| null` | × |

---

## 表2: UIに必要な情報カテゴリで再分類

| category | field | Place | PlaceSummary | DbPlace | FallbackPlace |
|---|---|---|---|---|---|
| identity | id | ○ `string` | ○ `string` | ○ `string` | ○ `string` |
| identity | name | ○ `string` | ○ `string` | ○ `string` | ○ `string` |
| identity | category | ○ `string` | ○ `string` | ○ `string \| null` | ○ `string` |
| identity | verification | ○ union literal | ○ `Verification` | ○ `string \| null` | ○ union literal |
| geo | lat | ○ `number` | ○ `number` | ○ `number` | ○ `number` |
| geo | lng | ○ `number` | ○ `number` | ○ `number` | ○ `number` |
| geo | address_full | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| geo | country | ○ `string` | ○ `string` | ○ `string \| null` | ○ `string` |
| geo | city | ○ `string` | ○ `string` | ○ `string \| null` | ○ `string` |
| geo | address | ○ `string`（optional） | × | ○ `string \| null` | ○ `string`（optional） |
| payment | accepted | ○ `string[]`（optional） | ○ `string[]` | × | ○ `string[]`（optional） |
| payment | supported_crypto | ○ `string[]`（optional） | × | × | ○ `string[]`（optional） |
| payment | paymentNote | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| payment | payments | × | × | ×（※`DbPlace`本体には無い。別query結果で組み立て） | × |
| payment | payment_note | × | × | ○ `string \| null` | × |
| socials | website | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| socials | twitter | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| socials | instagram | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| socials | facebook | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| socials | social_website | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| socials | social_twitter | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| socials | social_instagram | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| media | photos | ○ `string[] \| null`（optional） | × | × | ○ `string[] \| null`（optional） |
| media | images | ○ `string[]`（optional） | × | × | ○ `string[]`（optional） |
| media | coverImage | ○ `string \| null`（optional） | × | × | ○ `string \| null`（optional） |
| amenities | amenities | ○ `string[] \| null`（optional） | × | ○ `string[] \| string \| null` | ○ `string[] \| null`（optional） |
| amenities | amenities_notes | × | × | × | × |

### 備考
- `FallbackPlace` は `type FallbackPlace = (typeof fallbackPlaces)[number]` で、`fallbackPlaces` が `Place[]` と宣言されているため、実体型は `Place` と同一。 
- `PlaceSummary` は `toSummary` で `Place` から `id/name/lat/lng/verification/category/city/country/accepted` のみ抽出して返却。 
- `DbPlace` は DB row のsnake_caseを含み、`payment_note` と `submitter_name` を持つ一方で camelCase の `paymentNote`/`submitterName` は持たない。 
