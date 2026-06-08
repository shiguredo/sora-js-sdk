# `signaling()` の `ws.onmessage` 内例外で `connect()` が `connectionTimeout` まで固まる

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-signaling-onmessage-exception

## 目的

`signaling()` (`src/base.ts:1253-1336`) が登録する `ws.onmessage` (`src/base.ts:1270-1309`) は async クロージャだが try/catch されていない。`typeof event.data !== "string"` での `throw new TypeError` (`src/base.ts:1272`)、`JSON.parse` の `SyntaxError` (`src/base.ts:1274`)、分岐済み handler (`signalingOnMessageTypeUpdate` / `signalingOnMessageTypeReOffer` / `signalingOnMessageTypePing` 等、いずれも `await` を含み reject しうる) の throw が、`signaling()` を包む `new Promise((resolve, reject) => ...)` の `reject` に届かない (WebSocket dispatcher は async `onmessage` の戻り値 Promise を捕捉せず unhandled rejection になるだけ)。結果として `connect()` は `setConnectionTimeout` (`src/base.ts:1712-1734`) のタイマー発火まで固まる (`connectionTimeout` デフォルト 60000ms `src/base.ts:274`、`options.connectionTimeout = 0` なら `if (this.connectionTimeout > 0)` `src/base.ts:1714` ガードで無限)。

`ws.onmessage` を try/catch で包み、`type: offer` / `type: redirect` で resolve する前 (pre-offer) の throw のみ `signalingTerminate()` + `reject(ConnectError)` する。resolve 後 (post-offer) の throw はログのみとし、接続中の ws / pc 破棄を避ける。

## 優先度根拠

High。`type: offer` 受信前に非 string frame、不正 JSON、分岐済み handler 内 throw が論理的に成立する。実機 Sora で人工的な再現は困難 (壊れた frame を意図的に送る経路がない) だが、発生すると `connect()` が無反応のまま `connectionTimeout` (デフォルト 60000ms、`0` なら無限) まで続き、エンドユーザは原因不明の接続失敗を見続ける。

## 現状

### 再現条件 (コードパス)

- **前提**: `type: offer` 未受信 (signaling Promise が pending)、ws OPEN
- **トリガ**: 以下のいずれかが pre-offer に到達
  - 非 string frame (`Blob` / `ArrayBuffer` 等) で `event.data` が string でない
  - 不正 JSON で `JSON.parse` が `SyntaxError`
  - `signalingOnMessageTypeUpdate` / `signalingOnMessageTypeReOffer` / `signalingOnMessageTypePing` 内の await で reject
- **結果**: signaling() の Promise が settle せず、`connectionTimeout` 経過まで `connect()` がハング
- **検証**: 実機再現は困難、コードレビューでハング経路の解消を担保

### 既存コードの構造

`ws.onmessage` (`src/base.ts:1270-1309`) は外側 try/catch を持たない。throw しうる箇所は `:1272` (TypeError)、`:1274` (`JSON.parse`)、各 `await this.signalingOnMessageType*(message)`。`type: redirect` 経路 (`src/base.ts:1300-1307`) のみ内側 try/catch で `reject` するが、raw `Error` を渡している。`type: offer` 受信時に `resolve(message)` する。

`ws.onclose` (`src/base.ts:1260-1268`) は無条件に `signalingTerminate()` + `reject` する。ただし connect 中は `monitorSignalingWebSocketEvent` (`src/base.ts:1592-1617`) が setInterval(100ms) の最初の tick で `ws.onclose` / `ws.onerror` を自前のハンドラに**上書きする**ため、`signaling()` が設定した `ws.onclose` が有効なのは接続開始から最大 100ms 程度である。

`signalingTerminate` (`src/base.ts:582-598`) は `ws.close()` / `pc.close()` / `dataChannel.close()` がすべて null/falsy ガード付きで冪等。`initializeConnection` (`src/base.ts:820-848`) も冪等で `connectionId` / `sessionId` / `clientId` / `bundleId` / `connectedSignalingUrl` 等を全初期化する。`ConnectError` は `src/utils.ts:414-417` に定義され、公開エントリ (`src/sora.ts`) からは export されていない。

## 設計方針

`settled` フラグで `signaling()` Promise の resolve / reject 済みを追跡し、**未 settle 時のみ** catch で `signalingTerminate()` + `reject(ConnectError)` する。

### `settled` / `settleReject` の挿入位置

`return new Promise((resolve, reject) => { ... })` のコールバック内、`this.writeWebSocketSignalingLog("new-websocket", ws.url); ws.binaryType = "arraybuffer";` の **直後** に定義する。`ws.onmessage` クロージャ内で定義すると毎呼び出しでリセットされ機能しない。

