# `trace()` が JWT / metadata を console に無サニタイズで出力する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-trace-redact-secrets

## 目的

`trace` (`src/utils.ts:365-412`) と `ConnectionBase.trace` (`src/base.ts:1763-1768`) が signaling message を raw のまま出力する。`callbacks.log` は `this.debug` に関わらず常に呼ばれ (`src/base.ts:1764`)、`utils.trace` (console) は `this.debug === true` 時のみ。いずれも `metadata` / `signaling_notify_metadata` / `authn_metadata` / `authz_metadata` / `access_token` / `secret` に含まれる JWT 等が DevTools Console から平文で読み取れる。`redact` を導入して両経路をサニタイズする。

## 必要性

**必要** (確信度: 高)。現行 `trace` / `ConnectionBase.trace` に redact 処理なし。機密を含む主な呼び出し: `src/base.ts:1324` (`SIGNALING CONNECT MESSAGE` — `metadata`, `signaling_notify_metadata`), `:1908` (`SIGNALING OFFER MESSAGE` — `metadata`)。`SignalingOfferMessage` 型 (`src/types.ts:135-161`) に `authn_metadata` / `authz_metadata` は無い。

## 優先度根拠

High。セキュリティ。`debug: true` 環境で DevTools を開くだけで JWT が露出する。Sora SaaS 利用サービスで影響大。リリース時にセキュリティアドバイザリとして告知する。

## 現状

```ts
// src/base.ts:1763-1768
protected trace(title: string, message: unknown): void {
  this.callbacks.log(title, message as JSONType);  // debug 無関係で raw
  if (!this.debug) return;
  trace(this.clientId, title, message);            // console も raw
}
```

`utils.trace` は `ConnectionBase.trace` からのみ呼ばれる (`src/base.ts:1768`)。

## 設計方針

### 1. `redact` 関数 (`src/utils.ts`, `trace` の上)

```ts
const REDACT_KEYS = new Set([
  "metadata",
  "signaling_notify_metadata",
  "authn_metadata",
  "authz_metadata",
  "access_token",
  "secret",
]);

export function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  const result: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACT_KEYS.has(key) ? "[REDACTED]" : redact(v);
  }
  return result;
}
```

キー名完全一致のみ redact。値の中身を走査して JWT 文字列を検出する処理はスコープ外。

### 2. `trace` (`src/utils.ts:365-412`)

入口で `const redactedValue = redact(value)` を作り、`dump(redactedValue)` に渡す。

### 3. `ConnectionBase.trace` (`src/base.ts:1763-1768`)

```ts
protected trace(title: string, message: unknown): void {
  const redacted = redact(message) as JSONType;
  this.callbacks.log(title, redacted);
  if (!this.debug) return;
  trace(this.clientId, title, redacted);
}
```

`redact` は `utils` から import する。

### 4. テスト (`tests/utils.test.ts`)

```ts
import { redact } from "../src/utils";

test("redact は機密キーを [REDACTED] に置換する", () => {
  expect(redact({ metadata: { access_token: "jwt" }, sdp: "v=0" })).toEqual({
    metadata: "[REDACTED]",
    sdp: "v=0",
  });
});

test("redact はネストと配列を再帰処理する", () => {
  expect(redact({ items: [{ authn_metadata: "secret" }, { type: "ok" }] })).toEqual({
    items: [{ authn_metadata: "[REDACTED]" }, { type: "ok" }],
  });
});

test("redact は非対象キーをそのまま残す", () => {
  expect(redact({ channel_id: "ch", role: "sendrecv" })).toEqual({
    channel_id: "ch",
    role: "sendrecv",
  });
});
```

### 5. CHANGES.md

```
- [FIX] (セキュリティ) trace() が JWT を含む metadata / authn_metadata / authz_metadata / signaling_notify_metadata / access_token / secret を console に raw 出力していたのを redact するように修正する
  - @voluntas
```

## スコープ外

- `writeWebSocketSignalingLog` / `callbacks.signaling` / `callbacks.timeline` 経路 (`src/base.ts:1777-1780` 等) — raw message を引き続き渡す
- JWT 文字列のヒューリスティック検出
- `debug: false` 時の console 出力 (元々無い)

## マージ順

他 issue との依存なし。単独マージ可。0004 チェーン (`0004 → 0006 → 0021 → 0009 → 0007`) とは独立。

## 完了条件

- `redact` を実装し `utils.trace` / `ConnectionBase.trace` の両方で使用する
- `tests/utils.test.ts` に redact 単体テスト 3 件を追加する
- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` にセキュリティ修正 `[FIX]` エントリを追記する
