# abend() の圧縮 await 後に signaling DataChannel が消えていると切断処理が TypeError で止まる

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-abend-channel-missing-after-compress
- Polished: 2026-10-12

## 目的

`abend()` が signaling DataChannel へ disconnect を送る途中でチャネルが消えても、DataChannel の close、WebSocket の切断、PeerConnection の close、`callbacks.disconnect` まで実行する。

## 優先度根拠

Medium。DataChannel は `onerror` で `abend()`、`onclose` で `disconnect()` が走る。圧縮の `await` 中に並走する切断処理 (`disconnect()` 経由の `initializeConnection`、`shutdown()`、別の `abend()`) が Map から signaling を消すと、`abend()` は `TypeError` で止まり、その後ろの DataChannel close、`disconnectWebSocket`、`maybeClosePeerConnection`、`initializeConnection`、`callbacks.disconnect` が実行されない。呼び出し元 (`ws.onerror` / `ws.onclose`、DataChannel の `onerror`) は `await this.abend()` を try していないため、unhandled rejection になる。なお Map から signaling を消す経路 (`shutdown()`、`signalingTerminate()`、別の `abend()`、`disconnect()` の `initializeConnection`) はいずれも自身で PeerConnection を close するため、実害は「PeerConnection が残る」ことではなく、上記の unhandled rejection と、`abend()` 由来の切断イベント (title / type) が失われて別経路のイベントだけが届くことである。

`issues/closed/0004-bug-fix-abend-compress-failure-skips-cleanup.md` は `compressMessage` 自体の失敗を初期化時の機能検出で扱うとして closed になっている。本 issue は圧縮 API の失敗ではなく、`await` のあと参照が無いことによる `TypeError` である。`issues/pending/0030-refactor-abend-shutdown-idempotency.md` はこの圧縮分岐をそのまま `work()` 内へ転載する方針であり (reject 経路のみ 0040 に委ねる)、本 issue の修正後の状態が転載対象になる。

## 現状

`ConnectionBase.abend` は signaling DataChannel があり `compress === true` のとき、`await compressMessage` の直後に `this.soraDataChannels["signaling"].readyState` を読む。このプロパティアクセスは optional ではない。Map から消えていると `TypeError` になり、その後ろの DataChannel close、`disconnectWebSocket`、`maybeClosePeerConnection`、`initializeConnection`、`callbacks.disconnect` は実行されない。

`abend()` は `disconnectingPromise` を見ない。`disconnect()` と並走する。

非圧縮側は `readyState === "open"` を見てから `send` し、`send` 自体は try されている。圧縮側の `send` も try されているが、その前の `readyState` 読みは try の外である。

## 設計方針

`await compressMessage` のあと、signaling DataChannel がまだ Map にあり `readyState === "open"` のときだけ disconnect メッセージを送る。無い、または open でないときは送信をスキップし、その後ろの DataChannel close、`disconnectWebSocket`、`maybeClosePeerConnection`、`initializeConnection`、`callbacks.disconnect` へ進む。`readyState` の読みも、失敗ログに渡すチャネル参照も、無いオブジェクトへアクセスしない。

`compressMessage` 自体が reject して後続が飛ばれる経路は、0004 が「`abend()` 内の try/catch では直さず、起動時の機能検出に回す」として closed にしている。本 issue ではその reject を握らない。非圧縮での送り直しもしない。

0030 の 4 系統統合は本 issue で行わない。

## 完了条件

- 圧縮の `await` 中に signaling DataChannel が Map から消えても、`TypeError` にならず `callbacks.disconnect` まで実行する
- チャネルが `"open"` のままなら、従来どおり disconnect メッセージを送ってから切断する
- `compressMessage` の reject を本 issue の try/catch では握らない
- `disconnect()` との並走でも、参照が消えたことを理由に `abend()` が途中で止まらない (TypeError にならない)
