# stereo audio E2E が WebAudio analyser だけで判定し SDK の `stereo=1` ネゴ破壊を検知できない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-stereo-audio-test-regression

## 目的

`fake_stereo_audio` の `isStereo` 判定は `|leftFreq - rightFreq| > 50` のみ。送信側がフェイクで左右に違う波形を生成しているため、SDK の `forceStereoOutput` 実装に回帰が入って opus がモノラルダウンミックスしても、`analyserLeft` / `analyserRight` には左右別の信号が見えてしまい合格する。ステレオ機能の唯一の E2E が事実上「機能の有無」を検証していない。

## 優先度根拠

High。stereo 機能の回帰が検出できないため、リリース判定の根拠が崩壊している。

## 現状

`e2e-tests/fake_stereo_audio/main.ts:80-88` および `e2e-tests/fake_stereo_audio_sendrecv/main.ts:80-88`

```ts
const rightFreq =
  this.channelCount >= 2 ? this.detectDominantFrequency(this.analyserRight) : leftFreq;
```

`this.channelCount` は `MediaStreamAudioSourceNode.channelCount` で、これは WebAudio の入力チャネル数のデフォルト値であり実際のストリームのチャネル数ではない。ChannelSplitter が入力チャネル数より多い出力を要求すると残り出力は無音化される。

`isStereo` 判定がフェイク送信側で生成した左右別波形だけに依存しており、SDP `a=fmtp:... stereo=1` のネゴが壊れても合格する。

## 設計方針

1. `RTCRtpReceiver.getStats()` から opus codec の `channels` を取得し真のチャネル数として検証
2. SDP answer の `a=fmtp:... stereo=1` を E2E でアサート
3. `channelCount` を `MediaStreamTrack.getSettings().channelCount` に置き換える

## 完了条件

- SDK の `stereo=1` ネゴが壊れた状態で stereo audio E2E が確実に fail する
- opus codec の `channels` 値を assert する
- SDP answer の `a=fmtp:...stereo=1` を assert する

## 解決方法

E2E 内で:

```ts
const stats = await page.evaluate(async () => {
  const stats = await window.connection.getStats();
  return stats.filter((s) => s.type === "codec");
});
const opusCodec = stats.find((s) => s.mimeType === "audio/opus");
expect(opusCodec.channels).toBe(2);
```

SDP の assert:

```ts
const sdp = await page.evaluate(() => window.connection.pc.localDescription.sdp);
expect(sdp).toMatch(/a=fmtp:\d+\s[^\n]*stereo=1/);
```

`main.ts:80-88` の判定ロジックは「補助」に格下げし、E2E の合否判定はネットワーク経由の opus codec stats と SDP に置く。
