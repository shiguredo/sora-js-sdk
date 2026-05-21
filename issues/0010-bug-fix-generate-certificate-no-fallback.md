# `generateCertificate` 失敗時に fallback がなく接続不可になる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-generate-certificate-fallback

## 目的

`connectPeerConnection` で `RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" })` を try/catch なしで呼ぶ。FIPS モードの Chromium / 企業 PC で `NotSupportedError` が返り、接続自体が立ち上がらない。証明書なしでフォールバックして接続できるようにする。

## 優先度根拠

High。FIPS モード環境ユーザーが Sora に繋げない致命的な機能停止。

## 現状

`src/base.ts:1343-1351`

```ts
protected async connectPeerConnection(message: SignalingOfferMessage): Promise<void> {
  let config = { ...message.config };
  if (window.RTCPeerConnection.generateCertificate !== undefined) {
    const certificate = await window.RTCPeerConnection.generateCertificate({
      name: "ECDSA",
      namedCurve: "P-256",
    });
    config = { certificates: [certificate], ...config };
  }
  ...
  this.pc = new window.RTCPeerConnection(config, this.constraints);
}
```

`generateCertificate` の `await` に try/catch なし。失敗すると `connectPeerConnection` が reject、`multiStream` も reject、`connect()` が失敗する。

加えて `src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` は `Algorithm` 型全体を汚染している。`EcKeyGenParams` を使うべき。

## 設計方針

`generateCertificate` を try/catch で囲み、失敗時は証明書なしで `RTCPeerConnection` を立ち上げる。ブラウザが自前で生成する証明書で動作する。`Algorithm` 拡張は削除して `EcKeyGenParams` 型を import する。

## 完了条件

- `generateCertificate` が失敗しても `connect()` が成立する
- `Algorithm` 型のグローバル拡張が削除され `EcKeyGenParams` が使われる

## 解決方法

```ts
let config = { ...message.config };
if (window.RTCPeerConnection.generateCertificate !== undefined) {
  try {
    const certificate = await window.RTCPeerConnection.generateCertificate({
      name: "ECDSA",
      namedCurve: "P-256",
    } as EcKeyGenParams);
    config = { certificates: [certificate], ...config };
  } catch (e) {
    this.trace("GENERATE-CERTIFICATE-FAILED", String(e));
  }
}
```

`src/base.ts:80-84` の `Algorithm` 拡張を削除する。
