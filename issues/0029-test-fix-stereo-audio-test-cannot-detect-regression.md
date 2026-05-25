# stereo audio E2E が WebAudio analyser だけで判定し SDK の `stereo=1` ネゴ回帰を検知できない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-stereo-audio-test-regression

## 必要性

**必要。** `e2e-tests/fake_stereo_audio/main.ts` の `isStereo` 判定は WebAudio analyser の周波数差のみ。送信側フェイクが左右別波形 (440 Hz / 660 Hz) を生成するため、SDK の stereo ネゴ (`audioOpusParamsStereo` / SDP `stereo=1`) が壊れても analyser ベース E2E は通りうる。stereo 機能の E2E が SDK ネゴを検証していない。

## 目的

`getStats()` の opus codec `channels` と SDP の `stereo=1` を assert し、SDK stereo ネゴの回帰を検知できるようにする。

## 優先度根拠

High。`src/base.ts:1469-1477` の Chrome / Edge 向け `addStereoToFmtp` ハックや Sora SDP 変更で容易に壊れる。現行テストでは検知不能。

## 現状

### 誤判定しうる analyser ロジック

`e2e-tests/fake_stereo_audio/main.ts:36` — `this.channelCount = this.source.channelCount` は WebAudio ノードのデフォルト (通常 `2`) で、受信ストリームの channel 数を反映しない。

`isStereo` (`:84-88`):

```ts
const isStereo =
  this.channelCount >= 2 && leftFreq > 0 && rightFreq > 0 && Math.abs(leftFreq - rightFreq) > 50;
```

右チャネル無音 (0 Hz) では false になる。**旧記載の「`|440-0|>50` で誤合格」は現行コードと矛盾** (0 Hz は `leftFreq > 0` / `rightFreq > 0` で弾かれる)。問題は analyser が pass しても SDP / codec が mono のまま、という別経路。

### テスト

`e2e-tests/tests/stereo_audio.test.ts` — `analysisData.*.isStereo` のみ assert。SDP / codec channels 未検証。

`e2e-tests/fake_stereo_audio/index.html:37-38` — `#force-stereo-output` は default checked。

### SDK 側

```ts
// src/base.ts:1475-1477
if (this.options.forceStereoOutput && sessionDescription.sdp) {
  sessionDescription.sdp = addStereoToFmtp(sessionDescription.sdp);
}
```

`addStereoToFmtp` (`src/utils.ts:583-587`) は recvonly active の audio fmtp に `stereo=1` を追加する。`sprop-stereo=1` は追加しない。

sendonly 側は `audioOpusParamsStereo` (`src/types.ts:385`) が signaling message の `audio.opus_params.stereo` に渡る (`src/utils.ts:277-278`)。

## 設計方針

### 1. fixture 変更 (`e2e-tests/fake_stereo_audio/main.ts`)

#### connect options

sendonly の `options` に `audioOpusParamsStereo: true` を明示する。未設定だと Sora answer SDP の `stereo=1` assert が環境依存で flaky になりうる。

```ts
private options: object = {
  connectionTimeout: 15_000,
  audioOpusParamsStereo: true,
};
```

#### PeerConnection 露出 (テスト専用)

```ts
declare global {
  interface Window {
    soraSendPc?: RTCPeerConnection | null;
    soraRecvPc?: RTCPeerConnection | null;
  }
}

// SoraSendClient.connect() 完了後
window.soraSendPc = this.connection.pc;

// SoraRecvClient.connect() 完了後
window.soraRecvPc = this.connection.pc;

// disconnect 時
window.soraSendPc = null;
window.soraRecvPc = null;
```

#### channelCount 修正

```ts
const audioTrack = audioStream.getAudioTracks()[0];
const trackSettings = audioTrack?.getSettings();
this.channelCount = trackSettings?.channelCount ?? this.source.channelCount;
```

#### get-stats 時の SDP / codec 露出

