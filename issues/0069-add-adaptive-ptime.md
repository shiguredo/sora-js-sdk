# adaptivePtime を SDK オプションで音声トラックに適用する

- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/add-adaptive-ptime
- Polished: 2026-09-16

## 目的

音声送信の adaptivePtime（適応的パケット化時間）を SDK の設定で有効化できるようにする。

adaptivePtime は W3C の WebRTC Extensions 仕様（https://w3c.github.io/webrtc-extensions/ の「RTCRtpEncodingParameters extensions」節）で `RTCRtpEncodingParameters` の拡張メンバとして定義されている音声向けパラメータで、音声のパケット化時間（フレーム長）をネットワーク状況に応じて動的に変更できるようにする。ブラウザでは音声トラックにのみ効果があり、サイマルキャストの有無に関係なく、SDK の設定で音声トラックに適用できるようにする。

注意点として、この拡張は webrtc-pc（W3C Recommendation）には含まれておらず、WebRTC Extensions の editor's draft にのみ存在する。実装は Chromium のみで、仕様も at-risk であり将来変更される可能性がある。

## 現状

- `src/types.ts` の `ConnectionOptions` に adaptivePtime を設定する項目がない
- `src/base.ts` は offer の `encodings`（サイマルキャスト用の video encodings）を `this.encodings` に保持し、simulcast 時に `createAnswer()` から `setSenderParameters(videoTransceiver, this.encodings)` を呼んで video sender にそのまま設定している
- `encodings` の型は audio / video で共通の `RTCRtpEncodingParameters[]` のため、仮に `adaptivePtime` が含まれていても video sender に設定されるだけで、audio では実効しない
- `getAudioTransceiver()` が既にあり、audio transceiver を取得できる

## 設計方針

- `ConnectionOptions` に `adaptivePtime?: boolean` を追加する。デフォルトは false とし、後方互換を維持する
- `adaptivePtime` が true の場合、`createAnswer()` 内（`setRemoteDescription()` 後、`pc.createAnswer()` 呼び出し前）で `getAudioTransceiver()` の sender の `getParameters()` の各 encoding に `adaptivePtime = true` を設定して `setParameters()` する。video sender への適用と同じく `await` する
- video sender には従来どおり offer の `encodings` をそのまま適用し、`adaptivePtime` の設定は audio sender にのみ行う（video へは波及させない）
- simulcast が無効でも、audio transceiver があれば適用する。audio transceiver が無い場合は何もしない
- `adaptivePtime` を指定しない場合は従来どおりの挙動にする
- `RTCRtpEncodingParameters` の標準型（lib.dom.d.ts）には `adaptivePtime` が存在しないため、型拡張（interface merging で `adaptivePtime?: boolean` を追加）を行うか、型付きの安全なキャストで扱う。`any` は使わない
- 実装時には AGENTS.md の規約に従い、WebRTC Extensions の仕様名・節番号と at-risk（将来変更される可能性）をコードコメントに明記する
- `CHANGES.md` の `## develop` に `[ADD]` エントリを追記する

## 完了条件

- `adaptivePtime: true` を指定すると audio sender の encoding の `adaptivePtime` が true になること
- video sender の encoding に `adaptivePtime` が設定されないこと
- `adaptivePtime` を指定しない場合は従来どおりの挙動になること
- `CHANGES.md` の `## develop` に `[ADD]` が追記されていること

## テスト方針

- 実際の `RTCRtpSender.getParameters()` を利用して適用結果を検証するため、実ブラウザが必要。モック・スタブは利用しないため、e2e-tests（Playwright + Chromium）で検証する
- `adaptivePtime` を true にした場合と未指定の場合で、audio sender の `RTCRtpParameters.encodings[].adaptivePtime` が変わることをテストで確認する
- `adaptivePtime` は実装が Chromium のみのため、未対応ブラウザでは無視されることを前提とし、Firefox / WebKit のテストには組み込まない
