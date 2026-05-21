# `signaling()` の `ws.onmessage` 内例外で `connect()` が 60 秒固まる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-signaling-onmessage-exception

## 目的

`signaling()` 内の `ws.onmessage` async ハンドラで `TypeError` や `JSON.parse` の `SyntaxError` が投げられても、呼び元の `Promise` が resolve も reject もされず、`setConnectionTimeout`（デフォルト 60 秒）まで `connect()` が完全に固まる経路を修正する。

## 優先度根拠

High。中間 LB が壊れた WS フレーム / 不正 JSON を返したり、Sora 側の応答仕様変更時に容易に再現する。エンドユーザーから見ると「接続中のまま 60 秒待たされる」UX 破壊。

## 現状

`src/base.ts:1270-1309`

```ts
ws.onmessage = async (event): Promise<void> => {
  if (typeof event.data !== "string") {
    throw new TypeError("Received invalid signaling data");
  }
  const message = JSON.parse(event.data) as WebSocketSignalingMessage;
  ...
};
```

`onmessage` は async 関数で、内部 throw は呼び元 `Promise` の reject に届かず unhandled rejection になる。`signaling()` を包む Promise は resolve も reject もされない。

## 設計方針

`onmessage` 全体を try/catch で囲み、catch で `reject(error)` を呼ぶ。close / error ハンドラとの整合も取る。

## 完了条件

- 不正データを受信した時点で `connect()` が即座に reject する
- 60 秒待たされる挙動がなくなることを単体 or E2E で検証する

## 解決方法

```ts
ws.onmessage = async (event): Promise<void> => {
  try {
    if (typeof event.data !== "string") {
      throw new TypeError("Received invalid signaling data");
    }
    const message = JSON.parse(event.data) as WebSocketSignalingMessage;
    // 既存処理
  } catch (e) {
    this.signalingTerminate();
    reject(e instanceof Error ? e : new Error(String(e)));
  }
};
```
