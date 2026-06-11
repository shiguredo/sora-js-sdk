# `createSignalingMessage` で `undefined` 値が message に積まれる経路を塞ぐ

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-11
- Model: Opus 4.7
- Branch: feature/fix-undefined-options-in-create-signaling-message

## 目的

`createSignalingMessage` (`src/utils.ts:123-336`) が `"X" in options` / `"X" in copyOptions` と `copyOptions[key] !== null` の判定に依存しており、利用者が `{ ...base, key: maybeUndefined }` のようなパターンで `undefined` 値を渡したオプションを拾って message に積んでしまう。実害は経路で異なる:

- **spotlightNumber (`src/utils.ts:168-170`):** `message.spotlight_number = undefined` が代入される。`JSON.stringify` で省略されるため送信内容上は無害だが、ロジック上不正。
- **audio / video パラメータ (`src/utils.ts:238-321`):** `audioBitRate: undefined` 等があると delete ループ (`!== null`) で `undefined` キーが残り、`hasAudioProperty` / `hasAudioOpusParamsProperty` / `hasVideoProperty` が `true` になって `message.audio` / `message.video` が boolean `true` から空オブジェクト `{}` に置換される。**本来 `audio: true` (boolean) を送るべきところを `audio: {}` で送ることになり、送信内容が実際に変わる**。これが主たる実害。

`undefined` を message に載せず、`message.audio` / `message.video` の boolean デフォルトを保つよう delete 条件と型ガードを直す。

## 優先度根拠

High。`React useState` や `{ ...base, key: maybeUndefined }` で `undefined` キーが混ざるパターンは一般的で頻発する。SDK ログから「特定のオプション形式で接続挙動が変わる」原因を特定するのが難しい類のバグ。

## 現状

| 箇所                                       | 役割                                                                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/utils.ts:168-170`                     | (1) で修正。`"spotlightNumber" in options` → `undefined` も拾い `message.spotlight_number = undefined` を代入                                                                                                      |
| `src/utils.ts:238-246` (3 つの `continue`) | (2) で修正。`audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` の delete 条件が `!== null` のみ → `undefined` キーが `copyOptions` に残る                                                   |
| `src/utils.ts:253, :263-265, :300`         | (2) 適用で副次的に解消。`Object.keys(copyOptions).some(...)` の `hasAudioProperty` / `hasAudioOpusParamsProperty` / `hasVideoProperty` が delete されなかった `undefined` キーで `true` になり `{}` 化を引き起こす |
| `src/utils.ts:256-261, :271-294, :303-320` | (2) 適用で副次的に解消するが、`"X" in copyOptions` を型ガードに置き換える型安全化リファクタは本 issue では行わず別 issue で扱う (「スコープ外」参照)                                                               |

他オプション (`simulcast`, `clientId`, `metadata`, `forwardingFilter` 等) は既に `typeof` / `!== undefined` ガード済みで本 issue の対象外。`src/utils.ts:232-237` の `audio` / `video` 本体の boolean ガードも `audio: undefined` 等を末尾の `delete` で正しく落とすため対象外。

## 設計方針

本 issue では (1) `spotlightNumber` の単点修正と (2) `copyOptions` delete ループの修正の 2 つで動的バグを完全に塞ぐ。`src/utils.ts:256-261, :271-294, :303-320` の `"X" in copyOptions` を `typeof` / `!== undefined` ガードに置き換える型安全化リファクタ (動的挙動は 1 ビットも変えない) は別 issue として扱う (「スコープ外」参照)。

### 1. `spotlightNumber` (`src/utils.ts:168-170`)

`spotlightNumber` は `options` を直接見ており `copyOptions` の delete ループを経由しないため、この単点を `typeof` ガードに変える:

```ts
if (typeof options.spotlightNumber === "number") {
  message.spotlight_number = options.spotlightNumber;
}
```

### 2. `copyOptions` delete ループ (`src/utils.ts:238-246`) — audio / video の `{}` 化バグを解消する主修正

`audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` の 3 つの `continue` 条件 `copyOptions[key] !== null` を `copyOptions[key] != null` に変える。`continue` は「キーを残す」、ループ末尾の `delete copyOptions[key]` は「キーを消す」動作で、現行 `!== null` だと `undefined !== null` が真になり `undefined` キーが残ってしまう。`!= null` に変えれば `undefined != null` も `null != null` も false で delete 側に流れる。

これにより `undefined` キーが削除され、`undefined` 単独入力のケースで `hasAudioProperty` / `hasAudioOpusParamsProperty` / `hasVideoProperty` が `false` になり、`message.audio` / `message.video` は boolean デフォルト `true` のまま保たれる。**`{ audioBitRate: undefined }` のような undefined 単独入力での `{}` 化はこの (2) で解消する**。有効値と `undefined` が混在するケース (例: `{ audioBitRate: 100, audioCodecType: undefined }`) の挙動は「3-2」のケース 4 で詳しく示す。

### 3. テスト (`tests/utils.test.ts`)

#### 3-1. 既存テストの書き換え (修正後に必ず fail する)

`tests/utils.test.ts:807-819` の現行 `expectedMessage` は `{ ...baseExpectedMessage, spotlight_number: undefined }` を `toStrictEqual` で渡しており、`message.spotlight_number = undefined` の代入を意図的に固定している (詳細は実ファイル参照)。修正 (1) を入れると `message` から `spotlight_number` キー自体が消えるため、現行期待値で fail する。期待値を `baseExpectedMessage` (キーなし) に書き換え、コメントも修正後の挙動 (`typeof === "number"` ガードで `undefined` が弾かれる) に揃える:

```ts
test("createSignalingMessage spotlightNumber: undefined", () => {
  const options = { spotlightNumber: undefined };
  // spotlightNumber: undefined は typeof options.spotlightNumber === "number" ガードで弾かれ message.spotlight_number キー自体が積まれない
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});
```

#### 3-2. 新規回帰テスト (audio / video の `{}` 化バグ)

期待値は `tests/utils.test.ts:14-23` の `baseExpectedMessage` (`Object.freeze` 済み) を spread で再利用する。混在ケースなど `audio` / `video` キーを差し替える場合は `{ ...baseExpectedMessage, audio: { bit_rate: 100 } }` のように完全上書きする (既存 `:170-185` の `createSignalingMessage audio parameters` テストと同じパターン)。

下表のケースを `tests/utils.test.ts` の各サブグループ末尾に追加する。テスト名・コメントは既存テスト命名規則 (`createSignalingMessage <内容>` + 日本語コメント) に揃える:

| #   | テスト名 (`test(...)`)                                                | 入力 `options`                                     | 期待 message                                                                                                   | 追加位置                                                                    |
| --- | --------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | `createSignalingMessage audioBitRate: undefined`                      | `{ audioBitRate: undefined }`                      | `baseExpectedMessage` (`audio: true` を保つ)                                                                   | `audio parameters` テスト `:170-185` の直後                                 |
| 2   | `createSignalingMessage audioOpusParamsChannels: undefined`           | `{ audioOpusParamsChannels: undefined }`           | `baseExpectedMessage` (opus_params 経路の `{}` 化も発生しない)                                                 | `audioOpusParamsUsedtx` テスト `:306-321` の直後 (audio opus_params 群末尾) |
| 3   | `createSignalingMessage videoBitRate: undefined`                      | `{ videoBitRate: undefined }`                      | `baseExpectedMessage` (`video: true` を保つ)                                                                   | `video parameters` テスト `:358-373` の直後 (video parameters 群末尾)       |
| 4   | `createSignalingMessage audioBitRate: 100, audioCodecType: undefined` | `{ audioBitRate: 100, audioCodecType: undefined }` | `{ ...baseExpectedMessage, audio: { bit_rate: 100 } }` (`codec_type` キーなし、有効値 `bit_rate` のみ拾われる) | ケース 1 の直後                                                             |

例 (ケース 4):

```ts
test("createSignalingMessage audioBitRate: 100, audioCodecType: undefined", () => {
  // 有効値 audioBitRate: 100 のみが拾われ、undefined の audioCodecType は (2) の delete で除外される
  const options = { audioBitRate: 100, audioCodecType: undefined };
  const expectedMessage = { ...baseExpectedMessage, audio: { bit_rate: 100 } };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});
