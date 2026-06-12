# `trace()` が JWT / metadata を console に無サニタイズで出力する

- Priority: High
- Created: 2026-05-21
- Completed: 2026-06-12
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-trace-redact-secrets

## 目的

`trace` (`src/utils.ts:365-412`) と `ConnectionBase.trace` (`src/base.ts:1763-1768`) が signaling message を raw のまま出力する。`ConnectionBase.trace` は `callbacks.log` を `this.debug` に関わらず常に呼び (`src/base.ts:1764`)、`utils.trace` (console) は `this.debug === true` 時のみ呼ぶ (`src/base.ts:1768`)。いずれも `metadata` / `signaling_notify_metadata` に含まれる JWT 等が `debug: true` で DevTools Console から平文で読み取れる。本 issue は **この trace 2 経路 (`callbacks.log` と console)** を `redact` でサニタイズする。

**本修正のスコープと残存リスク (重要):** 同じ機密メッセージは trace を経由しない `writeWebSocketSignalingLog` → `callbacks.signaling` / `callbacks.timeline` (`src/base.ts:1324`→`1327`, `onmessage-offer` `:1276` 等) でも raw のまま渡される。本 issue は trace 経路のみを塞ぐため、`callbacks.signaling` / `callbacks.timeline` を登録して中身をログ出力するアプリでは JWT が依然露出する。これらの経路の redact は別途対応する (フォローアップ issue)。本修正で完全に塞がるのは「`debug: true` で DevTools Console に受動的に出る」trace 経路に限る。

## 必要性

**必要** (確信度: 高)。現行 `trace` / `ConnectionBase.trace` に redact 処理なし。機密を含む主な trace 呼び出し: `src/base.ts:1324` (`SIGNALING CONNECT MESSAGE` — `metadata`, `signaling_notify_metadata`)、`:1908` (`SIGNALING OFFER MESSAGE` — `metadata`)。`callbacks.log` のデフォルトは no-op (`src/base.ts:314`) で、アプリが log コールバックを登録した場合に raw が外部へ渡る。

## 優先度根拠

High。セキュリティ。`debug: true` 環境で DevTools を開くだけで console trace 経由に JWT が受動的に露出する (ユーザー操作不要)。Sora SaaS 利用サービスで影響大。リリース時のアドバイザリ文面は「console trace 経路の機密露出を redact した。`callbacks.signaling` / `callbacks.timeline` を自前でログ出力している場合は別経路で残るため、それらは引き続き注意が必要」と、修正範囲を正確に記載すること (部分修正を「JWT 露出を完全に解消」と誤告知しない)。

## 現状

### 問題の概要

    B --> D{debug === true?}
    D -->|Yes| E[utils.trace → console raw]
    D -->|No| F[console 出力なし]
    C --> G[JWT / metadata 平文露出]
    E --> G

````

```ts
// src/base.ts:1763-1768
protected trace(title: string, message: unknown): void {
  this.callbacks.log(title, message as JSONType);  // debug 無関係で raw
  if (!this.debug) return;
  trace(this.clientId, title, message);            // console も raw
}
````

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

キー名完全一致のみ redact。値の中身を走査して JWT 文字列を検出する処理はスコープ外。`metadata` / `signaling_notify_metadata` は signaling メッセージの実フィールド、`authn_metadata` / `authz_metadata` は notify 系メッセージの実フィールド。`access_token` / `secret` は signaling メッセージのトップレベルには現れないが、ユーザー指定 `metadata` の中身 (例: fixture の `metadata = { access_token }`) や非 `metadata` キー配下に機密が現れた場合に再帰で捕捉する defensive なキーとして含める。REDACT_KEYS は型定義と自動連動しないため、機密キーが types.ts に追加されたら手動で追随すること。

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
- [FIX] trace() が JWT 等の機密を含む metadata を console / callbacks.log に raw 出力していたセキュリティ問題を redact で修正する
  - @voluntas
```

**後方互換:** `callbacks.log` に渡る値が raw → redacted へ変わる。`callbacks.log` で `metadata` 等を受け取って自前ロギングしているアプリでは `[REDACTED]` に変わる挙動変更だが、機密漏洩を塞ぐ目的なので `[FIX]` として妥当。

## スコープ外

- `writeWebSocketSignalingLog` / `writeDataChannelSignalingLog` / `callbacks.signaling` / `callbacks.timeline` 経路 (`src/base.ts:1779` 等) — raw message を引き続き渡す (残存リスク。別途フォローアップ issue で redact 対象にする)
- `OFFER SDP` trace (`src/base.ts:1909`、`message.sdp` を raw 出力) — SDP 内 ICE 認証情報等は redact しない
- JWT 文字列のヒューリスティック検出
- `debug: false` 時の console 出力 (元々無い)

## マージ順

他 issue との依存なし。単独マージ可。

## 完了条件

- `redact` を実装し `utils.trace` / `ConnectionBase.trace` の両方で使用する
- `tests/utils.test.ts` に redact 単体テスト 3 件を追加する
- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` にセキュリティ修正 `[FIX]` エントリを追記する

## 解決方法

- `src/utils.ts` に `redact` 関数 (公開 export、`@internal`) と再帰実装 `redactInner` を追加した
  - `REDACT_KEYS` の集合 (`metadata` / `signaling_notify_metadata` / `authn_metadata` / `authz_metadata` / `access_token` / `secret`) にキー名完全一致する値を `[REDACTED]` 文字列で置換する
  - プリミティブ・null・undefined・文字列 (SDP など) は早期 return で素通り (SDP redact は本 issue のスコープ外)
  - `Object.getPrototypeOf` で plain object 判定し、`Date` / `RTCCertificate` / `RTCIceCandidate` 等のクラスインスタンスは `Object.entries` で getter ベースのプロパティが拾えず空オブジェクトに潰れるため bypass する
  - `WeakSet` で循環参照を検出し、再訪時は `[Circular]` 文字列に置換してスタックオーバーフローを防ぐ
- `src/utils.ts` の `trace` 関数で `dump` に渡す前に `redact` を適用した
- `src/base.ts` の `ConnectionBase.trace` で `callbacks.log` および `utils.trace` の両経路に redact 済みの値を渡すように変更した。`utils` からの import に `redact` を追加した
- `tests/utils.test.ts` に redact の単体テストを追加した
  - issue 設計方針通りの基本 3 件 (機密キー置換 / ネスト・配列の再帰 / 非対象キーの保持)
  - REDACT_KEYS 全 6 キーの網羅 (`test.each`)
  - プリミティブ・null・undefined・文字列・数値・真偽値の境界値 (`test.each`)
  - 配列ルートの再帰、3 段以上のネスト、非破壊性、クラスインスタンス bypass、循環参照、DAG 兄弟参照の挙動固定化
- `CHANGES.md` の `## develop` セクションに `[FIX]` エントリを追加した
