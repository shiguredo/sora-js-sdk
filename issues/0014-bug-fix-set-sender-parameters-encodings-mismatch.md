# `setSenderParameters` で encodings 配列の length / rid 不一致による `InvalidModificationError` を防ぐ

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-set-sender-parameters-encodings

## 目的

`setSenderParameters` (`src/base.ts:2085-2094`) は `originalParameters.encodings = encodings;` で引数の encodings 配列を sender の `getParameters` 結果の `encodings` に丸ごと代入してから `setParameters` する。W3C WebRTC 1.0 §5.2 の `setParameters` algorithm は、`encodings` 配列の `length` / 順序 / 各エントリの `rid` を `getParameters` から変更すると `InvalidModificationError` で reject すると規定しており、Chrome / Firefox / Safari いずれも準拠する。`createAnswer` 内 (`src/base.ts:1455, 1459`) で `setRemoteDescription` 前後に 2 回呼ばれる経路で、間に sender の encodings 状態が変わると length 不一致で reject し、`createAnswer` が reject、`multiStream` が reject、接続が落ちる。

本 issue は `setSenderParameters` を「`getParameters` 結果の rid 配列を骨格として、引数の encodings に同じ rid があれば `active` / `maxBitrate` / `scaleResolutionDownBy` 等を上書きする」length 不変マージに書き換える。`rid` 集合自体が変わる Sora の再ネゴ仕様は現時点で存在しないため、本 issue では length 変更を扱わない。

## 優先度根拠

Medium。本番観測ログは未取得。Sora 側で動的に rid 集合が変わる仕様は現時点で存在しないが、`createAnswer` 内で setRemoteDescription を挟んで 2 回呼ぶ仕組み (`src/base.ts:1455-1459` の既存コメント「setRemoteDescription 後でないと active が反映されないのでもう一度呼ぶ」) はブラウザ側 sender 状態の遷移に依存しており、ブラウザバージョン差や Sora の simulcast 拡張で length / rid 不一致を踏むリスクが残る。defensive な堅牢化として `InvalidModificationError` を起こさない実装に整える。

## 現状

`src/base.ts:2085-2094`

```ts
private async setSenderParameters(
  transceiver: RTCRtpTransceiver,
  encodings: RTCRtpEncodingParameters[],
): Promise<void> {
  const originalParameters = transceiver.sender.getParameters();
  originalParameters.encodings = encodings;
  await transceiver.sender.setParameters(originalParameters);
  this.trace("TRANSCEIVER SENDER SET_PARAMETERS", originalParameters);
  this.writePeerConnectionTimelineLog("transceiver-sender-set-parameters", originalParameters);
}
```

問題:

1. `originalParameters.encodings = encodings;` で引数の配列を丸ごと代入するため、`getParameters` 結果の `encodings.length` と `encodings.length` がずれると `setParameters` が `InvalidModificationError` で reject する
2. 引数 `encodings` の rid 順序が `getParameters` 結果と異なると同じく `InvalidModificationError`
3. 引数 `encodings` に `rid` を持たないエントリが含まれると `InvalidModificationError`

呼び出し元:

- `createAnswer` (`src/base.ts:1455, 1459`): `setRemoteDescription` 前後で 2 回呼ぶ。1 回目と 2 回目の間で `getParameters` 結果が変わる可能性がある
- `replaceVideoTrack` (issue 0013 で追加): `replaceTrack` 直後に 1 回呼ぶ

`this.encodings` は `signalingOnMessageTypeOffer` (`src/base.ts:1891-1893`) で Sora から送られた `message.encodings` を Array なら代入する。Sora の現行仕様では `r0` / `r1` / `r2` 固定で動的に rid 集合が変わるシナリオは確認できていない。Sora が空配列を送る仕様も確認できていない。空配列ガードは issue 0013 の呼び出し側 (`this.simulcast && this.encodings.length > 0`) で行うため、本 issue の `setSenderParameters` 内には入れない。

## 完了条件

