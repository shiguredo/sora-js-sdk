# `errors.ts` の Disconnect 系エラークラスが `this.name` を設定しておらず識別不能

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-errors-name

## 目的

`DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` は `super(...)` のみ呼んで `this.name` を設定していない。`error.name` は `"Error"` のままになるため、minify 環境やマルチバンドル環境で `instanceof` が壊れ、本番モニタリング（Sentry / Datadog）で 3 種類のエラーが同一グループにまとめられて障害切り分け不可になる。

## 優先度根拠

High。本番モニタリングで切断種別の分類ができなくなり、障害対応の初動が遅れる。

## 現状

`src/errors.ts:1-20`

```ts
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
  }
}
```

3 クラスとも同じ構造で、`this.name` / `Object.setPrototypeOf` のいずれも無い。

## 設計方針

各 constructor で `this.name` を設定し、`Object.setPrototypeOf(this, new.target.prototype)` を呼んで transpile 後の prototype chain 整合を保つ。

## 完了条件

- 各エラークラスの `error.name` が `"DisconnectWaitTimeoutError"` などになる
- transpile / minify 後でも `instanceof` で識別可能
- 単体テストで name と instanceof の動作を検証

## 解決方法

```ts
export class DisconnectWaitTimeoutError extends Error {
  constructor() {
    super("DISCONNECT-WAIT-TIMEOUT-ERROR");
    this.name = "DisconnectWaitTimeoutError";
    Object.setPrototypeOf(this, DisconnectWaitTimeoutError.prototype);
  }
}

export class DisconnectInternalError extends Error {
  constructor() {
    super("DISCONNECT-INTERNAL-ERROR");
    this.name = "DisconnectInternalError";
    Object.setPrototypeOf(this, DisconnectInternalError.prototype);
  }
}

export class DisconnectDataChannelError extends Error {
  constructor() {
    super("DISCONNECT-DATA-CHANNEL-ERROR");
    this.name = "DisconnectDataChannelError";
    Object.setPrototypeOf(this, DisconnectDataChannelError.prototype);
  }
}
```

issue 0021 の `ConnectError` 移管とあわせて `errors.ts` にエラー定義を集約する。
