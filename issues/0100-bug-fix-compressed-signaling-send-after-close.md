# 圧縮シグナリング送信が await 後の readyState を確認せず send する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-compressed-signaling-send-after-close
- Polished: 2026-10-12

## 目的

圧縮ありのシグナリング送信で、`compressMessage` の完了後に DataChannel が閉じている、または Map から消えているとき、`send` の例外を接続処理の外へ漏らさない。

## 優先度根拠

Medium。非圧縮側は `readyState === "open"` のときだけ送る。圧縮側は `await` のあいだに切断されると `send` が throw する。`onicecandidate` は `sendSignalingMessage` を catch しないため、未処理 rejection になる。ICE 候補は落ちる。

`issues/closed/0034-bug-fix-signaling-send-sync-exceptions.md` は非圧縮の readyState ガードを追加し、圧縮分岐にはガードを入れないと明記した。本 issue はその残った圧縮分岐である。`issues/closed/0009-bug-fix-onicecandidate-not-cleared-after-disconnect.md` は切断系 5 経路で `pc.onicecandidate` を解除して発火源を止めた (一次防衛) が、0009 は compress=true の DataChannel 経路の send 側を扱う別 issue を予告しており、本 issue はそれに該当する。発火済みの `onicecandidate` が切断後に送信を完了する経路は残るため、本 issue は送信側のガード (二次防衛) であり、0009 と相互代替ではない。

`issues/0040-add-design-get-capabilities-api.md` は compressMessage が使えないブラウザでの挙動 (機能検出) を設計する issue である。本 issue の対象は圧縮 API の失敗ではなく、`await` 中のチャネル状態変化であり、機能検出の判定結果には依存しない。0040 の後続実装 issue が同じ送信分岐へ共通の機能検出を組み込むため、本 issue はチャネル状態のガードだけに限定して、その組み込みと衝突しないようにする。

## 現状

`ConnectionBase.sendSignalingMessage` は signaling DataChannel の `compress === true` のとき、`await compressMessage` のあと readyState も try も無しに `send` する。チャネルが Map から消えていれば `TypeError`、残っていても `readyState` が `"open"` でなければ `send` が `InvalidStateError` になる。

`ConnectionBase.sendStatsMessage` の圧縮分岐も同じである。

`ConnectionBase.sendMessage` は呼び出し前に `readyState === "open"` を見るが、`compressMessage` のあとには見ない。`await` 中に閉じると `send` が `InvalidStateError` で throw して呼び出し元の Promise が reject する。このとき事前チェックと同じ `Error("Messaging DataChannel is not open")` ではなく DOMException を呼び出し元が受け取る。

`ConnectionBase.rpc` の圧縮送信は `then` の直後に `.catch` が付いており、`send` の throw は `reject()` に変換される。notification も通常リクエストも未処理 rejection にはならない (`issues/0040-add-design-get-capabilities-api.md` も同じ結論)。切断時の send 抑止は `issues/0095-bug-fix-reject-rpc-on-disconnect.md` の範囲であり、本 issue の対象外である。

`abend()` の圧縮後にチャネル参照が消える問題は `issues/0101-bug-fix-abend-channel-missing-after-compress.md` で扱う。

## 設計方針

圧縮の `await` のあと、送信先 DataChannel がまだ Map にあり `readyState === "open"` のときだけ `send` する。Map に無い、または open でないときは送信をスキップし、signaling ログに失敗を残す。`onicecandidate` から未処理 rejection を出さない。

- 送信先は `await` 中に同じラベルで差し替わることがある (`ConnectionBase.onDataChannel` の再ネゴシエーション処理で旧インスタンスが閉じ、新インスタンスが Map に入る)。現在の Map エントリを送信先とし、圧縮開始時の参照に固定しない。差し替わった後の新インスタンスが open ならそこへ送る
- 失敗ログ用に、`await` の前に送信先のチャネル参照を保持する。Map から消えた場合でも、保持した参照で `writeDataChannelSignalingLog("failed-to-send-...", ...)` を呼べる (`disconnectDataChannel` の `failed-to-send-disconnect` と同じ形)
- `compressMessage` 自体の reject は本 issue では扱わない。`issues/0040-add-design-get-capabilities-api.md` の機能検出方針に従い、try/catch による対症療法は導入しない
- `sendStatsMessage` の失敗を DataChannel の `onmessage` で捕捉する層は `issues/0099-bug-fix-renegotiation-failure-unhandled.md` が担う。本 issue は送信自体を試みない層であり、両者は二重防御である
- `sendMessage` は `await` 後に open でなければ送信せず、事前チェックと同じ `Error("Messaging DataChannel is not open")` で reject する。非圧縮側は現状のまま変更しない
- `rpc()` の圧縮送信は対象外である。現状の `.then().catch()` が `send` の throw を `reject()` に変換しており、変更しない

非圧縮側の既存ガードは維持する。DataChannel が存在して open でないときに WebSocket へ落とすフォールバックは、本 issue では追加しない。

## 完了条件

- 圧縮完了時点で signaling DataChannel が Map に無い、または open でないとき、`sendSignalingMessage` は送信せず失敗ログを残し、throw しない
- `sendStatsMessage` も同じである
- 圧縮完了時点で messaging DataChannel が open でないとき、`sendMessage` は送信せず `Error("Messaging DataChannel is not open")` で reject する
- 圧縮完了時に同じラベルのチャネルが差し替わっていた場合、現在の Map エントリが open ならそのチャネルへ送る (メッセージを落とさない)
- 非圧縮で `readyState === "open"` の送信は今までどおり成功する
