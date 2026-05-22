# redirect で旧 WebSocket の `onmessage` が解除されず新接続の状態が壊れる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-redirect-onmessage-leak

## 目的

`type: redirect` 受信時に旧 WebSocket の `onmessage` ハンドラが解除されないまま `ws.close()` を呼んでいる経路を塞ぐ。`signalingOnMessageTypeRedirect` (`src/base.ts:2064-2077`) は `this.ws = null` にした直後に `await this.getSignalingWebSocket(message.location)` と `await this.signaling(ws, true)` で制御を手放すため、その間に旧 ws の `onmessage` クロージャがサーバー追送メッセージで呼ばれると、`this` のシグナリング状態が新接続の値の上から書き換えられる。同型の漏れが `signalingOnMessageTypeSwitched` (`src/base.ts:2045-2052`) の `ignore_disconnect_websocket: true` 経路にもあり、こちらも本 issue で塞ぐ。

## 優先度根拠

High。`signalingUrlCandidates` を複数指定するクラスタ運用は本番で常用される構成で、入口ノードが別ノードへ `type: redirect` を返す経路は常に通る。書き換えが起きると `signalingOnMessageTypeNotify` (`src/base.ts:2019-2033`) の `message.connection_id === this.connectionId` 判定 (`src/base.ts:2024-2028`) が新ノードの notify を取りこぼし、`triggerConnectedCallbackIfReady` (`src/base.ts:2003-2012`) の発火条件 (`selfConnectionCreatedMessage !== null`) を満たさず、`connected` callback が発火しなくなる可能性がある。「永遠に発火しない不具合の根本原因」と断定するには race 再現タイムラインの取得が必要で、現時点では論理的に成立しうる race の 1 つとして扱う。

## 現状

`src/base.ts:2064-2077`

```ts
private async signalingOnMessageTypeRedirect(
  message: SignalingRedirectMessage,
): Promise<SignalingOfferMessage> {
  if (this.ws) {
    this.ws.onclose = null;
    this.ws.onerror = null;
    this.ws.close();
    this.ws = null;
  }
  // XXX: 送られてきたシグナリング URL をそのまま使うようにする
  const ws = await this.getSignalingWebSocket(message.location);
  const signalingMessage = await this.signaling(ws, true);
  return signalingMessage;
}
```

`onclose` と `onerror` は null 化されているが `onmessage` が残ったまま `ws.close()` を呼んでおり、close() 完了前に user agent が dispatch キューに積んだメッセージや、`signalingOnMessageTypeRedirect` 自身の `await` 中にサーバーから追送されたメッセージが、旧 ws の `onmessage` クロージャ経由で `this` を書き換える。

旧 ws の `onmessage` は `signaling()` (`src/base.ts:1270-1309`) で設定される async クロージャで、メッセージ種別ごとに次の副作用を持つ。

- `type: offer` (`src/base.ts:1275-1279`): `signalingOnMessageTypeOffer` (`src/base.ts:1876-1910`) 経由で `this.simulcast` (1877)、`this.spotlight` (1878)、`this.sessionId` (1882)、`this.clientId` (1884)、`this.bundleId` (1885)、`this.connectionId` (1886)、`this.authMetadata` (1889)、`this.encodings` (1892)、`this.mids.audio` (1895)、`this.mids.video` (1898)、`this.signalingOfferMessageDataChannels[dc.label]` (1902)、`this.rpcMethods` (1906) を上書きし、続けてクロージャ内で `this.connectedSignalingUrl = ws.url` (1278) を旧 ws の URL に書き戻す。さらに `resolve(message)` (1279) を呼ぶが、`signaling()` Promise はすでに redirect 経路 (1304) で resolve 済みのため 2 回目の resolve は Promise 仕様で no-op となり、害は副作用上書きにのみ現れる。
- `type: notify` (`src/base.ts:1290-1296`): `signalingOnMessageTypeNotify` が `connection.created` notify について `message.connection_id === this.connectionId` 比較を行う (`src/base.ts:2024-2028`)。
- `type: switched` / `type: re-offer` / `type: update` / `type: ping` / `type: push`: 対応するメソッドが走り、`signalingSwitched` 立てや answer 送信や stats 送信などの副作用が起きる。

具体的な race のシナリオ:

1. 旧 ws から `type: redirect` を受け取り `signalingOnMessageTypeRedirect` に入る
2. ハンドラ冒頭で `this.ws = null` し、`await this.getSignalingWebSocket(message.location)` で制御を手放す
3. 新 ws の `signaling(ws, true)` (`src/base.ts:1253-1336`) が新 offer を処理し、`signalingOnMessageTypeOffer` (1886) で `this.connectionId` を新 ID に更新し、Promise を resolve する
4. このタイミングで、旧 ws の onmessage が dispatch キューから取り出されて走り、`signalingOnMessageTypeOffer` が `this.connectionId` を旧 ID に上書きする
5. 新ノードから届く自分の `connection.created` notify は `message.connection_id === this.connectionId` を満たさず、`selfConnectionCreatedMessage` がセットされない
6. `triggerConnectedCallbackIfReady` が発火条件を満たさず、`connected` callback が呼ばれない