`#get-stats` クリック時に、テスト用 dataset へ codec stats と SDP を JSON 保存する (例: `#stereo-negotiation` dataset)。

### 2. SDP assert 対象 (ロール別)

| ロール                         | 検証する SDP                                          | 期待                                |
| ------------------------------ | ----------------------------------------------------- | ----------------------------------- |
| sendonly (publisher)           | `window.soraSendPc.remoteDescription` (type `answer`) | `stereo=1` を含む fmtp              |
| recvonly + `forceStereoOutput` | `window.soraRecvPc.localDescription` (type `answer`)  | `addStereoToFmtp` による `stereo=1` |

sendonly の `localDescription` は **offer** のため、answer 側 assert と混同しない。

### 3. codec stats assert

`page.evaluate` で stats JSON から `type === "codec"` かつ `mimeType` に `opus` を含む report を探し:

- stereo テスト: `channels === 2`
- mono テスト: `channels === 1` または stereo codec report が mono 相当

outbound-rtp / inbound-rtp の `bytesSent` assert は既存のまま維持。

### 4. テスト変更 (`e2e-tests/tests/stereo_audio.test.ts`)

- stereo テスト: SDP `stereo=1` + codec `channels === 2` を **主判定** にする
- `analysisData.*.isStereo` は補助指標として残す (削除しない)
- mono テスト: send answer SDP に `stereo=1` が **含まれない** こと、codec channels が 2 でないことを assert
- stereo テストでは `#force-stereo-output` を明示的に check する (HTML default に依存しない)

### 5. sendrecv fixture

`e2e-tests/fake_stereo_audio_sendrecv/main.ts` と `e2e-tests/tests/stereo_audio_sendrecv.test.ts` も同パターンで更新する (sendrecv は publisher / subscriber 両方で stereo ネゴが絡むため、本 issue スコープに含める)。

## 完了条件

### コード変更

- [ ] `fake_stereo_audio/main.ts` に `audioOpusParamsStereo: true`、PC 露出、channelCount 修正、negotiation dataset 出力を実装する
- [ ] `stereo_audio.test.ts` に SDP / codec assert を追加する (analyser assert は補助として維持)
- [ ] `fake_stereo_audio_sendrecv/main.ts` / `stereo_audio_sendrecv.test.ts` を同パターンで更新する
- [ ] mono テストで stereo SDP / codec が mono であることを assert する

### 検証

- [ ] `pnpm test` が通る
- [ ] `pnpm run lint` / `pnpm run typecheck` が通る
- [ ] ローカル: `pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts e2e-tests/tests/stereo_audio_sendrecv.test.ts` が通る
- [ ] 意図的 regression 確認 (任意): `audioOpusParamsStereo: true` を一時的に外す / `addStereoToFmtp` 呼び出しをコメントアウトし、stereo テストが fail することを確認して revert
- [ ] CI: e2e-test workflow が green であること (0027 マージ後なら flaky 検出も有効)

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` に追記する

  ```
  - [FIX] stereo audio E2E で opus codec channels と SDP stereo=1 を assert し SDK ネゴ回帰を検知できるようにする
    - @voluntas
  ```

## スコープ外

- SDK 本体 (`src/base.ts`, `src/utils.ts`) の stereo ロジック変更
- `audioOpusParamsSpropStereo` / SDP `sprop-stereo=1` の個別 assert (Sora answer 依存が強く、本 issue では `stereo=1` + codec channels を必須とする)
- fake media cleanup (issue 0028)
- `waitForTimeout` 置換 (issue 0032)
- npm pkg e2e (`npm-pkg-e2e-test.yml`) — 公開済み SDK version 固定のため本 issue では対象外

## マージ順

**0027 の後を推奨。** 0024–0026 (CI) → 0027 (flaky 検出) → 0028 (任意) → **0029**。0028 とは独立だが、0028 の `getFakeMedia` API 変更と同一 fixture を触るため、0028 → 0029 の順がコンフリクトが少ない。
