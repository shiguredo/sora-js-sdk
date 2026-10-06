# 圧縮シグナリング送信が await 後の readyState を確認せず send する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-compressed-signaling-send-after-close
- Polished: {YYYY-MM-DD}

## 目的

圧縮ありのシグナリング送信で、`compressMessage` の完了後に DataChannel が閉じている、または Map から消えているとき、`send` の例外を接続処理の外へ漏らさない。

## 優先度根拠

Medium。非圧縮側は `readyState === "open"` のときだけ送る。圧縮側は `await` のあいだに切断されると `send` が throw する。`onicecandidate` は `sendSignalingMessage` を catch しないため、未処理 rejection になる。ICE 候補は落ちる。

`issues/closed/0034-bug-fix-signaling-send-sync-exceptions.md` は非圧縮の readyState ガードを追加し、圧縮分岐にはガードを入れないと明記した。本 issue はその残った圧縮分岐である。

## 現状

`ConnectionBase.sendSignalingMessage` は signaling DataChannel の `compress === true` のとき、`await compressMessage` のあと readyState も try も無しに `send` する。チャネルが Map から消えていれば `TypeError`、残っていても `readyState` が `"open"` でなければ `send` が `InvalidStateError` になる。

`ConnectionBase.sendStatsMessage` の圧縮分岐も同じである。

`ConnectionBase.sendMessage` は呼び出し前に `readyState === "open"` を見るが、`compressMessage` のあとには見ない。こちらは呼び出し元の Promise が reject する。

`ConnectionBase.rpc` の圧縮送信も、`then` の中の `send` を catch しない。notification はタイムアウトが無いので、`send` が throw すると Promise が戻らず、rejection は未処理になる。切断後の send 抑止は `issues/0095-bug-fix-reject-rpc-on-disconnect.md` と重なる。本 issue では、切断以外で圧縮完了時にチャネルが `"open"` でない場合も `send` しない。

`abend()` の圧縮後にチャネル参照が消える問題は `issues/0101-bug-fix-abend-channel-missing-after-compress.md` で扱う。

## 設計方針

圧縮の `await` のあと、送信先 DataChannel がまだ同じインスタンスで `readyState === "open"` のときだけ `send` する。そうでなければ送信をスキップし、signaling ログに失敗を残す。`onicecandidate` から未処理 rejection を出さない。

非圧縮側の既存ガードは維持する。DataChannel が存在して open でないときに WebSocket へ落とすフォールバックは、本 issue では追加しない。

## 完了条件

- 圧縮中に signaling DataChannel が閉じた、または削除されたとき、`sendSignalingMessage` が throw しない
- `sendStatsMessage` も同じである
- `sendMessage` は圧縮完了時に open でなければ reject し、`send` しない
- `rpc()` の圧縮送信で `send` が throw しても未処理 rejection にならない
- 非圧縮で `readyState === "open"` の送信は今までどおり成功する
