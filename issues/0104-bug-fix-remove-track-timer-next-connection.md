# removeAudioTrack / removeVideoTrack の 100ms タイマーが次の接続のトラックを止める

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-remove-track-timer-next-connection
- Polished: 2026-10-12

## 目的

`removeAudioTrack` / `removeVideoTrack` の 100 ms 待ちのあいだに `this.pc` が別の `RTCPeerConnection` へ入れ替わっても、渡された `MediaStream` の track を `stop()` せず、track id が一致する sender への `replaceTrack(null)` もしない。

## 優先度根拠

Medium。タイマーが見ているのは「今の `this.pc` が null か」だけである。100 ms のあいだに `disconnect()` して同じインスタンスで `connect()` すると、`this.pc === null` の reject には入らない。コールバックは引数の `MediaStream` に対して `track.stop()` と `stream.removeTrack` を実行し、その時点の `this.pc.getSenders()` から同じ track id の sender を探して `replaceTrack(null)` する。新しい `getUserMedia` の track は id が違うので sender には当たらない。同じ `MediaStream` を次の `connect()` に渡していると、その再生中の track が止まる。

`issues/closed/0012-bug-fix-remove-track-race-with-disconnect.md` は `this.pc === null` のとき `ConnectError` (`reason: "REMOVE_TRACK_DURING_DISCONNECT"`) で reject し、その経路では `track.stop()` を呼ばない、という契約を確定している。本 issue はその契約を維持し、null でない別の PeerConnection を誤って操作する穴だけを塞ぐ。

## 現状

`ConnectionBase.removeAudioTrack` と `ConnectionBase.removeVideoTrack` は、先に `enabled = false` してから 100 ms 後に `this.pc === null` なら reject する。null でなければ `track.stop()` と `stream.removeTrack` と `sender.replaceTrack(null)` を実行する。タイマー ID は保存されず、接続の世代も見ない。

`replaceAudioTrack` / `replaceVideoTrack` はこの reject のあと transceiver を探す。`REMOVE_TRACK_DURING_DISCONNECT` のとき新しい track は `stream` に追加されない。ドキュメントは、そのとき呼び出し側が新しい track を `stop()` する、と書いている。

## 設計方針

タイマーを登録した時点の `RTCPeerConnection` を控えておき、100 ms 後の `this.pc` が null の場合、または控えた `RTCPeerConnection` と同一でない場合に、0012 と同じ `ConnectError` (`reason: "REMOVE_TRACK_DURING_DISCONNECT"`) で reject する。`track.stop()` / `removeTrack` / `replaceTrack(null)` は実行しない。

`this.pc === null` の既存経路のエラー型と reason は変えない。100 ms の待ちと、その前の `enabled = false` は維持する。

## 完了条件

- タイマー登録後 100 ms 以内に別の `RTCPeerConnection` が `this.pc` になったとき、`removeAudioTrack` / `removeVideoTrack` が `REMOVE_TRACK_DURING_DISCONNECT` で reject する
- そのとき新しい接続の track は `stop()` されず、sender の `replaceTrack(null)` も呼ばれない
- 同じ PeerConnection のまま 100 ms 経過したときは、従来どおり `stop()` と `replaceTrack(null)` が走る
- `this.pc === null` のときも従来どおり同じ reason で reject する
