# `messaging()` が呼び出し側の `options` を破壊し他 ConnectionXxx の `this.options` まで壊す

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-messaging-mutates-shared-options

## 目的

`Sora.connection().messaging()` は `options.audio = false; options.video = false; options.dataChannelSignaling = true;` で **呼び出し側のオブジェクトそのものを破壊** する。さらに `ConnectionBase` の constructor が `this.options = options` で浅コピーすらしていないため、同一 `opts` を `sendrecv()` と `messaging()` 両方に渡すと、後から呼んだ `messaging()` が先に作った `sendrecv()` の `this.options` まで書き換える。

## 優先度根拠

High。複数ロールを 1 つの `Sora.connection()` から生成する公式パターンで発火する。SDK 利用者は「不変オブジェクトを渡したつもり」が壊されるため、原因特定が極めて困難。

## 現状

`src/sora.ts:215-219`

```ts
messaging(channelId, metadata, options = { audio: false, video: false }): ConnectionMessaging {
  options.audio = false;
  options.video = false;
  options.dataChannelSignaling = true;
  ...
}
```

`src/base.ts:266`

```ts
this.options = options;
```

浅コピーすらしていないため、外部の同一参照が共有される。

## 設計方針

`messaging()` 内で options を spread コピーしてから書き換える。加えて `ConnectionBase` の constructor で `this.options = { ...options }` の二段防御を追加する。

## 完了条件

- 同一 `opts` を複数のロールに渡しても他 Connection の `this.options` が壊れない
- `messaging()` 呼び出し後、呼び出し側の `opts` が変更されていない
- 単体テストで mutation の不在を確認

## 解決方法

`src/sora.ts:215-219`:

```ts
messaging(channelId, metadata, options = { audio: false, video: false }): ConnectionMessaging {
  const merged = {
    ...options,
    audio: false,
    video: false,
    dataChannelSignaling: true,
  };
  return new ConnectionMessaging(
    this.signalingUrlCandidates,
    "sendonly",
    channelId,
    metadata,
    merged,
    this.debug,
  );
}
```

`src/base.ts:266`:

```ts
this.options = { ...options };
```

`sendrecv` / `sendonly` / `recvonly` も同じ二段防御を入れる。