```

修正前 `pnpm test` ではケース 1〜4 すべてが fail し、修正後はすべて pass になる (本修正は role と独立のため検証は `sendonly` のみで十分)。

### 4. CHANGES.md

`## develop` 本体 (既存 `[FIX]` 群の末尾、`### misc` ではない) に追記する。本変更は SDK 利用者から観測できる送信内容の変更を直す挙動修正で、利用者影響があるため本体側に置く:

```
- [FIX] createSignalingMessage で `{ audioBitRate: undefined }` のような呼び出しで message.audio / message.video が boolean true から空オブジェクト {} に置換されていたのを修正する
  - 関連して spotlightNumber / audioOpusParams* に undefined を渡しても message に undefined キーが積まれないようにする
  - @voluntas
```

## スコープ外

- `createSignalingMessage` 内の `"X" in copyOptions` (`src/utils.ts:256-261, :271-294, :303-320` の 16 箇所) を `typeof` / `!== undefined` ガードに置き換える型安全化リファクタ — 現状 `tsc --strict --noEmit` で 0 エラーで通り、(2) 適用後は動的にも `undefined` を見ない。bug fix ではなく refactor として別 issue で扱う
- issue 0016 (`forwardingFilter` / `forwardingFilters` 排他) / 0017 (`clientId` / `bundleId` 空文字) — 同一関数 `createSignalingMessage` を編集するが、両 issue とも `issues/pending/` に移動済みで現在 active な隣接 issue ではない
- `createSignalingMessage` 以外のファイル (`src/base.ts` 等) の `in` 演算子

## マージ順

他 issue との依存なし。単独マージ可。

## 完了条件

- `src/utils.ts:168-170` の `spotlightNumber` ガードを `typeof options.spotlightNumber === "number"` に変える
- `src/utils.ts:238-246` の 3 つの `continue` 条件を `copyOptions[key] != null` に変える
- 既存 `tests/utils.test.ts:807-819` (`spotlightNumber: undefined`) の期待値を `baseExpectedMessage` に書き換える
- `tests/utils.test.ts` に「3-2」のケース表 4 件を新規追加する
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass し、`pnpm fmt` で差分が出ないこと
- `CHANGES.md` `## develop` 本体に `[FIX]` エントリ 1 件を追記する
