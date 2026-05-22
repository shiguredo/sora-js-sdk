# `replaceVideoTrack` 後に simulcast の encodings を再適用していない

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-replace-track-encodings

## 目的

`replaceVideoTrack` (`src/base.ts:569-577`) は `removeVideoTrack` → `sender.replaceTrack(newTrack)` の流れで video track を差し替える。WebRTC 仕様 (W3C WebRTC 1.0 `RTCRtpSender.replaceTrack()` §5.2) では `replaceTrack` は `RTCRtpSendParameters` (encodings を含む) を保持する仕様だが、`createAnswer` (`src/base.ts:1455, 1459`) では `setRemoteDescription` 前後で `setSenderParameters` を **2 回** 呼ぶ必要があるパターンが既知 (`active` が反映されないため)。track 差し替え後に Sora 側で rid <-> SSRC マッピングが再構築されるタイミングで、SDK 側が改めて encodings を適用していないと simulcast 状態が想定外になる可能性がある。本 issue では defensive に `replaceVideoTrack` の末尾で `this.encodings` を `setSenderParameters` で再適用する。

`replaceAudioTrack` (`src/base.ts:538-546`) は Sora に audio simulcast が存在しないため本 issue の対象外。`this.encodings` (`src/base.ts:168` 宣言、`:1892` 設定) は video transceiver 用で、audio sender に適用すると `InvalidModificationError` を起こす可能性がある。

## 優先度根拠

Medium。WebRTC 仕様準拠の Chrome / Firefox / Safari では `replaceTrack` 自体は encodings を保持するため、論理的には本問題は再現しないはず。ただし `removeVideoTrack` 内で `replaceTrack(null)` → 100ms setTimeout 経由で stream.removeTrack → その後 `replaceVideoTrack` で `replaceTrack(newTrack)` するシーケンスは仕様としては想定範囲外の連続操作で、実装依存の挙動差が出る余地が残る。`createAnswer` で setRemoteDescription 前後 2 回 `setSenderParameters` する経験則 (`src/base.ts:1455, 1459` のコメント) を踏まえ、`replaceVideoTrack` 後も念のため再適用する defensive 修正。本番観測ログは取得していないため、再現条件確定後に Priority を High に格上げするか Low に格下げするか再判断する。

## 現状

`src/base.ts:569-577`

```ts
async replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void> {
  await this.removeVideoTrack(stream);
  const transceiver = this.getVideoTransceiver();
  if (transceiver === null) {
    throw new Error("Unable to set video track. Video track sender is undefined");
  }
  stream.addTrack(videoTrack);
  await transceiver.sender.replaceTrack(videoTrack);
}
```

`createAnswer` 内 (`src/base.ts:1455, 1459`) の `setSenderParameters` 呼び出しと比較すると、本メソッドは `setSenderParameters` を呼び直していない。

`this.encodings` は `signalingOnMessageTypeOffer` (`src/base.ts:1891-1893`) で `message.encodings` が Array なら設定される。`simulcast === true` の場合に意味を持ち、`simulcast === false` でも `encodings` が来れば代入される (ただし通常 Sora は simulcast 無しなら encodings を送らない)。

`setSenderParameters` (`src/base.ts:2085-2094`) は `transceiver.sender.getParameters()` の `encodings` を引数値で上書きして `setParameters` する。

`removeVideoTrack` (`src/base.ts:490-515`) は 100ms setTimeout 内で `replaceTrack(null)` する。本 issue は `removeVideoTrack` 完了後に発生するため、issue 0012 (`removeXxxTrack` が disconnect 中に reject する変更) のマージ後は `replaceVideoTrack` も切断中に reject になる。0012 マージ後は本 issue の `setSenderParameters` 呼び出しは正常系のみに到達する。

issue 0014 (`setSenderParameters` の堅牢化) は本 issue とは別の修正範囲で、0014 が `setSenderParameters` 内に「encodings 空配列で早期 return」「`InvalidModificationError` の 1 回 retry」等を入れる場合、本 issue の呼び出し側ガードは `setSenderParameters` 内のガードと役割分担する。マージ順序は 0014 → 0013 とし、0014 取り込み後は本 issue 側のガード条件 (`this.simulcast && this.encodings.length > 0`) を維持する。

## 完了条件

- `replaceVideoTrack` (`src/base.ts:569-577`) の `transceiver.sender.replaceTrack(videoTrack)` の後に、`this.simulcast === true` かつ `this.encodings.length > 0` かつ `transceiver.mid === this.mids.video` の場合のみ `await this.setSenderParameters(transceiver, this.encodings)` を呼ぶ
- `replaceAudioTrack` (`src/base.ts:538-546`) は本 issue では変更しない (audio simulcast が無いため `this.encodings` を audio sender に適用するのは誤り)
- E2E は `e2e-tests/simulcast_sendonly/main.ts` に「現在送信中の simulcast 接続で `replaceVideoTrack` を実行する」ボタン (`#replace-video-track`) を追加し、新規テスト `e2e-tests/tests/simulcast_replace_track.test.ts` で次を assert する
  - `replaceVideoTrack` 前後で `transceiver.sender.getParameters().encodings` の `rid` 配列が等しい
  - `replaceVideoTrack` 後の `pc.getStats()` で `outbound-rtp` が 3 本観測できる (r0 / r1 / r2)
  - hidden DOM (`#encodings-rids`) に rid 配列を出して Playwright から検証
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] replaceVideoTrack 後に simulcast の encodings が再適用されないのを修正する
    - @voluntas
  ```
- 本 issue は issue 0012 (`removeXxxTrack` reject 化)、issue 0014 (`setSenderParameters` 堅牢化) と関連する。マージ順は 0012 → 0014 → 0013 を推奨する。0012 / 0014 がまだマージされていない場合は本 issue 単独でも実装可能だが、テスト時に 0012 由来の「切断中 reject」挙動はカバーできない (`replaceXxxTrack` を切断中に呼ぶケースは 0012 マージ後に検証)

## 解決方法

`src/base.ts:569-577` の `replaceVideoTrack` を次の通り書き換える。

```ts
async replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void> {
  await this.removeVideoTrack(stream);
  const transceiver = this.getVideoTransceiver();
  if (transceiver === null) {
    throw new Error("Unable to set video track. Video track sender is undefined");
  }
  stream.addTrack(videoTrack);
  await transceiver.sender.replaceTrack(videoTrack);
  if (
    this.simulcast &&
    this.encodings.length > 0 &&
    transceiver.mid === this.mids.video
  ) {
    await this.setSenderParameters(transceiver, this.encodings);
  }
}
```

`replaceAudioTrack` (`src/base.ts:538-546`) は変更しない。`createAnswer` 経路 (`src/base.ts:1455, 1459`) で 2 回呼ぶ理由は `setRemoteDescription` 前後で `getParameters` の rid 配列が変わるためで、本 issue の `replaceVideoTrack` 経路では `setRemoteDescription` が走らないため 1 回呼べば十分。
