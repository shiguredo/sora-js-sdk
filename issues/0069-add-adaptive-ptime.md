# adaptivePtime を SDK オプションで音声トラックに適用する

- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/add-adaptive-ptime
- Polished: {YYYY-MM-DD}

## 目的

音声送信の adaptivePtime（適応的パケット化時間）を SDK の設定で有効化できるようにする。

adaptivePtime は W3C の `RTCRtpEncodingParameters.adaptivePtime` に対応する音声向けパラメータで、ブラウザでは音声トラックにのみ効果がある。サイマルキャストの有無に関係なく、SDK の設定で音声トラックに適用できるようにする。

## 現状

- `src/types.ts` の `ConnectionOptions` に adaptivePtime を設定する項目がない
- `src/base.ts` は offer の `encodings` を `this.encodings` に保持し、simulcast 時に `createAnswer` から `setSenderParameters(videoTransceiver, this.encodings)` を呼んで video sender にそのまま設定している
- `adaptivePtime` が offer に含まれていても video sender に設定されるだけで、audio では実効しない
- `getAudioTransceiver()` が既にあり、audio transceiver を取得できる

## 設計方針

- `ConnectionOptions` に `adaptivePtime?: boolean` を追加する。デフォルトは false とし、後方互換を維持する
- `adaptivePtime` が true の場合、`getAudioTransceiver()` の sender の `getParameters()` の各 encoding に `adaptivePtime = true` を設定して `setParameters()` する。video sender への適用と同じく `await` する
- video transceiver に渡す offer の `encodings` から `adaptivePtime` を取り除く
- simulcast が無効でも、audio transceiver があれば `adaptivePtime` を適用する
- `adaptivePtime` を指定しない場合は従来どおりの挙動にする
- `CHANGES.md` の `## develop` に `[ADD]` エントリを追記する

## 完了条件

- `adaptivePtime: true` を指定すると audio sender の encoding の `adaptivePtime` が true になること
- video sender の encoding に `adaptivePtime` が設定されないこと
- `adaptivePtime` を指定しない場合は従来どおりの挙動になること
- `CHANGES.md` の `## develop` に `[ADD]` が追記されていること

## テスト方針

- `adaptivePtime` を true にした場合と未指定の場合で、audio sender の `RTCRtpParameters.encodings[].adaptivePtime` が変わることをテストで確認する
- 実際の `RTCRtpSender.getParameters()` を利用して適用結果を検証する
- `adaptivePtime` はブラウザ依存（Chrome のみ）のため、未対応ブラウザでは無視されることを前提とする
