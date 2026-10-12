# forceStereoOutput が direction 書き換えと simulcast 分岐で answer SDP に付かない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-force-stereo-output-not-applied
- Polished: 2026-10-12

## 目的

`forceStereoOutput: true` のとき、answer SDP の再生側 Opus に `stereo=1` が付く。サイマルキャストの分岐と、answer 生成前の direction 書き換えでこの付与が飛ばない状態をなくす。

## 優先度根拠

Medium。`addStereoToFmtp` は `m=audio` かつ `a=recvonly` かつ `a=setup:active` かつ Opus かつ `a=fmtp` かつ `minptime=` があるセクションだけを書き換える。`ConnectionBase.createAnswer` はその前に、`this.mids` の transceiver が `recvonly` なら `direction` を `sendrecv` にする。付与は生成後の SDP 文字列を見る。ブラウザがこの direction 変更を `a=sendrecv` として出した場合、`a=recvonly` が残らず `stereo=1` は付かない。`a=recvonly` のまま出すブラウザでは、この方向変更だけでは付与は飛ばない。

サイマルキャスト分岐は、video transceiver が見つかったとき `setLocalDescription` のあと return する。`addStereoToFmtp` はこの return より後ろにしか無い。見つかる条件は、`mid` が null でない、`sender.track` が null でない、`currentDirection` が null または `sendonly`、かつ mid が `mids.video` と一致するか `"video"` を含む、である。recvonly で送信用 track が無い transceiver はこの return に入らない。sendonly / sendrecv で track 付きの video transceiver が見つかると、`forceStereoOutput` の書き換え自体が実行されない。

`issues/pending/0029-test-fix-stereo-audio-test-cannot-detect-regression.md` は E2E がこの回帰を検知できないというテストの issue であり、SDK の付与漏れは直さない。ただし 0029 の §0 テストケース 4（`a=sendrecv` では付与されない）と §6（sendrecv では `addStereoToFmtp` が no-op になる）は現行挙動を前提としている。本 issue の修正後はこの前提が成立しなくなるため、0029 を実装する際は期待値を本 issue の仕様に合わせて更新する。

## 現状

`ConnectionBase.createAnswer` は次の順である。

1. `this.mids` の transceiver で `direction === "recvonly"` なら `"sendrecv"` にする
2. サイマルキャストかつ role が sendrecv または sendonly で、上の条件を満たす video transceiver が見つかれば `setSenderParameters` と `setRemoteDescription` と `createAnswer` と `setLocalDescription` のあと return する。この `createAnswer` の SDP には `addStereoToFmtp` をかけない
3. それ以外は `createAnswer` の SDP に、`forceStereoOutput` のとき `addStereoToFmtp` をかけてから `setLocalDescription` する

`addStereoToFmtp` の `isRecvOnly` は `a=recvonly` を含むセクションだけを対象にする。`minptime=` が無い fmtp も置換しない。`minptime` が無い場合に付与するかは本 issue の対象外とする。0029 が仕様として固定している。

## 設計方針

`forceStereoOutput` の SDP 書き換えを、サイマルキャスト分岐の `createAnswer` で得た SDP にも適用し、`setLocalDescription` に渡す前に `addStereoToFmtp` を実行する。

付与対象の判定は方向属性で行い、`a=recvonly` だけに依存させない。再生側の Opus セクションに `stereo=1` を付ける条件は、`a=sendonly` または `a=inactive` のどちらも含まないこととする。`a=recvonly`・`a=sendrecv`・方向属性の記述がないセクション（既定は sendrecv で受信あり）は付与対象とし、送信専用で再生が無いセクションには付けない。

変更は `src/utils.ts` の `addStereoToFmtp` の付与条件と、`src/base.ts` の `createAnswer`（サイマルキャスト分岐への適用）に限定する。`addStereoToFmtp` が video セクションを書き換えないことは維持する。

## 完了条件

- recvonly で `forceStereoOutput: true` のとき、answer 生成前に audio transceiver の direction を `sendrecv` に変えた結果、answer に `a=recvonly` が無くても、再生側 Opus の fmtp に `stereo=1` が 1 つ付く。answer に `a=recvonly` が残るブラウザでは、現行の `addStereoToFmtp` でも付く
- sendonly / sendrecv でサイマルキャストかつ `forceStereoOutput: true` のとき、サイマルキャスト分岐の `createAnswer` の SDP にも付与条件が適用され、再生側の Opus があれば `stereo=1` が付く
- `a=sendonly` または `a=inactive` の Opus セクションには `stereo=1` を付けない
- `forceStereoOutput` が false のとき answer SDP は変わらない
- すでに `stereo=1` がある fmtp に二重で付かない
- video の fmtp は変わらない
- `minptime=` が無い fmtp には付けない
- `tests/utils.test.ts` に固定 SDP で付与条件（付与・非付与・二重付与・video の fmtp 不変）を検証するユニットテストを追加する
