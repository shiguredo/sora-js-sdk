# `createSignalingMessage` の audio / video パラメータ判定で `"X" in copyOptions` を `typeof` / `!== undefined` ガードに置き換える

- Priority: Medium
- Created: 2026-06-11
- Model: Opus 4.7
- Branch: feature/refactor-create-signaling-message-typeof-guard

## 目的

`createSignalingMessage` (`src/utils.ts:256-261, :271-294, :303-320`) の audio / video パラメータ判定で使われている `"X" in copyOptions` 16 箇所を、`ConnectionOptions` (`src/types.ts:379-427`) 各キーの型に沿った `typeof` / `!== undefined` ガードに置き換える型安全化リファクタ。

issue 0018 の (2) (delete ループ条件を `!== null` → `!= null` に変更) で `copyOptions` から `undefined` キーが事前に除去されるため、`"X" in copyOptions` を残しても動的バグは発生しない。しかし TypeScript の `in` 演算子は値の型を絞らず、`copyOptions.audioCodecType` 等は `AudioCodecType | undefined` のまま `message.audio.codec_type` 等に代入される。本リファクタで `typeof === "string" | "number" | "boolean"` / `!== undefined` のガードに置き換え、(2) を将来意図せず壊した場合の二段目防御と、`exactOptionalPropertyTypes: true` 導入時に追加修正なしで通る形を担保する。

**動的挙動は 1 ビットも変えない**。現状 `tsc --strict --noEmit` で 0 エラーで通り、本変更後も挙動は同じ。

## 優先度根拠

Medium。動的バグは 0018 で完全に塞がるため、本 refactor 単独で利用者影響はない。型安全化と将来防御が主目的で、緊急性は低い。ただし `createSignalingMessage` を編集する他 issue (`0016`, `0017` 等) がマージされる前後で `in` 演算子の使い方が場当たり的に増えるのを防ぐ意味で、0018 マージ後の早期着手が望ましい。

## 現状

`src/utils.ts:256-261, :271-294, :303-320` に 16 箇所の `"X" in copyOptions` パターンが残存:

| 範囲                                       | 対象プロパティ                                                                                                                                                                                                                | 個数 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `src/utils.ts:256-261` (audio)             | `audioCodecType`, `audioBitRate`                                                                                                                                                                                              | 2    |
| `src/utils.ts:271-294` (audio opus_params) | `audioOpusParamsChannels`, `audioOpusParamsMaxplaybackrate`, `audioOpusParamsStereo`, `audioOpusParamsSpropStereo`, `audioOpusParamsMinptime`, `audioOpusParamsPtime`, `audioOpusParamsUseinbandfec`, `audioOpusParamsUsedtx` | 8    |
| `src/utils.ts:303-320` (video)             | `videoCodecType`, `videoBitRate`, `videoVP9Params`, `videoH264Params`, `videoH265Params`, `videoAV1Params`                                                                                                                    | 6    |

いずれも `if ("X" in copyOptions) { message.audio.codec_type = copyOptions.X; }` のような形で、TypeScript 上は `copyOptions.X` の型が `T | undefined` のまま代入先に流れる。代入先 `SignalingAudio.codec_type?: AudioCodecType` 等は optional プロパティで `undefined` 代入を許容するため型エラーにはならないが、`in` 演算子では「値の型」を伝えていない。

`tsconfig.json` は `strict: true` だが `exactOptionalPropertyTypes` 未設定。

## 設計方針

`ConnectionOptions` 各キーの型に沿ったガードに置き換える:

| プロパティ                                                                                                                                     | 型                                                                                    | ガード                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| `audioCodecType`, `videoCodecType`                                                                                                             | `AudioCodecType` / `VideoCodecType` (リテラル union)                                  | `typeof ... === "string"`  |
| `audioBitRate`, `videoBitRate`, `audioOpusParamsChannels`, `audioOpusParamsMaxplaybackrate`, `audioOpusParamsMinptime`, `audioOpusParamsPtime` | `number`                                                                              | `typeof ... === "number"`  |
| `audioOpusParamsStereo`, `audioOpusParamsSpropStereo`, `audioOpusParamsUseinbandfec`, `audioOpusParamsUsedtx`                                  | `boolean`                                                                             | `typeof ... === "boolean"` |
| `videoVP9Params`, `videoH264Params`, `videoH265Params`, `videoAV1Params`                                                                       | `JSONType` (`null \| boolean \| number \| string \| JSONType[] \| { [k]: JSONType }`) | `... !== undefined`        |

`JSONType` 系列は `null` / boolean / number / string / array / object すべてが意味を持ち得るため (`vp9_params: null` を上書き指示として送信するケース等)、`typeof === "object"` で絞ると挙動変更になる。`!== undefined` で揃え、`null` 等は (2) の delete ループに任せる前提とする (0018 マージ済前提)。

例:

```ts
// 置換前
if ("audioCodecType" in copyOptions) {
  message.audio.codec_type = copyOptions.audioCodecType;
}

// 置換後
if (typeof copyOptions.audioCodecType === "string") {
  message.audio.codec_type = copyOptions.audioCodecType;
}
```

## CHANGES.md

`shiguredo-changelog` 規約上、refactor は `[FIX]` / `[CHANGE]` / `[ADD]` / `[UPDATE]` のいずれにも該当しないため `## develop` の `### misc` サブセクションに記載する。利用者から観測可能な挙動変化はないため本体側ではなく misc 行き:

```
### misc

- createSignalingMessage の audio / video パラメータ判定で `"X" in copyOptions` を `typeof` / `!== undefined` ガードに置き換える
  - 型安全化リファクタで動的挙動の変化はなし
  - @voluntas
```

## スコープ外

- `createSignalingMessage` 内の他の `in` 演算子 (例: `"spotlightNumber" in options` は 0018 (1) で `typeof` ガードに置き換え済み)
- `createSignalingMessage` 以外のファイル (`src/base.ts` 等) の `in` 演算子
- `exactOptionalPropertyTypes: true` への切り替え (本 refactor で通る形を担保するだけで、tsconfig 変更は別 issue)
- 動的挙動の変更 (本 issue は型安全化のみ、`undefined` を delete する動作は 0018 (2) に依存)

## 前提

- **issue 0018 マージ後に着手する**。0018 の (2) (delete ループ `!= null` 化) が前提。0018 未マージのまま本 refactor を入れると、`!== undefined` ガード適用後に `null` 値が `JSONType` 系で message に積まれる挙動変更が発生しうる

## マージ順

issue 0018 → 本 issue。0018 で `copyOptions` から `undefined` / `null` キーが事前に除去される前提で本 refactor の `!== undefined` ガードが安全に効く。

## 完了条件

- `src/utils.ts:256-261, :271-294, :303-320` の 16 箇所すべてを設計方針の表に従ったガードに置き換える
- 既存テスト `tests/utils.test.ts` 全件が修正なしで pass する (動的挙動を変えないため、テスト書き換えは不要なはず)
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass し、`pnpm fmt` で差分が出ないこと
- `CHANGES.md` `## develop` の `### misc` に refactor エントリ 1 件を追記する
