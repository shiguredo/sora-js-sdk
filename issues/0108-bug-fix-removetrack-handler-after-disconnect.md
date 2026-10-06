# 切断後も remote MediaStream の onremovetrack が次の remoteConnectionIds を更新する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-removetrack-handler-after-disconnect
- Polished: {YYYY-MM-DD}

## 目的

切断した接続の remote `MediaStream` から track が外れても、再接続後の `remoteConnectionIds` から同じ stream id を削除しない。切断後の `removetrack` コールバックも、その接続のイベントとして届かないようにする。

## 優先度根拠

Medium。`ontrack` で付けた `stream.onremovetrack` は、`disconnect()` / `shutdown()` / `abend()` が外す PeerConnection のハンドラに含まれない。`initializeConnection` は `remoteConnectionIds` を新しい配列にするだけである。再接続後に古い stream の remove が走ると、新しい一覧から同じ connection id が消える。

## 現状

`ConnectionPublisher` と `ConnectionSubscriber` の `multiStream` は、`pc.ontrack` の中で remote stream の `onremovetrack` を代入する。ハンドラは `callbacks.removetrack` を呼び、`event.target` の stream id を `this.remoteConnectionIds` から `splice` する。接続世代も、接続中かどうかも見ない。

`disconnect()` が null にするのは PeerConnection の `ondatachannel` / `oniceconnectionstatechange` / `onicegatheringstatechange` / `onconnectionstatechange` / `onicecandidate` である。`ontrack` は外さず、`MediaStream` 側のハンドラも外さない。

## 設計方針

`onremovetrack` は、ハンドラを付けたときの接続世代と `remoteConnectionIds` の配列だけを更新する。`initializeConnection` で配列が差し替わったあとは、古いハンドラは新しい配列を変更しない。

切断後に古い stream から発火した `removetrack` は `callbacks.removetrack` へ渡さない。接続中の remove は従来どおり渡す。

## 完了条件

- 切断後に、切断前の remote `MediaStream` から track が外れても、再接続後の `remoteConnectionIds` は変わらない
- その remove で `removetrack` コールバックが呼ばれない
- 接続中の `removetrack` は従来どおりコールバックが呼ばれ、`remoteConnectionIds` からその stream id が消える
