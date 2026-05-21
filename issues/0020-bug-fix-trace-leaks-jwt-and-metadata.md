# `trace()` が JWT / metadata / authn_metadata を console に無サニタイズで出力する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-trace-redact-secrets

## 目的

`trace()` は `signalingMessage` や `offer message` を丸ごと console に出力する。`metadata` / `signaling_notify_metadata` / `authn_metadata` / `authz_metadata` には JWT などの認証 secret が含まれるため、`debug: true` で本番運用しているサービスでは DevTools を開くだけで JWT がコピペ可能になり、セッション乗っ取り経路となる。**セキュリティ致命的** な不具合。

## 優先度根拠

High。セキュリティ。本番で `debug: true` のまま動かしているサービスがあれば即座にセッション漏洩可能。Sora を SaaS 経由で利用するサービスでは特に深刻。

## 現状

`src/utils.ts:365-412` の `trace` 関数本体。

呼び出し例:

- `src/base.ts:1324` `this.trace("SIGNALING CONNECT MESSAGE", signalingMessage)` — `signalingMessage.metadata` に JWT が含まれる
- `src/base.ts:1908` `this.trace("SIGNALING OFFER MESSAGE", message)` — `message.metadata` / `message.authn_metadata` を含む
- `signalingOnMessageTypeNotify` 周辺も同様

サニタイズ機構が一切無く、すべてのフィールドを `console.info` / `console.log` で吐き出す。

## 設計方針

trace に「redact 対象キー一覧」を持たせ、JSON dump 時に対象キーは `"[REDACTED]"` に置換してから出力する。デフォルトで以下のキーを redact 対象とする:

- `metadata`
- `signaling_notify_metadata`
- `authn_metadata`
- `authz_metadata`
- `access_token`
- `secret`

利用者が redact 対象を増減できるオプション API を提供することも検討する。

## 完了条件

- `debug: true` でも JWT / metadata 系が console に raw で出ない
- 単体テストで redact 動作を検証
- リリースノートでセキュリティアドバイザリとして告知

## 解決方法

`trace` の値整形パスを再帰関数化し、対象キーは `"[REDACTED]"` に置換する純粋関数を挟む。

```ts
const REDACT_KEYS = new Set([
  "metadata",
  "signaling_notify_metadata",
  "authn_metadata",
  "authz_metadata",
  "access_token",
]);

function redact(value: unknown): unknown {
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

trace の出力時にこの redact を通す。
