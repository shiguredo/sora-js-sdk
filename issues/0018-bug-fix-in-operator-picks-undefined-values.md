# `in` 演算子で `undefined` 値のプロパティを拾い `undefined` を Sora に送信する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-in-operator-undefined-values

## 目的

`createSignalingMessage` (`src/utils.ts`) は `spotlightNumber` (`src/utils.ts:168-170`)、`audioCodecType` (`:256-258`)、`audioBitRate` (`:259-261` 周辺)、`videoCodecType` / `videoBitRate` 等の判定に `"X" in options` / `"X" in copyOptions` を使う。`in` 演算子はキー存在のみで判定し、値が `undefined` でも `true` を返す。動的にオプションを組み立てるアプリで `{ ...base, spotlightNumber: someValueOrUndefined }` を渡すと、`message.spotlight_number = undefined` が代入される。`JSON.stringify` で省略されるため WebSocket 送信時は消えるが、ロジック上は不正で、`copyOptions` の `delete` 条件 (`src/utils.ts:230-247`) でも `undefined` をフィルタしていないため `audioCodecType: undefined` などが残ってしまう。

すべての `in` 演算子と `!== null` 比較を `!== undefined && !== null` または `typeof X === "number"` / `typeof X === "string"` 等の型ガードに置き換える。

## 優先度根拠

High。React の `useState` 経由でオプションを管理するアプリ、もしくはオプション組み立て関数で「指定なし」を `undefined` で表現するパターンは一般的で、本問題は頻発する。Sora 側で `null` / `undefined` を「指定なし」と扱うか「不正値」と扱うかは項目依存で、最悪のケースで `invalid-spotlight-number` などの接続拒否が発生する。本 SDK 側で `undefined` を message に積まないことが防御線となる。

## 現状

問題箇所一覧 (`src/utils.ts`):

- `:168-170` `"spotlightNumber" in options`: `undefined` 値も真
- `:230-247` `copyOptions` の delete ループ: `audioPropertyKeys.includes(key) && copyOptions[key] !== null` で `null` のみ delete し `undefined` を見逃す。同じ条件が `audioOpusParamsPropertyKeys` / `videoPropertyKeys` でも `null` のみ
- `:256-258` `"audioCodecType" in copyOptions`: `copyOptions` に `audioCodecType: undefined` が残っていれば真
- `:259-261` 周辺 `"audioBitRate" in copyOptions`: 同上
- `videoCodecType` / `videoBitRate` / `videoVP9Params` 等の同パターン

`in` 演算子の挙動 (ECMAScript §13.10): プロパティが存在すれば値に関わらず `true` を返す。`{ x: undefined }` でも `"x" in obj` は `true`。

`copyOptions` のロジック (`:230-247`) は次の意図:

```ts
for (const key of Object.keys(copyOptions)) {
  if (key === "audio" && typeof copyOptions[key] === "boolean") continue;
  if (key === "video" && typeof copyOptions[key] === "boolean") continue;
  if (audioPropertyKeys.includes(key) && copyOptions[key] !== null) continue;
  if (audioOpusParamsPropertyKeys.includes(key) && copyOptions[key] !== null) continue;
  if (videoPropertyKeys.includes(key) && copyOptions[key] !== null) continue;
  delete copyOptions[key];
}
```

「audio/video 関連オプションのうち値が `null` でないものだけ保持、それ以外は削除」だが、`undefined` 値は `!== null` で `true` を返すため `copyOptions` に残ってしまう。後続の `"audioCodecType" in copyOptions` 判定で true となり、`message.audio.codec_type = undefined` が代入される。

## 完了条件

