# `forwardingFilter` と `forwardingFilters` の同時指定時に両方を送信して Sora に接続拒否される

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-forwarding-filter-exclusive

## 目的

`createSignalingMessage` (`src/utils.ts:190-195`) で `options.forwardingFilters` (新 API) と `options.forwardingFilter` (旧 API) が両方 `undefined` でない場合、両方を signaling message に積む。両方を同時指定するのは API の誤用で、Sora がどちらを採用するか不定であり接続が不安定または拒否される。`createSignalingMessage` で両方指定を検出して同期 `Error` を throw し、開発者に connect 前へ早期通知する。

## 優先度根拠

High。旧 API から新 API への移行期に両方セットすると、connect 後の Sora 側挙動 (拒否や不定動作) が SDK ログだけでは原因不明になる。型システムでは検出不可。他オプション検証 (`src/utils.ts:132, 135, 324`) と同じ同期 `throw new Error(...)` パターンで揃える。両方指定は元々正常な接続を生まない誤用のため、throw 追加で動作中のコードは壊れない (CHANGES は `[FIX]` とする)。

## 現状

### 問題の概要

````

```ts
if (options.forwardingFilters !== undefined) {
  message.forwarding_filters = options.forwardingFilters;
}
if (options.forwardingFilter !== undefined) {
  message.forwarding_filter = options.forwardingFilter;
}
````

`createSignalingMessage` は `ConnectError` ではなく素の `Error` を使う (他検証と同型)。

## 設計方針

既存の `forwardingFilters` / `forwardingFilter` の if ブロック (190-195) の直前に、両方指定を検出する throw を追加する。片方のみ指定の正常系は変更なし。エラーメッセージは既存検証 (132/135/324) と同じ 1 文・句点なしで揃える。

```ts
// 190 行の if ブロックの直前に追加
if (options.forwardingFilter !== undefined && options.forwardingFilters !== undefined) {
  throw new Error("forwardingFilter and forwardingFilters can not be specified at the same time");
}
```

**変更対象:** `src/utils.ts` の `createSignalingMessage` のみ

**スコープ外:**

- `clientId` / `bundleId` 空文字検証 — issue 0017
- `ForwardingFilter` 型定義変更 — `src/types.ts:367-374`

## 完了条件

- 両方指定時に `Error("forwardingFilter and forwardingFilters can not be specified at the same time")` を throw
- `tests/utils.test.ts` に追加 (`dummyForwardingFilter` に `: ForwardingFilter` 型注釈を付ける。注釈なしだと `rules` がタプル型 `[[ForwardingFilterRule]]` に推論されず型チェックで落ちうる。`ForwardingFilter` を `import type` に追加する):

```ts
import type { ForwardingFilter } from "../src/types";

const dummyForwardingFilter: ForwardingFilter = {
  rules: [[{ field: "kind", operator: "is_in", values: ["video"] }]],
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
  ).toThrow("forwardingFilter and forwardingFilters can not be specified at the same time");
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

test("forwardingFilters のみ指定では throw しない", () => {
  expect(() =>
    createSignalingMessage(
      "sdp",
      "sendrecv",
      "channel",
      null,
      {
        forwardingFilters: [dummyForwardingFilter],
      },
      false,
    ),
  ).not.toThrow();
});
```

- ローカルで `pnpm test` が通ること (型チェック含む)
- CHANGES.md `## develop` に追記 (既存 FIX 群の後ろ、担当者行は 2 文字インデント):

  ```
  - [FIX] createSignalingMessage で forwardingFilter と forwardingFilters の両方が指定された場合に Error を投げるようにする
    - @voluntas
  ```

**マージ順:**

```
0016 → 0017
```

- 同一関数 `createSignalingMessage` を編集するため **0016 を先にマージ**