`settled = true` は各 `resolve` の**直前**に置く。`signalingOnMessageTypeOffer` (`src/base.ts:1876-1910`) は同期 `void` で Map / プリミティブ代入のみ、現状 throw 経路はないが、将来の検証追加や `writeWebSocketSignalingLog` 自体の throw に備え、ログ出力・`signalingOnMessageTypeOffer` 実行・`this.connectedSignalingUrl` 代入が完了してから `settled = true` にする。途中で throw した場合は `settled === false` で catch に入り pre-offer reject される。

### サンプル実装

```ts
return new Promise((resolve, reject) => {
  this.writeWebSocketSignalingLog("new-websocket", ws.url);
  ws.binaryType = "arraybuffer";

  let settled = false;
  const settleReject = (error: ConnectError): void => {
    if (settled) {
      return;
    }
    settled = true;
    this.signalingTerminate();
    reject(error);
  };

  // ws.onclose は既存実装 (src/base.ts:1260-1268) をそのまま残す。
  // 詳細は補足「ws.onclose は変更しない」を参照

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
        settled = true;
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
        // 既存の event_type 別 timeline ログ呼び出しを維持する
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
        // 内側 signaling() の戻り値 (offer) を外側 signaling Promise として resolve
        const redirectMessage = await this.signalingOnMessageTypeRedirect(message);
        settled = true;
        resolve(redirectMessage);
      }
      // 未知 message.type は no-op (offer 待ちを継続)。現状動作と同じ
    } catch (error) {
      if (settled) {
        // post-offer: ログのみ。接続中の ws / pc 破棄を避ける
        this.writeWebSocketSignalingLog("onmessage-exception-post-offer", (error as Error).message);
        return;
      }
      // pre-offer: signalingTerminate + ConnectError reject
      const wrapped = new ConnectError(
        `Signaling failed. ws.onmessage threw: ${(error as Error).message}`,
        undefined,
        "SIGNALING_ONMESSAGE_EXCEPTION",
      );
      this.writeWebSocketSignalingLog("onmessage-exception-pre-offer", wrapped.message);
      settleReject(wrapped);
    }
  };
  // この後の signalingMessage 生成・ws.send・this.ws 設定ブロックは既存実装をそのまま残す
});
```

### 補足

- **error の文字列化**: `(error as Error).message` を使用する (0034 / 0004 のチェーン規約に揃える)。内部 handler が non-Error 値で reject する経路は想定外として扱う。
- **ログ payload**: 第 2 引数は文字列を直接渡す (0034 / 0004 のチェーン規約)。オブジェクトラップ (`{ reason: ... }`) は使わない。ConnectError の `reason` フィールド (分類コード) との混同を避ける。
- **`ws.onclose` は変更しない**: connect 中の `ws.onclose` は約 100ms 後に `monitorSignalingWebSocketEvent` のハンドラへ置き換わる。pre-offer の close で `ws.onclose` 経由の reject と onmessage の `settleReject` が競合しても、両者は **同じ signaling Promise** を settle しようとし、Promise の settle は 1 回のみ有効で以降は無視される。`signalingTerminate` も冪等なので、`ws.onclose` 側の `settled` 連携は不要。0021 マージ後の `ws.onclose` は `ConnectError` の新 constructor シグネチャを使う形になっているが、本 issue では一切手を入れない。
- **redirect 内部 try/catch を撤去**: 既存 `src/base.ts:1302-1307` の redirect 専用 try/catch を撤去し外側 try に集約する。撤去後は redirect 失敗時の reject 型が raw `Error` から `ConnectError` (`reason: "SIGNALING_ONMESSAGE_EXCEPTION"`) に変わる。
- **redirect の再帰**: `signalingOnMessageTypeRedirect` は内部で `this.signaling(ws, true)` を再帰呼び出しし、内側 `signaling()` は独自の `settled` / `resolve` / `reject` を持つ。外側 onmessage は redirect の `await` 中に他経路から settle される余地が無いため、内側が pre-offer reject すると外側 catch に到達した時点で外側 `settled === false` が確定し、外側 `settleReject` で外側 Promise を reject する。`signalingTerminate` は内側・外側で重ねて呼ばれるが全体が冪等で、旧 ws は redirect ハンドラ (`src/base.ts:2068-2071`、0001 マージ後は `onmessage = null` も追加された形) で既に handler 解除 + close 済み。内側 `signaling()` の post-offer throw は内側 catch でログのみとなり外側に伝播しない (内側 Promise は既に resolve 済み、外側 `await` は内側の `redirectMessage` を受け取って終了)。
- **redirect 失敗時のメッセージ二重プレフィックス**: 内側 `ConnectError` が外側 catch に届くと、外側 catch は `Signaling failed. ws.onmessage threw: ${(error as Error).message}` で再ラップする。内側 message が `Signaling failed. ws.onmessage threw: ...` で始まっている場合、wrapped.message にプレフィックスが 2 段重なる。本 issue のスコープでは許容する副作用 (redirect 経路の発生痕跡が message に残る)。判別が要件化された場合は別 issue で `cause` 連鎖等を検討する。
- **post-offer 例外の観測変化**: 現状 post-offer の `await signalingOnMessageType*` reject は WebSocket dispatcher で捕捉されず `unhandledrejection` イベントとして観測されているが、本修正で `unhandledrejection` は発火しなくなり、SDK の signaling ログ `onmessage-exception-post-offer` に記録される。`window.onunhandledrejection` で signaling 異常を監視している利用者には観測可能な挙動変化となる。
- **ConnectError の `reason`**: `reason: "SIGNALING_ONMESSAGE_EXCEPTION"` は 0021 が確定する SDK 内部エラー分類コード規約 (大文字スネーク) に従う。`reason` には CloseEvent 由来の生文字列が入る既存用途もあり二義的になるが、0021 が許容する設計に沿う (詳細は 0021 参照)。`ConnectError` は SDK から公開されていない (`src/sora.ts` で export していない) ため、利用者は `instanceof` で判別できず、`error.message` プレフィックス `"Signaling failed. ws.onmessage threw:"` (サンプル実装の `wrapped` 構築箇所参照) で判別する。
- **`signalingMessage` 生成の素 reject**: 既存実装の `signalingMessage` 生成 try/catch (`src/base.ts:1320-1323`) は `ws.send` 前の同期実行で、`ws.onmessage` がまだ起動していないため `settleReject` 経路と race しない。`settled` を更新せず素の `reject` のままで安全。本 issue では `settleReject` 化しない。

