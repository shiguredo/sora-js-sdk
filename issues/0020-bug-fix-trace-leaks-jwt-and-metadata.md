# `trace()` が JWT / metadata を console に無サニタイズで出力する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-trace-redact-secrets

## 目的

`trace` (`src/utils.ts:365-412`) は `signalingMessage` や `offer message` などをそのまま `console.group` / `console.info` に出力する。`debug: true` で接続している環境では `metadata` / `signaling_notify_metadata` / `authn_metadata` / `authz_metadata` / `access_token` などのフィールドに含まれる JWT・認証 secret が DevTools の Console から平文で読み取れてしまう。DevTools を開ける環境にいる第三者 (社内デモ、ペアプロ、リモート画面共有、自動収集ツール等) や、ブラウザ拡張機能、`console` のフック経由でセッション乗っ取り経路となる。

本 issue では `trace` の値出力時に対象キーを `"[REDACTED]"` に置換する redact 機構を入れる。`callbacks.signaling` / `callbacks.timeline` 経由でアプリに渡るログの redact は別 issue で扱う (アプリ側がログを Sentry / CloudWatch / Datadog 等に送信するケースで同じく漏洩するが、callback はアプリが意図的に購読する API なので SDK 内の redact 方針を別途設計する必要がある)。

## 優先度根拠

High。セキュリティ。本番運用で `debug: true` のまま動かしているサービスがあれば、DevTools を開くだけで JWT が露出する。SDK 利用者は「debug ログだから安全」と誤解しやすく、漏洩経路として認識されにくい。Sora を SaaS 経由で利用するサービスで影響が大きい。リリース時にセキュリティアドバイザリとして告知する。

## 現状

`src/utils.ts:365-412` の `trace` 関数

```ts
export function trace(clientId: string | null, title: string, value: unknown): void {
  const dump = (record: unknown): void => {
    if (record && typeof record === "object") {
      let keys = null;
      try {
        keys = Object.keys(structuredClone(record) as Record<string, unknown>);
      } catch {
        // 何もしない
      }
      if (keys && Array.isArray(keys)) {
        for (const key of keys) {
          console.group(key);
          dump((record as Record<string, unknown>)[key]);
          console.groupEnd();
        }
      } else {
        console.info(record);
      }
    } else {
      console.info(record);
    }
  };
  // (prefix 構築、console.group / console.log 出力)
}
```

`Object.keys` でキーを取り出して再帰的に `console.group` し、最終的に `console.info(record)` で値そのものを出力する。サニタイズ機構が一切ない。

主な呼び出し箇所 (`src/base.ts` の `this.trace(...)`):

- `src/base.ts:1324` `this.trace("SIGNALING CONNECT MESSAGE", signalingMessage)`: `signalingMessage.metadata` (JWT)、`signalingMessage.signaling_notify_metadata` を含む
- `src/base.ts:1908` `this.trace("SIGNALING OFFER MESSAGE", message)`: `message.metadata`、`message.authn_metadata`、`message.authz_metadata` を含む
- `signalingOnMessageTypeNotify` 周辺の trace 呼び出し: notify message 内 `metadata` / `authn_metadata` を含む

`writeWebSocketSignalingLog` (`src/base.ts:1777-1780`) / `writeDataChannelSignalingLog` (`:1788-1795`) / `writeWebSocketTimelineLog` (`:1803-1806`) / `writeDataChannelTimelineLog` (`:1814-1821`) / `writePeerConnectionTimelineLog` (`:1829-1832`) / `writeSoraTimelineLog` (`:1840-1843`) は `callbacks.signaling` / `callbacks.timeline` 経由で同じデータをアプリに渡す。これらの redact は本 issue のスコープ外で別 issue として扱う。

## 完了条件

- `src/utils.ts` に `redact(value: unknown): unknown` 純粋関数を新規追加する。再帰的にオブジェクトを走査し、redact 対象キーは `"[REDACTED]"` に置換、配列は再帰、それ以外はそのまま返す
- redact 対象キーは Set で管理し、デフォルトで次を含める
  - `metadata`
  - `signaling_notify_metadata`
  - `authn_metadata`
  - `authz_metadata`
  - `access_token`
  - `secret`
