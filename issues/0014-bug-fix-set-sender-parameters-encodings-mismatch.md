# `setSenderParameters` で encodings 数の不一致による `InvalidModificationError`

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-set-sender-parameters-encodings

## 目的

`setSenderParameters` は `originalParameters.encodings = encodings` で代入してから `setParameters` を呼ぶが、Chrome は `getParameters().encodings.length === new encodings.length` を厳密要求する。re-offer で `encodings` の `rid` 集合が変わると `InvalidModificationError` を投げ、`createAnswer` が reject、`multiStream` 失敗、接続切断につながる致命的経路を修正する。

## 優先度根拠

High。simulcast / spotlight の rid 構成が動的に変わる Sora 構成で発火する。catch 不在のため接続が落ちる。

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
  ...
}
```

呼び元 `createAnswer` (`:1455`, `:1459`) で 2 回連続呼ぶケースもあり、between で `getParameters` の `transactionId` が変わると `InvalidModificationError` が出る。

## 設計方針

既存 encodings の rid 集合と新 encodings をマージし、length を保ったまま `active` や `maxBitrate` だけを上書きする。空配列が来た場合は早期 return。`InvalidModificationError` は局所的に catch して retry する。

## 完了条件

- re-offer で rid 集合が変わっても接続が落ちない
- `encodings.length === 0` の場合は何もせず return
- `InvalidModificationError` を catch して 1 回 retry

## 解決方法

```ts
private async setSenderParameters(
  transceiver: RTCRtpTransceiver,
  encodings: RTCRtpEncodingParameters[],
): Promise<void> {
  if (encodings.length === 0) {
    return;
  }
  const originalParameters = transceiver.sender.getParameters();
  // rid をキーにマージ
  const merged = originalParameters.encodings.map((existing) => {
    const update = encodings.find((e) => e.rid === existing.rid);
    return update ? { ...existing, ...update } : existing;
  });
  originalParameters.encodings = merged;
  try {
    await transceiver.sender.setParameters(originalParameters);
  } catch (e) {
    if (e instanceof Error && e.name === "InvalidModificationError") {
      // retry once with fresh parameters
      const fresh = transceiver.sender.getParameters();
      fresh.encodings = merged;
      await transceiver.sender.setParameters(fresh);
    } else {
      throw e;
    }
  }
}
```
