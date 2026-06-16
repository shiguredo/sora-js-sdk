# `createSignalingMessage` の audio / video パラメータ判定で `"X" in copyOptions` を `typeof` / `!== undefined` ガードに置き換える

- Priority: Medium
- Created: 2026-06-11
- Polished: 2026-06-16
- Model: Opus 4.7
- Branch: feature/refactor-create-signaling-message-typeof-guard

## 目的

`createSignalingMessage` (`src/utils.ts:123` から始まる関数) の audio / video パラメータ判定で使われている `"X" in copyOptions` 16 箇所 (audio: `:270, :273` の 2 件、audio_opus_params: `:285, :288, :291, :294, :297, :300, :303, :306` の 8 件、video: `:317, :320, :323, :326, :329, :332` の 6 件) を、`ConnectionOptions` (`src/types.ts:379-427`) 各キーの型に沿った `typeof` / `!== undefined` ガードに置き換える型安全化リファクタ。

`tsconfig.json:56` で `exactOptionalPropertyTypes: true` が既に有効だが、`in` 演算子は値の型を narrow しないため、現状の `if ("X" in copyOptions) { message.audio.codec_type = copyOptions.X; }` 経路では `copyOptions.X` が `T | undefined` のまま optional プロパティに代入される。`message.audio = {}` で widen された代入対象に `T | undefined` を流すパターンを TS は弾けず、`exactOptionalPropertyTypes` の保護を実質バイパスしている。本リファクタで `typeof` / `!== undefined` ガードに置き換え、narrow を効かせて `exactOptionalPropertyTypes` の保護を取り戻す。

**動的挙動は 1 ビットも変えない**。0018 (closed) で `copyOptions` から `null` / `undefined` キーが事前 delete されるため、`typeof === "number"` 等で `null` が弾かれても message に積まれる値の集合は不変。

## 優先度根拠

Medium。動的バグは 0018 で完全に塞がっているため本 refactor 単独で利用者影響はない。型安全化と将来の型回帰防止 (誰かが `in` 演算子を新規に追加した瞬間 `exactOptionalPropertyTypes` の保護がまた抜ける) が主目的。

リリース 2026.1.0 (issue 0059) のブロッカー候補として Medium で位置づけられている。依存関係の詳細は「マージ順」セクションを参照。

## 現状

`src/utils.ts` の以下 16 箇所に `"X" in copyOptions` パターンが残存:

| 範囲                                       | 対象プロパティ                                                                                                                                                                                                                                                                                        | 個数 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `src/utils.ts:268-276` (audio セクション)  | `audioCodecType` (`:270`), `audioBitRate` (`:273`)                                                                                                                                                                                                                                                    | 2    |
| `src/utils.ts:280-308` (audio_opus_params) | `audioOpusParamsChannels` (`:285`), `audioOpusParamsMaxplaybackrate` (`:288`), `audioOpusParamsStereo` (`:291`), `audioOpusParamsSpropStereo` (`:294`), `audioOpusParamsMinptime` (`:297`), `audioOpusParamsPtime` (`:300`), `audioOpusParamsUseinbandfec` (`:303`), `audioOpusParamsUsedtx` (`:306`) | 8    |
| `src/utils.ts:315-335` (video セクション)  | `videoCodecType` (`:317`), `videoBitRate` (`:320`), `videoVP9Params` (`:323`), `videoH264Params` (`:326`), `videoH265Params` (`:329`), `videoAV1Params` (`:332`)                                                                                                                                      | 6    |

いずれも `if ("X" in copyOptions) { message.audio.codec_type = copyOptions.X; }` のような形で、TypeScript 上は `copyOptions.X` の型が `T | undefined` のまま代入先に流れる。代入先 `SignalingAudio.codec_type?: AudioCodecType` 等は optional プロパティで `undefined` 代入を許容するため型エラーにはならないが、`in` 演算子では値の型が narrow されない。

`tsconfig.json:56` で `exactOptionalPropertyTypes: true` が有効。`src/utils.ts:546` / `:606` / `src/base.ts:2675` / `:2719` には `exactOptionalPropertyTypes 対応のため` の運用コメントが既に入っており、SDK 全体でこの設定下での型運用が前提となっている。

行番号は 2026-06-16 時点の `src/utils.ts` 基準。実装着手時は `grep -nE '"[A-Za-z]+" in copyOptions' src/utils.ts` で 16 件と行を再確認すること。

## 設計方針

`ConnectionOptions` 各キーの型に沿ったガードに置き換える:

| プロパティ                                                                                                                                     | 型                                                                                    | ガード                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| `audioCodecType`, `videoCodecType`                                                                                                             | `AudioCodecType` / `VideoCodecType` (リテラル union)                                  | `typeof ... === "string"`  |
| `audioBitRate`, `videoBitRate`, `audioOpusParamsChannels`, `audioOpusParamsMaxplaybackrate`, `audioOpusParamsMinptime`, `audioOpusParamsPtime` | `number`                                                                              | `typeof ... === "number"`  |
| `audioOpusParamsStereo`, `audioOpusParamsSpropStereo`, `audioOpusParamsUseinbandfec`, `audioOpusParamsUsedtx`                                  | `boolean`                                                                             | `typeof ... === "boolean"` |
| `videoVP9Params`, `videoH264Params`, `videoH265Params`, `videoAV1Params`                                                                       | `JSONType` (`null \| boolean \| number \| string \| JSONType[] \| { [k]: JSONType }`) | `... !== undefined`        |

`JSONType` 型 (`src/types.ts:22-28`) は `null` を unit に含むため、SDK は型定義に従い `null` も透過させる。`typeof === "object"` で絞ると `null` を弾いてしまうため `!== undefined` を採用する。

