# `signaling()` の `ws.onmessage` 内例外で `connect()` が `connectionTimeout` まで固まる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-signaling-onmessage-exception

## 目的

`signaling()` (`src/base.ts:1253-1336`) 内に登録される `ws.onmessage` (`src/base.ts:1270-1309`) は async クロージャで、内部で `TypeError` (1272 行の `throw new TypeError("Received invalid signaling data")`) や `JSON.parse` (1274 行) の `SyntaxError`、`signalingOnMessageTypeOffer` 等の内部メソッドが投げる例外を `signaling()` の Promise の `reject` に伝えない。async 関数の throw は `ws.onmessage` プロパティ assignment の返り値 `Promise<void>` に reject として乗るが、WebSocket dispatcher は戻り値を捕捉しないため unhandled rejection になり、`signaling()` を包む `new Promise((resolve, reject) => ...)` の `reject` 引数には届かない。結果として `connect()` は `setConnectionTimeout` (`src/base.ts:1709-1734`) のタイマー発火 (`this.connectionTimeout` 経過後、デフォルト 60 秒、`options.connectionTimeout = 0` 指定なら永久) まで固まる。

`ws.onmessage` 全体を try/catch で囲み、catch で `signalingTerminate()` を呼んでから `reject(error)` を呼ぶ。

## 優先度根拠

High。`type: offer` 受信前に Sora が想定外の type 文字列を返す、中間 LB / プロキシが壊れた WebSocket frame を返す、Sora の応答仕様変更で type 追加されたが SDK 側が古い、などの経路で `JSON.parse` 失敗または分岐済み handler 内 throw が論理的に成立する。本番観測ログは取得していないため「論理的に成立しうる race」としての扱い。発生すると UX 上「`connect()` を呼んだあと反応がない」状態が `connectionTimeout` (デフォルト 60 秒) まで続き、`options.connectionTimeout = 0` の場合は無限に続く。

## 現状

`src/base.ts:1270-1309`

```ts
ws.onmessage = async (event): Promise<void> => {
  if (typeof event.data !== "string") {
    throw new TypeError("Received invalid signaling data");
  }
  const message = JSON.parse(event.data) as WebSocketSignalingMessage;
  if (message.type === SIGNALING_MESSAGE_TYPE_OFFER) {
    this.writeWebSocketSignalingLog("onmessage-offer", message);
    this.signalingOnMessageTypeOffer(message);
    this.connectedSignalingUrl = ws.url;
    resolve(message);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_UPDATE) {
    this.writeWebSocketSignalingLog("onmessage-update", message);
    await this.signalingOnMessageTypeUpdate(message);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_RE_OFFER) {
    this.writeWebSocketSignalingLog("onmessage-re-offer", message);
    await this.signalingOnMessageTypeReOffer(message);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_PING) {
    await this.signalingOnMessageTypePing(message);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_PUSH) {
    this.callbacks.push(message, TRANSPORT_TYPE_WEBSOCKET);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_NOTIFY) {
    if (message.event_type === "connection.created") {
      this.writeWebSocketTimelineLog("notify-connection.created", message);
    } else if (message.event_type === "connection.destroyed") {
      this.writeWebSocketTimelineLog("notify-connection.destroyed", message);
    }
    this.signalingOnMessageTypeNotify(message, TRANSPORT_TYPE_WEBSOCKET);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_SWITCHED) {
    this.writeWebSocketSignalingLog("onmessage-switched", message);
    this.signalingOnMessageTypeSwitched(message);
  } else if (message.type === SIGNALING_MESSAGE_TYPE_REDIRECT) {
    this.writeWebSocketSignalingLog("onmessage-redirect", message);
    try {
      const redirectMessage = await this.signalingOnMessageTypeRedirect(message);
      resolve(redirectMessage);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
};
```

問題のシナリオ:

1. Sora 側が「壊れた WebSocket frame」「不正な JSON」「未定義の type 文字列で `signalingOnMessageTypeOffer` 等を呼べないメッセージ」を送る
2. `ws.onmessage` 内で `throw new TypeError(...)` (1272 行)、`JSON.parse` の `SyntaxError` (1274 行)、または分岐済みハンドラ内で throw
3. async 関数の throw は呼び出し元に届かず unhandled rejection になる
4. `signaling()` の `new Promise((resolve, reject) => ...)` の `reject` には誰も例外を渡さない
5. `multiStream` の `Promise.race` (例: `src/publisher.ts:21-34`) は `setConnectionTimeout` (`src/base.ts:1709-1734`) のタイマー発火を待つ。`this.connectionTimeout` のデフォルト値は `src/base.ts:274` で `60_000` (60 秒)。`options.connectionTimeout = 0` 指定時は `setConnectionTimeout` 内の `if (this.connectionTimeout > 0)` (`src/base.ts:1714`) で何もせず、無限に固まる

`type: redirect` 経路 (`src/base.ts:1300-1307`) は既に内側 try/catch で `reject(error)` を呼んでおり、redirect 内部 throw は正しく伝播する。本 issue で外側 try/catch を追加した場合、redirect 経路は内側で `reject` 済み → 外側 try を抜けて関数終了。Promise 仕様により 2 回目以降の `reject` は no-op なので二重 reject 問題は起きない。

スコープ: 本 issue は「`type: offer` 受信前 (= `signaling()` Promise が未 resolve)」での throw に絞る。offer 受信後の onmessage throw (`signalingOnMessageTypeUpdate` / `signalingOnMessageTypeReOffer` / `signalingOnMessageTypeNotify` 等の throw) は、`signaling()` Promise が既に resolve 済みのため `reject(error)` は no-op となり、本 issue の修正だけでは「接続後の不正メッセージ受信時にどう振る舞うか」を解決できない。これは別 issue として、`abend` または `signalingTerminate` 経由でアプリに通知する経路を別途設計する。

