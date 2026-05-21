# `processOfferSdp` の Firefox 用 `m=... 0 ...` → `m=... 9 ...` 書き換えがセッション拒否表明を破壊する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-process-offer-sdp-port-zero

## 目的

`processOfferSdp` の Firefox 対応として `m=(audio|video) 0` を `m=(audio|video) 9` に機械的に書き換えているが、RFC 3264 で `m=<media> 0 ...` は「この m-section は使われない」という意味のある宣言である。区別なしに 9 に書き換えると Firefox は「アクティブだが c-line も rtpmap も整っていない」 m-section に answer を返してしまい、BUNDLE / mid 整合性が壊れる。

## 優先度根拠

High。Firefox publisher の再ネゴ（track の追加/削除）で SDP 不整合が起き、Sora 側で SDP 解析エラー or 接続強制切断。

## 現状

`src/base.ts:1498` 周辺

```ts
if (isFirefox()) {
  sdp = sdp.replaceAll(/^m=(audio|video) 0 /gm, (_match, kind: string) => `m=${kind} 9 `);
}
```

`m=audio 0 ...` / `m=video 0 ...` を全て 9 に書き換える。Sora が「同じ mid を別 transceiver に再利用するときに port=0 を出してくる」という事情にだけ対応した実装だが、本来「セッション拒否したい port=0」も同時に書き換えてしまう。`m=application 0 ...` のような application プロトコルも `audio|video` フィルタで取りこぼし、整合性チェックが不十分。

## 設計方針

書き換える前に「同一 mid が別 m-section で再利用されているか」をパースして判定する。少なくとも書き換え対象を、対応する `a=mid:` が直近の offer で既に使われていたケースに限定する。

## 完了条件

- 「セッション拒否表明」の port=0 m-section が書き換えられない
- Firefox の mid 再利用ケースで従来通り動作する E2E

## 解決方法

SDP を行単位でパースし、`a=mid:<value>` を持ち、かつ前回 offer の同じ mid が `m=<kind> <port>` で port>0 を持っていた m-section だけを書き換える。または Firefox バージョン判定で書き換えそのものを廃止できる時期を見極める。