`typeof === "number"` / `"string"` / `"boolean"` 系では `null` 値も弾かれる (`JSONType` 系の `!== undefined` と非対称)。これは 0018 (closed) の delete ループ (`src/utils.ts:230-262`) で `copyOptions[key] !== null && copyOptions[key] !== undefined` 判定により `null` / `undefined` キーは事前に delete されているため、本 refactor 後も message に積まれる値の集合は不変。

本 refactor は `ConnectionOptions` の型 (`src/types.ts:379-427`) に従った入力を前提とする。型を逸脱した値 (`audioOpusParamsStereo: "true"` 等の `as any` 経由代入) を渡される経路は本 issue の対象外で、動的挙動不変は型に従った入力の集合に対してのみ保証する。値域検証 (例: `AudioCodecType` 値のホワイトリストチェック) は本 refactor では追加せず別 issue の責務とする。

例 (4 系統それぞれ):

```ts
// string 系: audioCodecType
if (typeof copyOptions.audioCodecType === "string") {
  message.audio.codec_type = copyOptions.audioCodecType;
}

// number 系: audioBitRate
if (typeof copyOptions.audioBitRate === "number") {
  message.audio.bit_rate = copyOptions.audioBitRate;
}

// boolean 系: audioOpusParamsStereo
if (typeof copyOptions.audioOpusParamsStereo === "boolean") {
  message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
}

// JSONType 系: videoVP9Params
if (copyOptions.videoVP9Params !== undefined) {
  message.video.vp9_params = copyOptions.videoVP9Params;
}
```

## スコープ外

- `createSignalingMessage` 内の他の `in` 演算子 (例: `"spotlightNumber" in options` は 0018 マージ済の修正により `typeof options.spotlightNumber === "number"` ガード化済み)。修正後に `grep -nE '"[A-Za-z]+" in copyOptions' src/utils.ts` の出力が 0 件であることを確認する
- `createSignalingMessage` 以外のファイル (`src/base.ts` 等) の `in` 演算子
- 値域検証 (例: `AudioCodecType` 値のホワイトリストチェック) — 別 issue の責務
- 動的挙動の変更 (本 issue は型安全化のみ、`undefined` / `null` を delete する動作は 0018 closed の delete ループに依存)
- delete ループ自体の統合・helper 抽出 — issue 0050 (open) で扱う

## マージ順

- 上流依存: なし (0018 は closed/Completed 2026-06-12 でマージ済、本 issue 着手時点で `copyOptions` から `null` / `undefined` キーは事前除去された状態)
- 下流: 0050 (`createSignalingMessage` の delete ループ統合・helper 抽出、open) — 本 issue を先にマージする (0050 の「マージ順」で `issue 0018 (マージ済) → issue 0046 → 本 issue` と明記されている)
- 0016 / 0017 は `issues/pending/` に退避済みで現在 active ではないが、将来 unpend された際の新規 `in` 演算子混入を防ぐ意味でも `createSignalingMessage` 内の `in` 演算子を 0 件にしておく価値がある
- 2026.1.0 リリース (issue 0059) のブロッカー候補 (Medium)

## 変更対象ファイル

| ファイル       | 内容                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils.ts` | `:270, :273, :285, :288, :291, :294, :297, :300, :303, :306, :317, :320, :323, :326, :329, :332` の 16 箇所を設計方針の表に従ったガードに置き換える     |
| `CHANGES.md`   | `## develop` `### misc` 内の `[UPDATE]` 群末尾 (`:88` の `- @voluntas` の直後、`:89` の `- [FIX] Node 24 ...` の直前) に `[UPDATE]` エントリを 1 件追記 |

## 完了条件

- `src/utils.ts` の上記 16 箇所すべてを設計方針の表に従ったガードに置き換える
- 修正後に `grep -nE '"[A-Za-z]+" in copyOptions' src/utils.ts` の出力が 0 件であること
- 既存テスト `tests/utils.test.ts` 全件が修正なしで pass する。特に以下が pass し続けることが動的挙動不変の証拠:
  - `audio parameters` (`:170`) と `audioBitRate: undefined` / `audioBitRate: 100, audioCodecType: undefined` (`:187`, `:198`) の混在ケース
  - `audio opus_params` 系テスト 8 件 (`audioOpusParamsChannels` / `Maxplaybackrate` / `Stereo` / `SpropStereo` / `Minptime` / `Ptime` / `Useinbandfec` / `Usedtx`、`:211, :228, :245, :262, :279, :296, :313, :330`)
  - `video parameters` (`:393`) と `videoBitRate` / `videoCodecType` / `video*Params` の有効値・undefined・混在ケース
- 新規テストは追加しない (型レベル refactor で動的挙動を変えないため)
- ローカルで以下がすべて pass すること (順序通り実行):
  1. `pnpm typecheck` (`tsc --noEmit`)
  2. `pnpm lint` (`vp lint --type-aware`)
  3. `pnpm test` (`vp test run`)
  4. `pnpm fmt` (`vp fmt`) を実行後 `git diff --exit-code` で差分が無いこと
- `CHANGES.md` `## develop` `### misc` 内の `[UPDATE]` 群末尾 (`:88` の `- @voluntas` の直後、`:89` の `- [FIX] Node 24 ...` の直前) に次を追記する:

  ```
  - [UPDATE] `createSignalingMessage` の audio / video パラメータ判定で `"X" in copyOptions` を `typeof` / `!== undefined` ガードに置き換える
    - 型安全化リファクタで動的挙動の変化はなし
    - @voluntas
  ```

## 解決方法

実装完了後に追記する (どのファイルをどう変更したかの実績)。