- `trace` (`src/utils.ts:365-412`) の `console.info(record)` で値を出力する直前 / `console.group(key)` でキーを表示する前段で値を `redact(value)` 経由に通す
- 単体テストを `tests/utils.test.ts` に追加し、次を assert する
  - `redact({ metadata: "jwt", foo: "bar" })` が `{ metadata: "[REDACTED]", foo: "bar" }` を返す
  - ネスト構造 `{ a: { authn_metadata: "x" } }` が `{ a: { authn_metadata: "[REDACTED]" } }` になる
  - 配列要素のオブジェクトも再帰的に redact される
  - `metadata` 等を含まないオブジェクトは何も書き換えない
- リリースノート (CHANGES.md `## develop`) に通常エントリと別途、セキュリティアドバイザリとして「debug: true で運用している環境で JWT / metadata 系が DevTools 経由で漏洩していたのを修正した」を明示する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [SECURITY] trace() が JWT を含む metadata / authn_metadata / authz_metadata / signaling_notify_metadata / access_token / secret を console に raw 出力していたのを redact するように修正する
    - @voluntas
  ```
  CLAUDE.md の種別 (`[CHANGE]` / `[ADD]` / `[UPDATE]` / `[FIX]`) には `[SECURITY]` が無いため、`[FIX]` で代用するか、CLAUDE.md に `[SECURITY]` を追加する判断を本 issue 着手者が行う。`[FIX]` で代用する場合は説明文の冒頭に「(セキュリティ)」と明示する
- `callbacks.signaling` / `callbacks.timeline` 経由のアプリ通知も同じ漏洩経路を持つが、本 issue では扱わない。`issues/SEQUENCE` から 1 つ採番して別 issue 雛形を `issues/` 配下に作成し、`SEQUENCE` を +1 する (`callbacks` 経由の redact をどう設計するか、アプリ側責任にするかを別 issue で議論)

## 解決方法

`src/utils.ts` 内、`trace` 関数の上に redact 関数を追加する。

```ts
const REDACT_KEYS = new Set([
  "metadata",
  "signaling_notify_metadata",
  "authn_metadata",
  "authz_metadata",
  "access_token",
  "secret",
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

`src/utils.ts:365-412` の `trace` 関数本体で、`dump` 内の `console.info(record)` 直前と `console.group(key)` で参照する `record[key]` を、トップレベルの `value` を `redact(value)` で置換した値で扱うように変更する。具体的には次の通り `trace` 冒頭で `value` を redact する。

```ts
export function trace(clientId: string | null, title: string, value: unknown): void {
  const redactedValue = redact(value);
  const dump = (record: unknown): void => {
    // 既存処理 (record を redactedValue ベースで扱う)
  };
  // 既存の prefix 構築・console.group / console.log 出力
  // dump(value) を dump(redactedValue) に変更する
}
```

`redact` を `dump` 内で再帰的に呼ぶより、入口で 1 回 `redact(value)` を作って `dump` に渡すほうが性能・コード単純性ともに良い。`structuredClone` の代替としても機能する (`structuredClone` で循環参照やクローン失敗を握り潰している既存挙動 `:369-373` は `redact` 後の値で同様に走るが、`redact` 後はプレーンオブジェクトなので `structuredClone` は失敗しない)。

`tests/utils.test.ts` に redact 関数のテストを追加する。

```ts
test("redact は metadata 系のキーを [REDACTED] に置換する", () => {
  const input = {
    type: "offer",
    metadata: "jwt-token",
    signaling_notify_metadata: { uid: "x" },
    authn_metadata: "auth",
    nested: {
      authz_metadata: "z",
      ok: "value",
    },
    arr: [{ access_token: "a" }, { secret: "s" }],
  };
  const output = redact(input);
  expect(output).toEqual({
    type: "offer",
    metadata: "[REDACTED]",
    signaling_notify_metadata: "[REDACTED]",
    authn_metadata: "[REDACTED]",
    nested: {
      authz_metadata: "[REDACTED]",
      ok: "value",
    },
    arr: [{ access_token: "[REDACTED]" }, { secret: "[REDACTED]" }],
  });
});

test("redact は対象キーを含まないオブジェクトをそのまま返す", () => {
  const input = { type: "offer", sdp: "v=0..." };
  expect(redact(input)).toEqual(input);
});
```

`redact` 関数を export するかは設計判断。`trace` の内部実装に閉じれば export 不要。テストから呼ぶ場合は internal 用に export する。
