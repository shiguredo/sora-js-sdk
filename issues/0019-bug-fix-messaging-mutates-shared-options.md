# `messaging()` が呼び出し側の `options` を破壊し他 Connection の `this.options` まで壊す

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-messaging-mutates-shared-options

## 目的

`Sora.connection().messaging()` (`src/sora.ts:210-227`) が引数 `options` をその場で mutate し、`ConnectionBase` constructor (`src/base.ts:266`) が浅い参照のまま `this.options = options` と保持するため、同一 `opts` を `sendrecv()` と `messaging()` に渡すと後者が前者の `this.options` まで書き換える。spread copy と constructor 側 shallow copy で外部参照を切り離す。

## 必要性

**必要** (確信度: 高)。`src/sora.ts:215-217` の直接代入と `src/base.ts:266` の参照保持が現行コードに残存。`sendrecv` / `sendonly` / `recvonly` は mutate しないが、`ConnectionBase` の参照保持だけでも内部 mutate (`this.options.skipIceCandidateEvent ??= false` 等) が呼び出し側へ漏れる。

## 優先度根拠

High。同一 `opts` で `sendrecv()` と `messaging()` を生成する公式パターンで再現する。利用者は不変オブジェクトを渡したつもりが壊され、原因特定が困難。

## 現状

### 状態遷移

```mermaid
flowchart LR
    opts["opts (呼び出し側)"]
    sr["sendrecv.options"]
    msg["messaging()"]
    opts -->|同一参照| sr
    msg -->|"options.audio = false 等<br/>直接 mutate"| opts
    msg -->|同一参照経由| sr
```

```ts
// src/sora.ts:210-227
messaging(..., options: ConnectionOptions = { audio: false, video: false }) {
  options.audio = false;
  options.video = false;
  options.dataChannelSignaling = true;
  return new ConnectionMessaging(..., options, ...);
}

// src/base.ts:266
this.options = options;
```

再現:

```ts
const opts = { audio: true, video: true };
const sendrecv = connection.sendrecv("ch", null, opts);
connection.messaging("ch2", null, opts);
// opts と sendrecv.options の両方が { audio: false, video: false, dataChannelSignaling: true }
```

## 設計方針

### 1. `messaging()` (`src/sora.ts:210-227`)

```ts
const merged: ConnectionOptions = {
  ...options,
  audio: false,
  video: false,
  dataChannelSignaling: true,
};
return new ConnectionMessaging(..., merged, ...);
```

### 2. `ConnectionBase` constructor (`src/base.ts:266`)

```ts
this.options = { ...options };
```

以降の `this.options.skipIceCandidateEvent ??= false` 等はコピー側のみ変更する。ネストオブジェクト (`forwardingFilters`, `dataChannels` 等) は共有参照のまま — deep clone は不要。

### 3. テスト (`tests/sora.test.ts` 新規)

```ts
import Sora from "../src/sora";
import type { ConnectionOptions } from "../src/types";

test("messaging() が呼び出し側の options を破壊しない", () => {
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  connection.messaging("ch", null, opts);
  expect(opts.audio).toBe(true);
  expect(opts.video).toBe(true);
  expect(opts.dataChannelSignaling).toBeUndefined();
});

test("ConnectionBase が options を shallow copy し sendrecv 後の messaging 破壊が伝播しない", () => {
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  const sendrecv = connection.sendrecv("ch", null, opts);
  connection.messaging("ch2", null, opts);
  expect(sendrecv.options.audio).toBe(true);
  expect(sendrecv.options.video).toBe(true);
  expect(sendrecv.options.dataChannelSignaling).toBeUndefined();
});
```

`ConnectionBase.options` は public フィールド (`src/base.ts:124`)。

### 4. CHANGES.md

```
- [FIX] messaging() が呼び出し側の options を破壊しないように修正する
- [FIX] ConnectionBase で options を shallow copy して外部参照を切り離す
  - @voluntas
```

## スコープ外

- `sendrecv` / `sendonly` / `recvonly` の変更 (mutate していない)
- `options` の deep clone
- ネストプロパティの防御的コピー

## マージ順

他 issue との依存なし。単独マージ可。0004 チェーン (`0004 → 0006 → 0021 → 0009 → 0007`) とは独立。

## 完了条件

- `src/sora.ts:215-217` を spread copy パターンに置き換える
- `src/base.ts:266` を `this.options = { ...options };` に変更する
- `tests/sora.test.ts` (新規) で上記 2 テストを追加する
- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` に `[FIX]` エントリ 2 件を追記する
