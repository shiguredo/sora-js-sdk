# `ConnectionOptions` の数値オプションに `NaN` / `Infinity` / 負数の入力検証を追加する

- Priority: Medium
- Created: 2026-06-12
- Polished: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/add-numeric-option-validation

## 目的

`createSignalingMessage` (`src/utils.ts`) は `spotlightNumber` / `audioBitRate` / `videoBitRate` 等の数値オプションを `typeof === "number"` ガードで通過させたあと、そのまま message に積んで送信する。`typeof NaN === "number"` および `typeof Infinity === "number"` はいずれも `true` を返すため、利用者が誤って `NaN` / `Infinity` / 負数を渡した場合に SDK 側で弾かれず Sora サーバーに不正値が送信される。

実コードで `{ spotlightNumber: Number(maybeUndefinedString) }` のような呼び出しが容易に NaN を産むため、SDK 側で入力検証を入れて防御する。

`/auto-resolve 18,19` の処理中、issue 0018 のレビュー (観点 1 改善 7、観点 2 改善 7) で「`spotlightNumber` ガードは `typeof === "number"` で `NaN` / Infinity も通過する」と指摘されたが、issue 0018 のスコープ外として保留したため別 issue として起票する。

## 優先度根拠

Medium。SDK 利用者から見て「`Number(maybeUndefinedString)` → `NaN`」のパターンは一般的で、SDK ログから「特定の数値オプションで接続挙動が変わる」原因を特定するのが難しい類の bug。緊急ではないが顕在化しやすい入力経路で、issue 0017 (`clientId` / `bundleId` 空文字検証) と同種の利用者影響がある。

## 現状

`src/utils.ts` (issue 0018 マージ後、commit `232694a4` 時点) の該当箇所:

| 箇所                            | プロパティ                                                                                                     | 期待値域                      | 現在のガード                                                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `src/utils.ts:168-170`          | `spotlightNumber`                                                                                              | 正の整数 (Sora 仕様で `>= 1`) | `typeof options.spotlightNumber === "number"` (NaN / Infinity 通過)       |
| `src/utils.ts:256-261, 303-320` | `audioBitRate`, `videoBitRate`                                                                                 | 正の数 (kbps、`>= 1` 想定)    | `"X" in copyOptions` (issue 0046 で `typeof === "number"` に置き換え予定) |
| `src/utils.ts:271-294`          | `audioOpusParamsChannels`, `audioOpusParamsMaxplaybackrate`, `audioOpusParamsMinptime`, `audioOpusParamsPtime` | 正の数                        | `"X" in copyOptions` (issue 0046 で `typeof === "number"` に置き換え予定) |

`ConnectionOptions` (`src/types.ts:379-427`) の型は `number` で、`NaN` / Infinity / 負数を `number` の subtype として弾かない。

## 設計方針

数値オプション全件に `Number.isFinite` ベースの検証を追加する。Sora サーバーが正の値しか受け付けないオプションについては、さらに `> 0` (整数オプションは `>= 1`) の検証を追加する。

不正値を受け取った場合の挙動は 2 案ある:

**案 A: silently 無視 (推奨)**

不正値を弾いて message に積まない。`spotlightNumber: NaN` を渡しても `message.spotlight_number` キーが積まれない形にする。

```ts
if (
  typeof options.spotlightNumber === "number" &&
  Number.isFinite(options.spotlightNumber) &&
  options.spotlightNumber >= 1
) {
  message.spotlight_number = options.spotlightNumber;
}
```

利点: 既存利用者への影響なし (現状動作: 不正値で接続が SFU 側で失敗する → 修正後: 接続自体は成功するが該当オプションが効かない)
欠点: 開発者が誤入力に気付きにくい (silently 無視されるため)

**案 B: throw**

不正値を受け取った時点で `Error` を投げる。

利点: 開発者が誤入力に即気付ける
欠点: 既存利用者で `NaN` 経路を通る人がいた場合、修正前は「SFU 側で接続失敗」だったのが修正後は「`createSignalingMessage` で throw」に変わる。後方互換性に影響あり

設計判断は polish フェーズで決める。本 issue では `polish-issue` 時に **案 A / 案 B のいずれを採用するかをユーザーに確認** する想定。

## 完了条件

- `spotlightNumber` / `audioBitRate` / `videoBitRate` / `audioOpusParamsChannels` / `audioOpusParamsMaxplaybackrate` / `audioOpusParamsMinptime` / `audioOpusParamsPtime` の数値オプション 7 件に `Number.isFinite` ベースの検証を追加する
- 検証ロジックは案 A / 案 B のいずれかを polish フェーズで確定する
- `tests/utils.test.ts` に各オプションに対する `NaN` / `Infinity` / 負数 / 0 / 浮動小数点 (整数オプションのみ) の境界値テストを追加する
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass し、`pnpm fmt` で差分が出ないこと
- `CHANGES.md` `## develop` 本体に `[ADD]` または `[CHANGE]` (案 B 採用時) エントリを追記する

## 前提

- 案 A 採用時は issue 0018 / 0046 マージ後の状態を前提に編集する
- 案 B 採用時は SDK の API 契約変更となるため、`CHANGES.md` の `[CHANGE]` として明記する必要がある

## スコープ外

- 文字列オプションの値検証 (`clientId` / `bundleId` 空文字検証は issue 0017、`signalingNotifyMetadata` 等の検証は別 issue)
- `ConnectionOptions` 型の brand 化 / `PositiveInteger<T>` のような nominal type 導入 (本 issue は runtime 検証のみ)
- Sora サーバー側で行う validation の SDK 側への移植 (本 issue は SDK 内で明らかに不正な値だけを弾く)

## マージ順

issue 0046 マージ後が望ましい (案 A 採用時、`"X" in copyOptions` を `typeof === "number" && Number.isFinite(...)` に置き換える形でまとめて実装できる)。