同型のパターンが `signalingOnMessageTypeSwitched` (`src/base.ts:2045-2052`) にも存在する。

```ts
if (message.ignore_disconnect_websocket) {
  if (this.ws) {
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }
  this.writeWebSocketSignalingLog("close");
}
```

ここでは `onclose` のみ null 化されており、`onmessage` を null 化していない。`signaling()` (`src/base.ts:1253-1336`) は `ws.onclose` と `ws.onmessage` のみ設定し `ws.onerror` を設定しないため、本 issue で switched 側に新規追加するのは `onmessage = null` の 1 行のみとし、`onerror = null` は追加しない。

参考のため、他経路における ws ハンドラ解除パターン:

- `abendPeerConnectionState` (`src/base.ts:614-624`): `onclose` をログ専用関数に差し替え、`onmessage` / `onerror` を null 化
- `abend` (`src/base.ts:725-735`): 同上
- `disconnect` (`src/base.ts:1063-1073`): `onclose` をログ専用、`onmessage` / `onerror` を null 化
- `shutdown` (`src/base.ts:668-708`): ws ハンドラ解除を一切行っていない
- `signalingTerminate` (`src/base.ts:582-598`): `ws.close()` のみ

`shutdown` と `signalingTerminate` のハンドラ解除漏れは原因と影響範囲が別 (DataChannel 経由切断・signaling reject 経路) なので本 issue では扱わない。新規 issue 2 件として別ブランチ・別 PR で扱う方針とし、本 issue の PR には含めない (CLAUDE.md「1 issue 完了ごとに 1 コミットすること」を踏襲)。

## 設計方針

`signalingOnMessageTypeRedirect` と `signalingOnMessageTypeSwitched` の `ignore_disconnect_websocket: true` 経路で、`ws.close()` を呼ぶ前に `onmessage` を null 化する。`onmessage = null` の代入は同期的に、現在実行中の onmessage タスク (= redirect / switched の処理本体) よりも後に dispatch されるすべての MessageEvent を遮断する。これは `abend` などの既存パターン (`src/base.ts:733`) と同じ。

`onerror` の null 化は `signaling()` で `onerror` が設定されないことを確認した上で、`signalingOnMessageTypeRedirect` 側の既存記述は破壊的変更を避けるため残し、`signalingOnMessageTypeSwitched` 側には新規追加しない。

ガード `if (this.ws !== ws) return;` を `signaling()` 内に追加する案は 2 周目のレビューで撤回した。理由:

- `onmessage = null` は同期的に効くため、`signalingOnMessageTypeRedirect` のハンドラ冒頭で null 化すれば、redirect ハンドラの `await` 中に旧 ws から追送される MessageEvent はそもそも `onmessage` ハンドラを呼ばない
- redirect ハンドラに入った時点 (= 旧 ws の onmessage 中) では、JavaScript はシングルスレッドなので「同じ tick で別の旧 ws onmessage が同時実行」は起こらない
- ガードを入れると、新 ws の onmessage が `signaling()` 内 1328 行の `this.ws = ws` セット前に dispatch される万一の race で新 ws の正規メッセージが捨てられる可能性が増える

## 完了条件

- `signalingOnMessageTypeRedirect` (`src/base.ts:2064-2077`) で `ws.close()` の前に `this.ws.onmessage = null` が追加されている
- `signalingOnMessageTypeSwitched` の `ignore_disconnect_websocket: true` 経路 (`src/base.ts:2045-2052`) で `ws.close()` の前に `this.ws.onmessage = null` が追加されている
- 検証として、ローカルで Sora を 2 ノード起動し入口ノードから `type: redirect` を返させる手順を `e2e-tests/redirect/README.md` (新規) に残し、その手順で `Sora.callbacks.connected(message)` がちょうど 1 回発火して `message.connection_id` が redirect 後の新ノードの connection_id と一致することを確認したログを PR 説明に添付する。Playwright での自動化は本 issue のスコープ外とし、必要に応じて別 issue で扱う (クラスタ Sora を CI で起動する仕組み構築が前提となり、本 issue の `onmessage = null` 追加と切り離せる)
- CHANGES.md `## develop` に `[FIX] type: redirect 受信時と type: switched (ignore_disconnect_websocket) 経路で旧 WebSocket の onmessage が解除されていなかったのを修正する` を追記する

## 解決方法

`src/base.ts:2064-2077` の `if (this.ws) { ... }` ブロックを次の通り書き換える。

```ts
if (this.ws) {
  this.ws.onclose = null;
  this.ws.onerror = null;
  this.ws.onmessage = null;
  this.ws.close();
  this.ws = null;
}
```

`src/base.ts:2045-2052` の `signalingOnMessageTypeSwitched` の `ignore_disconnect_websocket: true` 経路を次の通り書き換える。

```ts
if (message.ignore_disconnect_websocket) {
  if (this.ws) {
    this.ws.onclose = null;
    this.ws.onmessage = null;
    this.ws.close();
    this.ws = null;
  }
  this.writeWebSocketSignalingLog("close");
}
```

`signaling()` (`src/base.ts:1253-1336`) のシグネチャや内部実装は本 issue では変更しない。
