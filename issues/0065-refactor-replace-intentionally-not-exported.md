# typedoc.json の intentionallyNotExported を @internal + excludeInternal に置き換える

- Priority: Low
- Created: 2026-06-22
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-replace-intentionally-not-exported
- Polished: {YYYY-MM-DD}

## 目的

`typedoc.json` の `intentionallyNotExported` 配列に手書きで列挙されている 15 個の定数 (`SIGNALING_ROLE_*` / `TRANSPORT_TYPE_*` / `SIGNALING_MESSAGE_TYPE_*`) を、`src/constants.ts` の定義箇所に `@internal` JSDoc を付ける形に置き換える。`typedoc.json` 側では `excludeInternal: true` を有効化し、`intentionallyNotExported` 配列自体を削除する。

## 優先度根拠

Low。typedoc 出力の見た目は変わらず、SDK 利用者には影響しない。`intentionallyNotExported` の列挙保守がコード追加のたびに発生する運用上の負債を減らす refactor の位置付け。0063 (Pages 配信) / 0064 (TYPEDOC.md 表紙刷新) の後で着手する想定。

## 現状

### `intentionallyNotExported` の現行運用

`/Users/voluntas/shiguredo/sora-js-sdk/typedoc.json` の 9 〜 26 行目で以下 15 個の定数を列挙し typedoc の「export されていないシンボルが他から参照されている」警告を抑制している:

```
SIGNALING_ROLE_SENDRECV / SIGNALING_ROLE_SENDONLY / SIGNALING_ROLE_RECVONLY
TRANSPORT_TYPE_WEBSOCKET / TRANSPORT_TYPE_DATACHANNEL
SIGNALING_MESSAGE_TYPE_CLOSE / SIGNALING_MESSAGE_TYPE_CONNECT
SIGNALING_MESSAGE_TYPE_NOTIFY / SIGNALING_MESSAGE_TYPE_OFFER
SIGNALING_MESSAGE_TYPE_PING / SIGNALING_MESSAGE_TYPE_PUSH
SIGNALING_MESSAGE_TYPE_REDIRECT / SIGNALING_MESSAGE_TYPE_RE_OFFER
SIGNALING_MESSAGE_TYPE_REQ_STATS / SIGNALING_MESSAGE_TYPE_SWITCHED
SIGNALING_MESSAGE_TYPE_UPDATE
```

### 定数の実体

`/Users/voluntas/shiguredo/sora-js-sdk/src/constants.ts` で全て `export const NAME = "..." as const;` の形で定義 (`:2-3`, `:6-8`, `:11-33`)。`src/sora.ts` からは再 export されていない (typedoc の entry point は `./src/sora.ts`)。

### `@internal` 流儀の既往

- CHANGES.md `:471` 「[FIX] ユーザが直接使わない型には @internal を指定して .d.ts に含まれないようにする」 (過去対応)
- `issues/closed/0020` の `redact` 関数 `@internal` 付与例 (`:150`)
- `issues/0051` (open) は `dist/sora.d.ts` に `@internal` シンボルが含まれていないことを検証条件にしている (`:57`)

プロジェクト全体としては `@internal` JSDoc + `.d.ts` 除外の流儀が既に定着しており、typedoc 側だけ `intentionallyNotExported` の手書き列挙が残っているのは過去の名残り。

## 設計方針

### `src/constants.ts` 側

対象 15 個の `export const` 定義それぞれに JSDoc `@internal` を 1 行で付ける。

```typescript
/** @internal */
export const SIGNALING_ROLE_SENDRECV = "sendrecv" as const;
```

### `typedoc.json` 側

- `excludeInternal: true` を追加する
- `intentionallyNotExported` 配列を削除する

### 注意点

- typedoc は entry point (`./src/sora.ts`) を起点に型情報を辿る。本 refactor の対象定数は `sora.ts` から再 export されていないため、`@internal` を付けても外部 API 表面 (公開型シンボル) には影響しない
- `dist/sora.d.ts` への影響: 既に `@internal` 付きシンボルは `.d.ts` から除外される運用 (0051 検証条件、過去 CHANGES.md `:471`)。本 refactor で `.d.ts` の表面が変わらないことを確認する
- `intentionallyNotExported` 配列内の 15 個と、`src/constants.ts` の `export const` の全件が一致しているかを実装時に grep で機械的に突き合わせる (`SIGNALING_MESSAGE_TYPE_ANSWER` など `intentionallyNotExported` に無いが `constants.ts` には存在する定数があれば、それらは現在 typedoc 警告を出していない = 何かから参照されていない、なので `@internal` 対応は不要)

## 完了条件

### コード変更

- [ ] `src/constants.ts` の対象 15 個の `export const` に `/** @internal */` を付与する
- [ ] `typedoc.json` から `intentionallyNotExported` 配列を削除する
- [ ] `typedoc.json` に `"excludeInternal": true` を追加する

### 検証

- [ ] `vp run doc` を実行して typedoc が警告なく完走することを確認する (`intentionallyNotExported` 削除後も警告が出ないこと)
- [ ] `apidoc/` の出力 (`classes/`, `interfaces/`, `types/`, `variables/`) を本 refactor 前と diff し、公開シンボル一覧が変わっていないことを確認する
- [ ] `vp build` を実行して `dist/sora.d.ts` に `@internal` 付きシンボルが含まれないことを `grep '@internal' dist/sora.d.ts` で確認する (空であること、0051 と同じ検証)
- [ ] `vp lint --type-aware` と `vp exec tsc --noEmit` が通ることを確認する

### 変更履歴

- [ ] `CHANGES.md` の `## develop` セクションに `### misc` の `[REFACTOR]` として 1 行追加する (具体的な文面は実装時にコミット内容に合わせて確定)

## 関連 issue

- **0051 (open)**: `vp pack` ライブラリビルド移行で `@internal` シンボルが `dist/sora.d.ts` から除外されることを検証条件にしている。本 refactor で `@internal` を追加するが、対象は `src/sora.ts` から再 export されない定数なので 0051 の検証条件に影響しない
- **0063 (open)**: typedoc 生成物の GitHub Pages デプロイ。本 refactor は 0063 マージ後に着手する想定 (typedoc 設定変更が公開 doc に出るタイミング)
- **0064 (open)**: TYPEDOC.md 表紙刷新。本 refactor とは独立、順序依存なし
- **過去 CHANGES.md `:471`**: 「ユーザが直接使わない型には @internal を指定して .d.ts に含まれないようにする」既往対応
- **0020 (closed)**: `redact` 関数の `@internal` 付与例
