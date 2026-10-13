# onIceCandidate() が空の ICE candidate を終端とみなさずシグナリングへ送る

- Created: 2026-10-06
- Completed: 2026-10-14
- Branch: N/A (修正不要のためクローズ)
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

## 解決方法

本 issue の前提が W3C の WebRTC 仕様と WPT の一次資料に反することが確認できたため、ソースコードの変更は行わず closed にする。

### icecandidate イベントが意味する 3 種類の indication

現在の仕様 (w3c/webrtc-pc main、https://github.com/w3c/webrtc-pc/blob/main/webrtc.html の `RTCPeerConnectionIceEvent` の注記) は、`icecandidate` イベントを次の 3 種類に分ける。

- 通常の candidate: "A candidate has been gathered. The candidate member of the event will be populated normally. It should be signaled to the remote peer and passed into addIceCandidate."
- end-of-candidates indication: "An RTCIceTransport has finished gathering a generation of candidates, and is providing an end-of-candidates indication as defined by Section 8.2 of [RFC8838]. This is indicated by candidate.candidate being set to an empty string. The candidate object should be signaled to the remote peer and passed into addIceCandidate like a typical ICE candidate, in order to provide the end-of-candidates indication to the remote peer."
- 全 transport の gathering 完了: "All RTCIceTransports have finished gathering candidates, and the RTCPeerConnection's RTCIceGatheringState has transitioned to complete. This is indicated by the candidate member of the event being set to null. This only exists for backwards compatibility, and this event does not need to be signaled to the remote peer."

つまり、空文字の candidate は「送らない終端」ではなく「シグナリングへ送るべき end-of-candidates indication」であり、逆に null の candidate が「シグナリングへ送る必要がない後方互換用のイベント」である。本 issue が「修正」しようとしたのは、仕様が送ることを推奨している indication を送らなくする変更である。

### 現行実装は仕様どおり

`src/base.ts` の `ConnectionBase.onIceCandidate` は、`event.candidate === null` のときだけ resolve し、それ以外は `event.candidate.toJSON()` に `type: "candidate"` を付けて `sendSignalingMessage` する。空文字の candidate も後者に該当するため、end-of-candidates indication として Sora へ送られる。仕様の上記記述と一致している。

なお、本 SDK は incoming candidate を処理しない (`addIceCandidate` はソース・テスト・サンプルのどこにも無い)。したがって「空文字を送られた側 (Sora) が困る」可能性について、本リポジトリから検証できる材料は無い。Sora サーバ側 (shiguredo/sora) のソースは本リポジトリになく公開もされていないため、この前提はどのみち検証できない。

### Firefox でも null のイベントは後に必ず届く

WPT の `webrtc/RTCPeerConnection-iceGatheringState.html` (https://github.com/web-platform-tests/wpt/blob/master/webrtc/RTCPeerConnection-iceGatheringState.html) の "gathering state and candidate callbacks should fire in the correct order" テストは、次の 2 点を検証している。

- 空文字 candidate を最初に受けた時点で、`iceTransport.gatheringState` と `RTCPeerConnection.iceGatheringState` が共に `'gathering'` のままである
- その後の第 2 の queued task で `gatheringstatechange` → `icegatheringstatechange` → `candidate` が `null` のイベントの順に発火し、gathering が `'complete'` になる

これは本 issue の「空文字は終端」という前提が成り立たないことを示す。空文字イベントの時点では gathering はまだ完了しておらず、`onIceCandidate` は後続の null イベント (または `iceConnectionState === "connected"`) で必ず resolve する。逆に、本 issue の設計どおり空文字で resolve すると、gathering が未完了の時点で resolve することになり、終端としての扱いとしては誤りである。

### RFC 8838 の扱い

仕様の注記は「Section 8.2 of [RFC8838]」を参照するが、RFC 8838 の節構成を確認すると次のとおりである。

- end-of-candidates indication の生成は Section 13 (Generating an End-of-Candidates Indication)
- 受信側の扱いは Section 14 (Receiving an End-of-Candidates Indication)
- Section 8.2 (Performing Connectivity Checks 内) は、checklist の完了条件に "the remote agent has conveyed an end-of-candidates indication for that checklist" を追加する記述であり、indication の定義ではない

RFC 8838 Section 13 は、indication を伝達することを controlled agent には SHOULD、controlling agent には MAY (ただし伝達を RECOMMENDED) としている。本 SDK が搭載されるブラウザは offer を作る側 (controlling agent) であり、伝達しないことは許容されるが、同節は "Conveying an end-of-candidates indication in a timely manner is important in order to avoid ambiguities and speed up the conclusion of ICE processing." と、伝達が ICE 処理の収束を速める目的を明記している。本 issue はこのトレードオフに一切触れておらず、「候補列に空メッセージが混ざる」という危害にも根拠 (テスト・仕様・障害報告) が無い。

### 残る整理対象 (本 issue のスコープ外)

`src/base.ts` の `ConnectionBase.onIceCandidate` 冒頭にある `// TODO(yuito): Firefox は <empty string> を投げてくるようになったので対応する` は、空文字が仕様上の indication であることが分かった時点で陳腐化している。ただしこのコメント整理は本 issue の目的 (挙動変更) とは別物であり、ソース変更を伴うため本 issue では扱わない。

`issues/0098-bug-fix-connect-ignores-connection-state-failed.md` の「空文字の ICE candidate の扱いは `issues/0112-bug-fix-firefox-empty-ice-candidate.md` で扱う。本 issue では終端判定の条件を変えない。」は、本 issue を closed にした後も参照先として残る。0098 の終端判定の変更には影響しないが、参照先の消滅は 0098 を見直すときに反映する。

### 変更ファイル

- `issues/0112-bug-fix-firefox-empty-ice-candidate.md` → `issues/closed/` へ移動
- ソースコード変更なし
- `CHANGES.md` への追記なし
