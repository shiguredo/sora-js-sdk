# `onDataChannel` で同名 label の DC を無条件に上書きし旧 DC がゾンビ化する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-ondatachannel-same-label-overwrite

## 目的

`onDataChannel` 内で `this.soraDataChannels[dataChannel.label]` に新しい DC を無条件に代入しているため、再ネゴで同名 DC が再生成された際に旧 DC の close / ハンドラ解除が漏れ、旧 DC からの `onerror` で `abend` が誤発火して接続が強制切断される。

## 優先度根拠

High。redirect / re-offer 時の挙動を直接壊し、リダイレクト先での運用が機能しなくなる。

## 現状

`src/base.ts:2121`

```ts
this.soraDataChannels[dataChannel.label] = dataChannel;
```

既存 channel が存在しても close せず・ハンドラを null 化せず上書きする。

旧 DC は GC されるまでハンドラ生存。古い DC の `onerror` (`:2151-2158`) は `this.abend("DATA-CHANNEL-ONERROR")` を呼ぶように設定されているため、新しい接続が確立している最中に旧 DC のエラーで abend が走る。`onclose` (`:2144-2149`) も `await this.disconnect()` を呼ぶ。

## 設計方針

代入前に既存 DC があれば close & ハンドラ null 化を行う。または `onDataChannel` の呼び出しタイミングを `signalingSwitched === false` に限定する。

## 完了条件

- 同名 label の DC が再ネゴで来た場合、旧 DC が確実に close され、旧 DC のハンドラから abend / disconnect が誤発火しない
- redirect 後の運用で SDK が誤切断しない E2E を追加

## 解決方法

`src/base.ts:2121` の前に次の処理を追加する。

```ts
const existing = this.soraDataChannels[dataChannel.label];
if (existing) {
  existing.onclose = null;
  existing.onerror = null;
  existing.onmessage = null;
  existing.onopen = null;
  existing.onbufferedamountlow = null;
  if (existing.readyState !== "closed" && existing.readyState !== "closing") {
    existing.close();
  }
}
this.soraDataChannels[dataChannel.label] = dataChannel;
```
