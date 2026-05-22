# stereo audio E2E が WebAudio analyser だけで判定し SDK の `stereo=1` ネゴ回帰を検知できない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-stereo-audio-test-regression

## 目的

`e2e-tests/fake_stereo_audio/main.ts` と `e2e-tests/fake_stereo_audio_sendrecv/main.ts` の `isStereo` 判定は `|leftFreq - rightFreq| > 50` を見るだけ (`main.ts:79-88` 周辺)。送信側がフェイクで左右別の波形を生成しているため、SDK の `forceStereoOutput` / `audioOpusParamsStereo` 実装が回帰して opus がモノラルダウンミックスされても、受信側の WebAudio analyser には左右別の信号 (フェイク生成由来) が見え続けて E2E は通る。ステレオ機能の唯一の E2E が事実上「フェイク送信側が左右別音を生成しているか」を検証しており、SDK の stereo ネゴ機能の有無は検証できていない。

`RTCRtpReceiver.getStats()` から opus codec の `channels` を取得して `2` を assert する、`pc.localDescription.sdp` の `a=fmtp:... stereo=1` を正規表現で assert する、の 2 つを追加する。

## 優先度根拠

High。リリース判定で「stereo がリリース時点で動いていた」と言える根拠が無い。SDK の stereo 関連オプション (`audioOpusParamsStereo` / `audioOpusParamsSpropStereo` / `forceStereoOutput` 系) の回帰を CI で検出できない。`createAnswer` 内の Chrome/Edge 向け `stereo=1` ハック (`src/base.ts:1469` 周辺) や Sora の SDP 出力変更で容易に壊れる。issue 0027 の `retries: 3` と 0028 のフェイク枯渇問題と組み合わさり、CI 信頼性の根幹が壊れている。

## 現状

`e2e-tests/fake_stereo_audio/main.ts:24-58`

```ts
private analyserLeft: AnalyserNode;
private analyserRight: AnalyserNode;
private channelCount: number;
// ...
this.channelCount = this.source.channelCount;
// ...
this.analyserLeft = this.audioContext.createAnalyser();
this.splitter.connect(this.analyserLeft, 0);
this.analyserRight = this.audioContext.createAnalyser();
if (this.channelCount >= 2) {
  this.splitter.connect(this.analyserRight, 1);
}
```