- `src/utils.ts:168-170` の `"spotlightNumber" in options` を `typeof options.spotlightNumber === "number"` に変更
- `src/utils.ts:230-247` の `copyOptions` delete ループで `audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` の条件を `copyOptions[key] !== null && copyOptions[key] !== undefined` に変更
- `src/utils.ts:256-258` の `"audioCodecType" in copyOptions` を `typeof copyOptions.audioCodecType === "string"` 相当に変更
- `src/utils.ts:259-261` 周辺の `"audioBitRate" in copyOptions` を `typeof copyOptions.audioBitRate === "number"` に変更
- `videoCodecType` / `videoBitRate` / `videoVP9Params` / `videoH264Params` / `videoH265Params` / `videoAV1Params` および `audioOpusParams*` 系もすべて型ガードに変更
- 単体テストを `tests/utils.test.ts` に追加し、各 `XxxBitRate: undefined` / `XxxCodecType: undefined` / `spotlightNumber: undefined` を含む `options` で `createSignalingMessage` を呼んだ結果の message に該当プロパティが含まれないことを assert する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] createSignalingMessage の各オプション判定で in 演算子が undefined 値を拾っていたのを型ガードに置き換える
    - @voluntas
  ```
- 本 issue は issue 0016 / 0017 と同じ `createSignalingMessage` を編集するため、マージ順を 0016 → 0017 → 0018 とする。0016 / 0017 で追加する throw 検証と、本 issue で変更する型ガードはコード上隣接するが意味的には独立しているため、コンフリクト解消は機械的に行える

## 解決方法

`src/utils.ts:168-170` を次の通り書き換える。

```ts
if (typeof options.spotlightNumber === "number") {
  message.spotlight_number = options.spotlightNumber;
}
```

`src/utils.ts:230-247` の `copyOptions` delete ループを次の通り書き換える。

```ts
const copyOptions = { ...options };
for (const key of Object.keys(copyOptions) as Array<keyof ConnectionOptions>) {
  if (key === "audio" && typeof copyOptions[key] === "boolean") {
    continue;
  }
  if (key === "video" && typeof copyOptions[key] === "boolean") {
    continue;
  }
  if (
    audioPropertyKeys.includes(key) &&
    copyOptions[key] !== null &&
    copyOptions[key] !== undefined
  ) {
    continue;
  }
  if (
    audioOpusParamsPropertyKeys.includes(key) &&
    copyOptions[key] !== null &&
    copyOptions[key] !== undefined
  ) {
    continue;
  }
  if (
    videoPropertyKeys.includes(key) &&
    copyOptions[key] !== null &&
    copyOptions[key] !== undefined
  ) {
    continue;
  }
  delete copyOptions[key];
}
```

`src/utils.ts:256-258` 以降の `"X" in copyOptions` パターンを型ガードに置き換える。

```ts
if (typeof copyOptions.audioCodecType === "string") {
  message.audio.codec_type = copyOptions.audioCodecType;
}
if (typeof copyOptions.audioBitRate === "number") {
  message.audio.bit_rate = copyOptions.audioBitRate;
}
// audioOpusParamsChannels, audioOpusParamsMaxplaybackrate, audioOpusParamsMinptime, audioOpusParamsPtime は number
// audioOpusParamsStereo, audioOpusParamsSpropStereo, audioOpusParamsUseinbandfec, audioOpusParamsUsedtx は boolean
// videoCodecType は string、videoBitRate は number、videoVP9Params / videoH264Params / videoH265Params / videoAV1Params は object
```

各オプションの値型は `types.ts` の `ConnectionOptions` 定義を確認した上で適切な `typeof` ガードを選ぶ。

`tests/utils.test.ts` に次のテストを追加する。

```ts
test("undefined 値のオプションは message に含めない", () => {
  const message = createSignalingMessage(
    "sdp",
    "sendrecv",
    "channel",
    null,
    {
      spotlightNumber: undefined,
      audioBitRate: undefined,
      audioCodecType: undefined,
      videoBitRate: undefined,
      videoCodecType: undefined,
    },
    false,
  );
  expect("spotlight_number" in message).toBe(false);
  expect(message.audio).toBe(undefined);
  expect(message.video).toBe(undefined);
});
```
