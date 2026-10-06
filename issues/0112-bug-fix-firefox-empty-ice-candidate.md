# onIceCandidate() が空の ICE candidate を終端とみなさずシグナリングへ送る

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-firefox-empty-ice-candidate
- Polished: {YYYY-MM-DD}

## 目的

ICE candidate の gather 完了を、`event.candidate === null` だけでなく、candidate 文字列が空のオブジェクトでも終端として扱う。空の candidate を type `candidate` として Sora へ送らない。

## 優先度根拠

Medium。`ConnectionBase.onIceCandidate` のコメントは、Firefox が空文字の candidate を送るようになった、と書いている。実装は `event.candidate === null` のときだけ gather 完了にして resolve する。空文字の `RTCIceCandidate` は `toJSON()` して `sendSignalingMessage` する。終端を候補として送ると、シグナリング上の candidate 列に空メッセージが混ざる。

現行の Firefox が今も空文字を送るかは、このソースだけでは確定できない。コード上は null 以外をすべて候補として送る。

## 現状

`ConnectionBase.onIceCandidate` は `pc.onicecandidate` で次のように分岐する。

- `event.candidate === null` なら resolve する
- それ以外は `event.candidate.toJSON()` に `type: "candidate"` を足して `sendSignalingMessage` する

`iceConnectionState === "connected"` でも resolve する。こちらの成功条件は本 issue で変えない。

`issues/0098-bug-fix-connect-ignores-connection-state-failed.md` は `"failed"` で待つのをやめる issue であり、終端の candidate 判定は変えない。

## 設計方針

`event.candidate === null`、または `candidate` 文字列が空のオブジェクトは gather 完了として resolve する。シグナリングへは送らない。

`candidate` 文字列が空でないオブジェクトは従来どおり送る。終端の判定を変えたことで、null の終端が 2 回到達しても `connect()` の Promise が二重に settle しないことは、既存の resolve が 1 回しか効かないことに任せる。

Firefox 以外で空文字が来た場合も同じ終端として扱う。ブラウザ名では分岐しない。

## 完了条件

- `event.candidate` が null のとき、従来どおり候補を送らず `onIceCandidate` の Promise が resolve する
- `event.candidate` が存在し、その candidate 文字列が空のときも、シグナリングへ送らず Promise が resolve する
- candidate 文字列が空でないときは type `candidate` として送る
- `iceConnectionState === "connected"` で resolve する経路は維持する
