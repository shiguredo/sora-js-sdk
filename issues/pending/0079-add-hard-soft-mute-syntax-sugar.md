# ハードミュートとソフトミュートのシンタックスシュガー関数を追加する

- Priority: Medium
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/add-hard-soft-mute-syntax-sugar
- Polished: {YYYY-MM-DD}

## 目的

映像 / 音声のハードミュートとソフトミュートを SDK のシンタックスシュガー関数として提供し、利用者が `MediaStreamTrack.enabled` や `RTCRtpSender.replaceTrack(null)` を直接操作しなくてもミュートできるようにする。

Sora の他 SDK (例: sora-ios-sdk の `MediaChannel`) は `setAudioHardMute` / `setAudioSoftMute` / `setVideoHardMute` / `setVideoSoftMute` を提供している。JavaScript SDK にも同等の薄いラッパーを用意し、SDK 間でミュート操作の提供方法を揃える。

## 優先度根拠

Medium。接続の成否やメディアの送受信そのものには影響しない便利 API の追加であり、バグではない。ただし利用者に公開する API を増やす変更であり、後から名前や引数を変えにくいため、機能追加として優先的に方針を固めておく。

## 現状

### SDK にミュート用メソッドが無い

`src/base.ts` / `src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` にミュート用のメソッド・フィールドは無い (メソッド名・フィールド名に `mute` を含むものは無い)。公式 FAQ は「Sora JavaScript SDK はトラックのミュートは行いません。`MediaStreamTrack.enabled` を利用してミュートを行ってください」と案内しており、ミュート操作は利用者の責務になっている。

### 既存のトラック操作

`src/base.ts` のトラック操作は以下。

- `removeAudioTrack(stream)` / `removeVideoTrack(stream)`: 対象 track を `track.enabled = false` にした 100ms 後に `track.stop()` + `stream.removeTrack(track)` + `sender.replaceTrack(null)` する
- `replaceAudioTrack(stream, audioTrack)` / `replaceVideoTrack(stream, videoTrack)`: `remove*Track` の後に新しい track を `stream.addTrack` し、`transceiver.sender.replaceTrack(audioTrack)` する
- `stopAudioTrack(stream)` / `stopVideoTrack(stream)`: deprecated。それぞれ `removeAudioTrack` / `removeVideoTrack` を呼ぶ

送信トラックは `src/base.ts` の `stream` フィールドと `pc` フィールドから辿れる。`RTCRtpSender` を保持するフィールドは無く、`remove*Track` / `replace*Track` は毎回 `pc.getSenders()` から対象 sender を探している。

### ハードミュート / ソフトミュートの一般的な対応

- ソフトミュート: `MediaStreamTrack.enabled = false` により、無音 / 黒フレームを送信し続ける。トラックは存在し続ける
- ハードミュート: `RTCRtpSender.replaceTrack(null)` により送信を停止する。復帰時は `replaceTrack(元の track)` で戻す

## 設計方針

未確定。少なくとも以下を決める必要がある。

- ハードミュート / ソフトミュートの定義を上記の対応で確定するか。音声と映像で同じ扱いにするか
- API 名。他 Sora SDK と揃えて `setAudioHardMute` / `setAudioSoftMute` / `setVideoHardMute` / `setVideoSoftMute` にするか、JavaScript の WebRTC / MediaStream API に寄せて `enabled` ベースの名前 (`setAudioEnabled` など) にするか
- 引数の形。`stream` を渡すか、`boolean` で有効 / 無効を切り替えるか、audio / video を個別のメソッドに分けるか
- ハードミュートの復帰方法。`replaceTrack(null)` した元トラックを SDK が保持するか、利用者が改めて渡すか
- 冪等性。既にミュート済み / 解除済みの状態で再度呼んだときの挙動
- ハードミュート中に `replaceAudioTrack` / `replaceVideoTrack` / `removeAudioTrack` / `removeVideoTrack` を呼んだ場合の整合性
- 対象トラックが存在しない場合 (recvonly / messaging など) の挙動

方針が確定したら `src/base.ts` に実装し、`src/sora.ts` から必要に応じて型を export する。FAQ のミュートに関する記述も更新する。

## 完了条件

- ハードミュート / ソフトミュートの定義と API 名・シグネチャが決定していること
- 決定した API が `ConnectionBase` から利用できること
- ソフトミュート / ハードミュート / 復帰がテストで確認されていること
- `pnpm test` / `pnpm typecheck` / `pnpm lint` が通ること
- `CHANGES.md` の `## develop` に `[ADD]` エントリが追記されていること
- FAQ などミュート操作に触れているドキュメントが更新されていること

## pending にした理由

- **API 名が未確定**: Sora の他 SDK は `setAudioHardMute` 系だが、JavaScript SDK では WebRTC / MediaStream API (`MediaStreamTrack.enabled`) に寄せた名前も考えられる。利用者に公開する API を増やすため、どちらに寄せるかを決めるまで実装に着手しない
- **ハードミュート / ソフトミュートの定義と復帰方法が未確定**: ハードミュートで `replaceTrack(null)` した後に元トラックを SDK が保持するか、利用者が渡し直すかで API が変わる
- **元 issue (shiguredo/sora-oss-private#2433) が API 名の選択 (enabled か set か) を未解決のまま残している**

着手判断のトリガー:

- API 名 (Sora SDK 間で揃えるか JavaScript の WebRTC / MediaStream API に寄せるか) が決定した
- ハードミュート / ソフトミュートの定義、引数の形、復帰方法が決定した
