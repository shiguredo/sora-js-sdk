# `clientId: ""` / `bundleId: ""` を有効値として送信してしまい Sora が拒否する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-clientid-bundleid-empty-string

## 目的

`createSignalingMessage` は `clientId` / `bundleId` の `undefined` チェックしかしないため、空文字 `""` がそのまま `client_id: ""` / `bundle_id: ""` として送信される。Sora 側で `invalid-client-id` 等で接続拒否される経路を塞ぐ。

## 優先度根拠

High。React の `useState("")` 初期値や、フォーム値の trim 漏れで起きやすい誤接続パターン。エンドユーザーから見ると「謎の接続失敗」で原因が特定しづらい。

## 現状

`src/utils.ts:196-201`

```ts
if (options.clientId !== undefined) {
  message.client_id = options.clientId;
}
if (options.bundleId !== undefined) {
  message.bundle_id = options.bundleId;
}
```

`undefined` のみ弾く。空文字は素通り。

## 設計方針

空文字を `undefined` 同様に扱い、message に積まない。あるいは明示的に throw して開発者に誤りを伝える。Sora 仕様としての空文字許容可否を確認した上で、安全側に倒すなら throw が望ましい。

## 完了条件

- 空文字を送信しない
- 単体テストで空文字ケースを検証

## 解決方法

```ts
if (options.clientId !== undefined && options.clientId !== "") {
  message.client_id = options.clientId;
}
if (options.bundleId !== undefined && options.bundleId !== "") {
  message.bundle_id = options.bundleId;
}
```

もしくは throw する設計に統一する場合は:

```ts
if (options.clientId !== undefined) {
  if (options.clientId === "") {
    throw new Error("clientId must not be empty string");
  }
  message.client_id = options.clientId;
}
```

`metadata` / `signalingNotifyMetadata` 等の他オプションでも同種の空文字検証が必要か確認する。
