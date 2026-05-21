# `replaceAudioTrack` / `replaceVideoTrack` 後に simulcast 設定が失われる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-replace-track-loses-simulcast

## 目的

`replaceXxxTrack` で `removeXxxTrack` → `sender.replaceTrack(newTrack)` の流れで track を差し替えるが、`setSenderParameters` を呼び直さないため simulcast の `maxBitrate` / `scaleResolutionDownBy` / 各 rid の `active` が失われる。サイマルキャスト配信中にカメラ切替するとサイマルキャストが単一ストリームに退化する致命的不具合を修正する。

## 優先度根拠

High。spotlight / simulcast 配信中のカメラ切替で視聴者の体感品質が壊れる。Sora の `notify.spotlight_changed` も異常発火する。

## 現状

`src/base.ts:538-577`

```ts
async replaceVideoTrack(stream, videoTrack) {
  await this.removeVideoTrack(stream);
  const transceiver = this.getVideoTransceiver();
  if (transceiver === null) throw new Error(...);
  stream.addTrack(videoTrack);
  await transceiver.sender.replaceTrack(videoTrack);
}
```

`sender.replaceTrack(null)` → `replaceTrack(newTrack)` の流れで Chrome / Firefox では encodings の `active` / `rid` 一覧がリセットされる場合がある。`setSenderParameters` を再度呼んでいないため、初回 `createAnswer` で設定した `this.encodings` が反映されない。

## 設計方針

`replaceXxxTrack` の末尾で `this.encodings` を `setSenderParameters` で再適用する。簡単な追加だが、issue 0014 の `setSenderParameters` の堅牢化と合わせて対応するのが望ましい。

## 完了条件

- `replaceVideoTrack` 後も simulcast 設定（maxBitrate / scaleResolutionDownBy / rid / active）が維持される
- カメラ切替後に Sora 側で全 rid を観測できる E2E を追加

## 解決方法

```ts
async replaceVideoTrack(stream, videoTrack) {
  await this.removeVideoTrack(stream);
  const transceiver = this.getVideoTransceiver();
  if (transceiver === null) throw new Error(...);
  stream.addTrack(videoTrack);
  await transceiver.sender.replaceTrack(videoTrack);
  if (this.encodings.length > 0) {
    await this.setSenderParameters(transceiver, this.encodings);
  }
}
```

audio 側も同様の対応が必要なら同じパターンで適用する。
