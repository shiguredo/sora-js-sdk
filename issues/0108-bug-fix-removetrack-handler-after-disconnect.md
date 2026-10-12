# 切断後も remote MediaStream の onremovetrack が次の remoteConnectionIds を更新する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-removetrack-handler-after-disconnect
- Polished: 2026-10-12

## 目的

切断した接続の remote `MediaStream` から track が外れても、再接続後の `remoteConnectionIds` から同じ stream id を削除しない。切断後の `removetrack` コールバックも、その接続のイベントとして届かないようにする。

## 優先度根拠

Medium。`ontrack` で付けた `stream.onremovetrack` は、`disconnect()` / `shutdown()` / `abend()` が外す PeerConnection のハンドラに含まれない。切断後もハンドラは残り、`initializeConnection` は `remoteConnectionIds` を新しい配列へ差し替えるだけである。切断前に `removetrack` の発火が予約されており、その配送が切断後になった場合、古い stream の remove が新しい配列と新しい接続の `callbacks.removetrack` に作用する。

同じリモート参加者が残る部屋へ再接続すると、その stream id (リモート側の接続 id と同じ値。自ストリームは `stream.id === this.connectionId` で除外される) は新しい一覧にも含まれるため、古い remove で新しい一覧から同じ id が消える。`callbacks.removetrack` は一覧に id が無くても呼ばれるため、アプリの映像表示にも誤動作が及ぶ。

発火はブラウザのタスク配送タイミングに依存し、常に観測されるわけではない。`issues/closed/0009-bug-fix-onicecandidate-not-cleared-after-disconnect.md` と同じ「切断後も古いハンドラが発火し得る」分類であり、修正はハンドラ 2 箇所のガードに収まる。

## 現状

`ConnectionPublisher` と `ConnectionSubscriber` の `multiStream` は、`pc.ontrack` の中で remote stream の `onremovetrack` を代入する。ハンドラは `callbacks.removetrack` を呼び、`event.target` の stream id を `this.remoteConnectionIds` から `splice` する。接続状態は見ず、`remoteConnectionIds` を発火時点の `this.remoteConnectionIds` から参照するだけである。

`disconnect()` が null にするのは PeerConnection の `ondatachannel` / `oniceconnectionstatechange` / `onicegatheringstatechange` / `onconnectionstatechange` / `onicecandidate` である。`ontrack` は外さず、`MediaStream` 側のハンドラも外さない。

`removetrack` は SDP 処理に駆動されるイベントである。`type: update` / `type: re-offer` を受けると `signalingOnMessageTypeUpdate` / `signalingOnMessageTypeReOffer` が `setRemoteDescription` を呼び、ブラウザはリモート stream から外れた track の `removetrack` をタスクとして予約して配送する (Firefox の port=0 では発火しないことが `processOfferSdp` のコメントに記録されている)。

切断系メソッド (`disconnect()` / `shutdown()` / `abend()` / `abendPeerConnectionState()` / `signalingTerminate()`) は、PeerConnection のハンドラを無害化し (`signalingTerminate()` は `onicecandidate` のみ)、`pc.close()` (`shutdown()` / `abend()` / `disconnect()` は `maybeClosePeerConnection` 経由) したあと、いずれも `initializeConnection()` で `remoteConnectionIds` を新しい配列にする。しかし、これらは `stream.onremovetrack` に触れない。`removetrack` は WebSocket を経由しないため `ws.onmessage = null` では止められず、実行中の `setRemoteDescription` の完了も待たない。予約から配送までのあいだに `initializeConnection()` が配列を差し替えると、古いハンドラが新しい配列に対して `splice` と `callbacks.removetrack` を実行する。

実行中の `setRemoteDescription` が切断後に再開・完了する競合について、`issues/closed/0001-bug-fix-redirect-old-ws-onmessage-not-cleared.md` には「`type: update` / `type: re-offer` 等の `await` を含むハンドラが実行中で中断している場合、そのハンドラが再開した時点で `this.ws` が null または新接続の ws に差し替わっている可能性がある。これは本修正以前から存在する競合であり」という記述があり、同ファイルはこれを「設計限界」として本 issue (0001) では対応しないとしている。本 issue は切断後に届いた `removetrack` の作用を対象とし、発火タイミングのブラウザ差異自体は扱わない。

## 設計方針

`onremovetrack` は、ハンドラを代入した時点の `remoteConnectionIds` の配列参照を控え、その配列だけを変更する。ハンドラ先頭で `this.remoteConnectionIds` が控えた配列と同一でなければ、`callbacks.removetrack` も `splice` も行わず return する。

配列が差し替わるのは `initializeConnection` だけであり、切断系メソッドはすべて `initializeConnection` を通る。配列の差し替えが接続境界の合図になるため、「接続世代」のようなカウンタは追加しない。`issues/0094-bug-fix-abort-inflight-connect.md` / `issues/0107-bug-fix-concurrent-connect-leaks-peerconnection.md` が導入を予定する接続試行の世代機構とは独立で、世代フィールドの共有も不要である。`issues/0104-bug-fix-remove-track-timer-next-connection.md` が「タイマー登録時点の `RTCPeerConnection` を控えて同一性を比較する」のと同じ、参照の控えと同一性比較の方式である。

切断後に発火した `removetrack` は `callbacks.removetrack` へ渡さない。「接続中」とは、ハンドラを代入したときから `remoteConnectionIds` が差し替わっていない間とする。この間の remove は従来どおり渡し、`remoteConnectionIds` も従来どおり更新する。

## 完了条件

- 切断前の接続に由来し、切断後の `initializeConnection` のあとに届いた `removetrack` では、接続後の `remoteConnectionIds` の内容が変わらない
- その `removetrack` で `callbacks.removetrack` が呼ばれない
- 配列が差し替わるまでの `removetrack` は従来どおり `callbacks.removetrack` が呼ばれ、`remoteConnectionIds` からその stream id が消える
- `pnpm test` (vitest) の既存テストが通ること

### テスト方針

単体テストは追加しない。jsdom 環境には `RTCPeerConnection` がなく、モック・スタブは禁止のため、`removetrack` の発火を再現できない。完了条件は、切断系メソッドがすべて `initializeConnection` を通ることと、ハンドラのガードを含む制御フローがソース上で辿れることをもって確認する (`issues/0094-bug-fix-abort-inflight-connect.md` と同じ扱い)。本 issue 専用の E2E も追加せず、既存 E2E の接続中 `removetrack` が維持されることを回帰確認の範囲とする (`issues/closed/0009-bug-fix-onicecandidate-not-cleared-after-disconnect.md` と同じ方針)。