`signalingTerminate` (`src/base.ts:582-598`) は冪等。内部の `ws.close()` / `pc.close()` / `dataChannel.close()` はすべて null/falsy ガード付きで二重呼び出しに安全。`initializeConnection` (`src/base.ts:820-848`) も冪等で、`simulcast` / `spotlight` / `connectionId` 等の状態をリセットする。

## 完了条件

- `src/base.ts:1270-1309` の `ws.onmessage` 全体を try/catch で囲み、catch で `this.signalingTerminate()` を呼んでから `reject(error)` を呼ぶ
- catch で wrap する error 型は `ConnectError` (`src/utils.ts:414-417`) で、`reason: "SIGNALING_ONMESSAGE_EXCEPTION"` 相当を設定する。アプリ側で `error.reason` で分岐可能にする
- `type: redirect` 経路の既存内側 try/catch (`src/base.ts:1302-1306`) は保持する。内側で reject 済みの場合、外側 catch には到達しないため二重 reject にはならない
- 検証は実機 Sora で「壊れた WebSocket frame」「不正 JSON」を狙って送らせるのが難しいため、E2E では再現せず、コードレビューで try/catch の到達性を担保する。手動検証手順を `e2e-tests/sendrecv/README.md` (なければ新規追記) に「DevTools の WebSocket inspect で SDK の `ws.onmessage` を一時的に hook して JSON.parse 失敗を注入する手順」として残す
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] signaling() の ws.onmessage 内で例外が発生したときに connect() が connectionTimeout まで固まっていたのを修正する
    - @voluntas
  ```
- 本 issue は issue 0001 (`signalingOnMessageTypeRedirect` / `signalingOnMessageTypeSwitched` の onmessage 解除) と同じ `signaling()` 関数を編集するため、マージ順を 0001 → 0008 にする。0001 は `signaling()` 内の `ws.onmessage` 本体には触らないが、`signalingOnMessageTypeRedirect` と `signalingOnMessageTypeSwitched` の編集と CHANGES.md エントリでコンフリクトしうる
- offer 受信後の onmessage throw 対策 (resolve 済み Promise への reject 不能問題) は本 issue のスコープ外。issue 0002 の完了条件で先行採番される `abend` 統一リファクタ issue で同時に扱うか、別 issue として登録する

## 解決方法

`src/base.ts:1270-1309` の `ws.onmessage` を次の通り書き換える。1270 行の onmessage assignment 全体を try で囲み、catch で `signalingTerminate` + `reject` する。

```ts
ws.onmessage = async (event): Promise<void> => {
  try {
    if (typeof event.data !== "string") {
      throw new TypeError("Received invalid signaling data");
    }
    const message = JSON.parse(event.data) as WebSocketSignalingMessage;
    if (message.type === SIGNALING_MESSAGE_TYPE_OFFER) {
      this.writeWebSocketSignalingLog("onmessage-offer", message);
      this.signalingOnMessageTypeOffer(message);
      this.connectedSignalingUrl = ws.url;
      resolve(message);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_UPDATE) {
      this.writeWebSocketSignalingLog("onmessage-update", message);
      await this.signalingOnMessageTypeUpdate(message);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_RE_OFFER) {
      this.writeWebSocketSignalingLog("onmessage-re-offer", message);
      await this.signalingOnMessageTypeReOffer(message);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_PING) {
      await this.signalingOnMessageTypePing(message);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_PUSH) {
      this.callbacks.push(message, TRANSPORT_TYPE_WEBSOCKET);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_NOTIFY) {
      if (message.event_type === "connection.created") {
        this.writeWebSocketTimelineLog("notify-connection.created", message);
      } else if (message.event_type === "connection.destroyed") {
        this.writeWebSocketTimelineLog("notify-connection.destroyed", message);
      }
      this.signalingOnMessageTypeNotify(message, TRANSPORT_TYPE_WEBSOCKET);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_SWITCHED) {
      this.writeWebSocketSignalingLog("onmessage-switched", message);
      this.signalingOnMessageTypeSwitched(message);
    } else if (message.type === SIGNALING_MESSAGE_TYPE_REDIRECT) {
      this.writeWebSocketSignalingLog("onmessage-redirect", message);
      try {
        const redirectMessage = await this.signalingOnMessageTypeRedirect(message);
        resolve(redirectMessage);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    this.writeWebSocketSignalingLog("onmessage-exception", { reason: message });
    this.signalingTerminate();
    const wrapped = new ConnectError(
      `Signaling failed. ws.onmessage threw an exception: ${message}`,
    );
    wrapped.reason = "SIGNALING_ONMESSAGE_EXCEPTION";
    reject(wrapped);
  }
};
```

`signaling()` の Promise が既に resolve 済み (= offer 受信後) のケースでは `reject(wrapped)` は no-op となるため、offer 受信前の throw のみが本 issue の修正で実害なく封じられる。offer 受信後の throw は呼び出し済みの `signalingTerminate` で `ws` / `pc` / `dataChannel` をクリーンアップする副作用は残るが、`connect()` の Promise は既に resolve しているのでアプリは「正常接続後にいきなり ws/pc が消えた」状態を経験する。この場合は次回 `pc.onconnectionstatechange === "failed"` で `abendPeerConnectionState` (`src/base.ts:1698-1700`) が走り `callbacks.disconnect` が発火する経路に乗る。