`this.source.channelCount` は `MediaStreamAudioSourceNode.channelCount` で、WebAudio AudioNode の **出力チャネル数のデフォルト値** (通常 `2`) を返す。実際の受信ストリームのチャネル数とは関係ない。仕様: [WebAudio API §1.8 AudioNode.channelCount](https://webaudio.github.io/web-audio-api/#dom-audionode-channelcount)。

`isStereo` 判定 (`main.ts:79-88` 周辺):

```ts
const leftFreq = this.detectDominantFrequency(this.analyserLeft);
const rightFreq =
  this.channelCount >= 2 ? this.detectDominantFrequency(this.analyserRight) : leftFreq;
// (|leftFreq - rightFreq| > 50 で stereo と判定)
```

`channelCount` が必ず `2` 以上を返すため、`analyserRight` を常に接続する経路に入る。`ChannelSplitter` の出力チャネル数が入力チャネル数より多い場合、余剰チャネルは無音化される ([WebAudio API §1.32 ChannelSplitterNode](https://webaudio.github.io/web-audio-api/#ChannelSplitterNode))。SDK の stereo ネゴが壊れて受信ストリームがモノラル (1ch) になっても、`analyserRight` は無音 (周波数取得不能 → `0` または `NaN` 系) を返す。`detectDominantFrequency` の実装によっては `leftFreq = 440`、`rightFreq = 0` で `|440 - 0| > 50` が `true` になり stereo 判定 → 誤って合格する。

`isStereo` の判定根拠 (`channelCount` の取り方) と、SDK の stereo ネゴ機能の関係が断絶している。

`e2e-tests/fake_stereo_audio_sendrecv/main.ts:80-88` も同じパターン。

## 完了条件

- E2E テスト (`e2e-tests/tests/stereo_audio.test.ts`、`stereo_audio_sendrecv.test.ts`) で次を追加で assert する
  1. `RTCRtpReceiver.getStats()` から取得した opus codec の `channels` が `2`
  2. `pc.localDescription.sdp` の opus 行に `a=fmtp:\d+\s[^\n]*stereo=1` が含まれる
  3. `pc.localDescription.sdp` の opus 行に `a=fmtp:\d+\s[^\n]*sprop-stereo=1` が含まれる (Sora の `audioOpusParamsSpropStereo` 設定が反映されることを確認)
- `e2e-tests/fake_stereo_audio/main.ts` の `channelCount` 取得を、`MediaStreamTrack.getSettings().channelCount` (W3C MediaStream Capture §4.5.4) または `MediaStreamAudioSourceNode` ではなく `MediaStreamTrack` 側のメタデータを使う形に変更する。`channelCount` がストリーム本来のチャネル数を反映するようにする
- `isStereo` 判定 (`|leftFreq - rightFreq| > 50`) は補助指標として残すが、E2E の合否判定は opus codec stats と SDP のアサーションに置く
- 動作確認: SDK の `audioOpusParamsStereo` を一時的に削除する、または `createAnswer` 内の `stereo=1` ハックを無効化するパッチを当てた状態で E2E を流し、本 issue 修正後は確実に fail することを確認する手順を `e2e-tests/fake_stereo_audio/README.md` (新規) に残す
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する

  ```
  ### misc

  - [FIX] stereo audio E2E が WebAudio analyser だけで判定して SDK の stereo ネゴ回帰を検知できなかったのを修正する。getStats() の opus codec.channels と SDP の stereo=1 / sprop-stereo=1 を assert するようにする
    - @voluntas
  ```

- 本 issue は issue 0027 (`retries` 削減)、0028 (fake track cleanup) と密接に関連する。マージ順は 0028 → 0027 → 0029 を推奨する。0028 で fake 枯渇問題が消えてから 0029 の真の判定を入れることで、stereo audio E2E の信頼性が回復する

## 解決方法

`e2e-tests/tests/stereo_audio.test.ts` (および `stereo_audio_sendrecv.test.ts`) に次の追加 assertion を入れる。

```ts
// (既存) connection を確立して #stereo-detected の状態を確認した後

const opusStats = await page.evaluate(async () => {
  const pc = (window as { soraPc?: RTCPeerConnection }).soraPc;
  if (!pc) {
    return null;
  }
  const stats = await pc.getStats();
  const codecs: Array<{ mimeType: string; channels?: number; payloadType: number }> = [];
  stats.forEach((stat) => {
    if (stat.type === "codec") {
      codecs.push({
        mimeType: stat.mimeType,
        channels: stat.channels,
        payloadType: stat.payloadType,
      });
    }
  });
  return codecs;
});

const opusCodec = opusStats?.find((c) => c.mimeType === "audio/opus");
expect(opusCodec).toBeDefined();
expect(opusCodec?.channels).toBe(2);

const sdp = await page.evaluate(() => {
  const pc = (window as { soraPc?: RTCPeerConnection }).soraPc;
  return pc?.localDescription?.sdp ?? "";
});
expect(sdp).toMatch(/a=fmtp:\d+\s[^\n]*stereo=1/);
expect(sdp).toMatch(/a=fmtp:\d+\s[^\n]*sprop-stereo=1/);
```

`window.soraPc` は本 issue が依拠する別の仕組み (`e2e-tests/fake_stereo_audio/main.ts` で `(window as any).soraPc = this.connection.pc` 等で露出) が必要。issue 0002 で同じ仕組みを使う方針が決まっているため、`main.ts` 側に露出処理を追加する。

`e2e-tests/fake_stereo_audio/main.ts:36` の `this.channelCount = this.source.channelCount;` を次の通り変更する。

```ts
const audioTrack = audioStream.getAudioTracks()[0];
const trackSettings = audioTrack?.getSettings();
this.channelCount = trackSettings?.channelCount ?? this.source.channelCount;
```

`MediaStreamTrack.getSettings().channelCount` (Capture §4.5.4 `MediaTrackSettings.channelCount`) はトラック本来のチャネル数を返す。トラックが取得できない場合のフォールバックとして `source.channelCount` を残す。

`e2e-tests/fake_stereo_audio_sendrecv/main.ts:80-88` も同じパターンで書き換える。

`isStereo` 判定の閾値 (`|leftFreq - rightFreq| > 50`) は補助メトリクスとしてそのまま残し、テスト本体の `expect` には `opusCodec.channels === 2` と SDP マッチを使う。