### 変更対象ファイル

| ファイル      | 内容                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/base.ts` | `signaling()` の `ws.onmessage` を try/catch で囲み `settled` / `settleReject` を導入、redirect 専用 try/catch を撤去 |
| `CHANGES.md`  | `## develop` の既存 `[FIX]` 群末尾、`### misc` より前に追記                                                           |

## 完了条件

### コード変更

- [ ] 上記サンプル実装の **設計意図** どおりに `settled` / `settleReject` を導入し、pre-offer throw 時に `signalingTerminate()` + `reject(ConnectError)` する。ログ名・ログ payload・コメント等の細部はサンプルに準拠する
- [ ] `settled = true` を各 `resolve` の直前に置く
- [ ] post-offer throw (`settled === true`) では `signalingTerminate()` を呼ばずログ `onmessage-exception-post-offer` のみ
- [ ] pre-offer throw はログ `onmessage-exception-pre-offer` を出してから `settleReject(wrapped)` を呼ぶ
- [ ] redirect 専用の内側 try/catch (`src/base.ts:1302-1307`) を撤去し外側 try に集約する
- [ ] NOTIFY 分岐の `writeWebSocketTimelineLog("notify-connection.created" / "notify-connection.destroyed", message)` 呼び出しを維持する
- [ ] `ws.onclose` ハンドラおよび `signalingMessage` 生成・`ws.send`・`this.ws` 設定ブロックは現状維持し変更しない

### 検証

- [ ] ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること (本修正は正常系では新コードパス未到達のため、既存テストの非回帰確認のみ)
- [ ] 本 issue 専用テストは追加しない。`tests/` に signaling 関連テストは無く (現状 `utils.test.ts` / `version-check.test.ts` のみ)、`ws.onmessage` は `signaling()` 内ローカルクロージャで外部から差し替え不可能、CLAUDE.md「モックやスタブは絶対に利用しないこと」規約により、try/catch の到達性はコードレビューで担保する

### 変更履歴

- [ ] `CHANGES.md` `## develop` の既存 `[FIX]` 群の末尾、`### misc` より前に追記する

  ```
  - [FIX] signaling() の ws.onmessage 内で例外が発生したときに connect() が connectionTimeout まで固まっていたのを修正する
    - @voluntas
  ```

## スコープ外

- post-offer throw に対する abend 通知の追加 (本 issue では握りつぶしログのみ)
- `ws.send` 同期例外の handling (issue 0007 / 0034)
- `ws.onclose` の挙動変更 (現状の冪等 reject を維持)
- post-offer の `connectPeerConnection` 以降のフェーズで起きる例外 (本 issue の `ws.onmessage` 例外と別経路で `connect()` reject に届く)

## マージ順

0004 正本チェーン `0004 → 0006 → (0011) → 0021 → 0009 → 0001 → 0008 → 0007 → 0034 → 0031 → 0002 → 0005 → 0030` の一部。0008 の前提は `0021 → 0009 → 0001` で 0021 (ConnectError constructor) と 0001 (同じ `signaling()` 関数を編集) が必須。0008 マージ後に `0007 → 0034 → 0031 → 0002 → 0005 → 0030` が続く。