- `setSenderParameters` (`src/base.ts:2085-2094`) を「`getParameters` 結果の `encodings` を骨格として、引数 `encodings` から `rid` が一致するエントリのプロパティで上書きする」length 不変マージに書き換える
- 引数 `encodings` にしか存在しない rid (新規 rid) は無視する。本 issue は length 変更を扱わないため、新規 rid を追加するには別途再ネゴ (`negotiationneeded` 経由) が必要だが、それは別 issue で扱う
- 引数 `encodings` から削除された rid (既存 rid のみ存在) は `originalParameters.encodings` 側の値をそのまま保持する
- `setParameters` で `InvalidModificationError` が出た場合、catch して `this.trace("SET_SENDER_PARAMETERS_FAILED", ...)` と `writePeerConnectionTimelineLog("set-sender-parameters-failed", ...)` でログを残し、上位に throw して接続失敗フローに乗せる。length 不変マージの後でもブラウザ側で reject される場合は SDK 側の前提が崩れているため握り潰さない
- 検証は `e2e-tests/simulcast_sendonly/main.ts` に「現在の simulcast 接続で `setSenderParameters` を意図的に length 1 の encodings で呼ぶ」テスト用ボタン (`#test-set-sender-parameters-mismatch`) を追加し、新規テスト `e2e-tests/tests/set_sender_parameters.test.ts` で「length 1 の encodings を渡しても接続が落ちず、既存の r0/r1/r2 encodings が保持される」ことを assert する。`pc.getStats()` で `outbound-rtp` が 3 本観測できることも合わせて確認
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] setSenderParameters で encodings の length / rid 不一致が起きた際に length 不変マージで InvalidModificationError を回避する
    - @voluntas
  ```
- 本 issue は issue 0013 (`replaceVideoTrack` の `setSenderParameters` 再適用) と相互依存。マージ順は 0014 → 0013 を推奨する。0014 が `setSenderParameters` 内で length 不変マージするようになると、0013 の呼び出しは「`active` / `maxBitrate` の再適用」として安全に動作する。0013 が先にマージされても本 issue で `setSenderParameters` を堅牢化することで問題が悪化することはない

## 解決方法

`src/base.ts:2085-2094` の `setSenderParameters` を次の通り書き換える。

```ts
private async setSenderParameters(
  transceiver: RTCRtpTransceiver,
  encodings: RTCRtpEncodingParameters[],
): Promise<void> {
  const originalParameters = transceiver.sender.getParameters();
  // W3C WebRTC 1.0 §5.2 setParameters algorithm により encodings 配列の length / 順序 / rid は変更不可。
  // getParameters の結果の rid 配列を骨格として、引数 encodings に同じ rid があれば
  // active / maxBitrate / scaleResolutionDownBy などのプロパティで上書きする。
  // 引数 encodings にしかない rid (新規 rid) は本メソッドでは追加できない (要再ネゴ)。
  const mergedEncodings = originalParameters.encodings.map((existing) => {
    const update = encodings.find((e) => e.rid === existing.rid);
    return update ? { ...existing, ...update } : existing;
  });
  originalParameters.encodings = mergedEncodings;
  try {
    await transceiver.sender.setParameters(originalParameters);
  } catch (e) {
    this.trace("SET_SENDER_PARAMETERS_FAILED", String(e));
    this.writePeerConnectionTimelineLog("set-sender-parameters-failed", {
      reason: String(e),
    });
    throw e;
  }
  this.trace("TRANSCEIVER SENDER SET_PARAMETERS", originalParameters);
  this.writePeerConnectionTimelineLog("transceiver-sender-set-parameters", originalParameters);
}
```

`InvalidModificationError` の retry は実施しない。W3C §5.2 algorithm に従って `getParameters` を再取得しても、同じ理由 (length 不一致) で再度失敗するため retry に意味がない。catch 内ではログを残して上位に throw し、`createAnswer` の reject 経路に乗せる。

`encodings.length === 0` の早期 return は本メソッドには入れない。空配列ガードは呼び出し側 (issue 0013 で `this.encodings.length > 0` をガードしている `replaceVideoTrack` など) で行う。
