# `forwardingFilter` と `forwardingFilters` の同時指定時に両方を送信して Sora に接続拒否される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-forwarding-filter-exclusive

## 目的

`createSignalingMessage` (`src/utils.ts:190-195`) で `options.forwardingFilters` (新 API) と `options.forwardingFilter` (旧 API) が両方 `undefined` でない場合、両方を signaling message に積む。Sora は片方のみ期待しており、両方指定は `invalid-signaling-message` で接続拒否される。`createSignalingMessage` で両方指定を検出して `Error` を throw し、開発者に早期通知する。

## 優先度根拠

High。旧 API から新 API への移行期に両方セットすると Sora 拒否が SDK ログだけでは原因不明になる。型システムでは検出不可。他オプション検証 (`src/utils.ts:132, 135, 324`) と同じ同期 `throw new Error(...)` パターンで揃える。

## 現状

### 状態遷移

```mermaid
flowchart TD
    A[createSignalingMessage] --> B{forwardingFilter 指定?}
    B -->|Yes| C{forwardingFilters も指定?}
    C -->|Yes 現行| D[両方 message に積む (バグ)]
    C -->|No| E[forwarding_filter のみ]
    B -->|No| F{forwardingFilters 指定?}
    F -->|Yes| G[forwarding_filters のみ]
    D --> H[Sora invalid-signaling-message]
```

```ts
if (options.forwardingFilters !== undefined) {
  message.forwarding_filters = options.forwardingFilters;
}
if (options.forwardingFilter !== undefined) {
  message.forwarding_filter = options.forwardingFilter;
}
```

`createSignalingMessage` は `ConnectError` ではなく素の `Error` を使う (他検証と同型)。

## 設計方針

個別 if ブロック直前で両方指定を検出して throw。片方のみ指定の正常系は変更なし。

```ts
if (options.forwardingFilter !== undefined && options.forwardingFilters !== undefined) {
  throw new Error("Both 'forwardingFilter' and 'forwardingFilters' are specified. Use only one.");
}
if (options.forwardingFilters !== undefined) {
  message.forwarding_filters = options.forwardingFilters;
}
if (options.forwardingFilter !== undefined) {
  message.forwarding_filter = options.forwardingFilter;
}
```

**変更対象:** `src/utils.ts` の `createSignalingMessage` のみ

**スコープ外:**

- `clientId` / `bundleId` 空文字検証 — issue 0017
- `ForwardingFilter` 型定義変更 — `src/types.ts:367-374`

## 完了条件

- 両方指定時に `Error("Both 'forwardingFilter' and 'forwardingFilters' are specified. Use only one.")` を throw
- `tests/utils.test.ts` に追加:

```ts
const dummyForwardingFilter = {
  rules: [[{ field: "kind" as const, operator: "is_in" as const, values: ["video"] as [string] }]],
};

test("forwardingFilter と forwardingFilters の両方指定で Error を投げる", () => {
  expect(() =>
    createSignalingMessage(
      "sdp",
      "sendrecv",
      "channel",
      null,
      {
        forwardingFilter: dummyForwardingFilter,
        forwardingFilters: [dummyForwardingFilter],
      },
      false,
    ),
  ).toThrow("Both 'forwardingFilter' and 'forwardingFilters' are specified. Use only one.");
});

test("forwardingFilter のみ指定では throw しない", () => {
  expect(() =>
    createSignalingMessage(
      "sdp",
      "sendrecv",
      "channel",
      null,
      {
        forwardingFilter: dummyForwardingFilter,
      },
      false,
    ),
  ).not.toThrow();
});
```

- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` に追記:

  ```
  - [FIX] createSignalingMessage で forwardingFilter と forwardingFilters の両方が指定された場合に Error を投げるようにする
    - @voluntas
  ```

**マージ順:**

```
0016 → 0017
```

- 同一関数 `createSignalingMessage` を編集するため **0016 を先にマージ**
