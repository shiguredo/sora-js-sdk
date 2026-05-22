# `messaging()` が呼び出し側の `options` を破壊し他 Connection の `this.options` まで壊す

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-messaging-mutates-shared-options

## 目的

`Sora.connection().messaging()` (`src/sora.ts:210-227`) は引数 `options` に対して `options.audio = false; options.video = false; options.dataChannelSignaling = true;` で **呼び出し側のオブジェクトそのものを破壊** する (`src/sora.ts:215-217`)。さらに `ConnectionBase` constructor が `this.options = options` (`src/base.ts:266`) で浅コピーすらしていないため、同一 `opts` を `sendrecv()` と `messaging()` の両方に渡すと、後から呼んだ `messaging()` が先に作った `sendrecv()` (の `this.options`) まで書き換える。

`messaging()` 内で `options` を spread copy してから書き換えるようにし、`ConnectionBase` constructor でも `this.options = { ...options }` で浅コピーを取って外部参照を切り離す。

## 優先度根拠

High。SDK の公式パターン (`Sora.connection(url).sendrecv("ch", null, opts)` と `Sora.connection(url).messaging("ch", null, opts)` を同じ `opts` で生成する) で破壊される。SDK 利用者は「不変オブジェクトを渡したつもり」が壊されるため、原因特定が極めて困難。

## 現状

`src/sora.ts:210-227`

```ts
messaging(
  channelId: string,
  metadata: JSONType = null,
  options: ConnectionOptions = { audio: false, video: false },
): ConnectionMessaging {
  options.audio = false;
  options.video = false;
  options.dataChannelSignaling = true;
  return new ConnectionMessaging(
    this.signalingUrlCandidates,
    "sendonly",
    channelId,
    metadata,
    options,
    this.debug,
  );
}
```

`options.audio` / `options.video` / `options.dataChannelSignaling` の代入は引数オブジェクトに直接書き込む。呼び出し側が `const opts = { ...baseOptions }` で渡したとしても、`baseOptions` 自体ではなくとも `opts` は呼び出し側に残っており、`opts.audio` / `opts.video` / `opts.dataChannelSignaling` が書き換わる。

`sendrecv` (`src/sora.ts:110-123`)、`sendonly` (`src/sora.ts:142-155`)、`recvonly` (`src/sora.ts:174-187`) は `options` を mutate しないが、`ConnectionMessaging` も含めて `ConnectionBase` constructor が `this.options = options` (`src/base.ts:266`) で参照保持しているため、

- `const opts = { audio: true, video: true };`
- `connection.sendrecv("ch", null, opts);` → `ConnectionPublisher.this.options === opts`
- `connection.messaging("ch", null, opts);` → `messaging()` で `opts.audio = false` etc → 既存の `ConnectionPublisher.this.options` も書き換わる

という連鎖が起きる。`sendrecv` 側だけ見ても、呼び出し後にアプリ側で `opts.someProp = "x"` を変更すれば `ConnectionPublisher.this.options` にも影響する。

deep clone は不要。`options` の値型 (`ConnectionOptions`) はネスト構造を持つプロパティ (`audioOpusParams*` 系、`forwardingFilter` / `forwardingFilters` の object 配列) もあるが、本 issue が解決したいのは「`messaging` の audio/video/dataChannelSignaling フラグ上書きが呼び出し側まで届く」現象と「`this.options` が外部参照を保持する」現象で、いずれも shallow copy で防げる。ネスト構造の deep mutation を SDK 内で起こすケースは現状コードを `grep` した範囲では確認できない。

## 完了条件

- `src/sora.ts:215-217` の `options.audio = false; options.video = false; options.dataChannelSignaling = true;` を、`options` を spread した新オブジェクト (`merged`) に対する代入に置き換える
- `ConnectionMessaging` のコンストラクタ呼び出し (`src/sora.ts:218-226`) には `merged` を渡す
- `src/base.ts:266` の `this.options = options;` を `this.options = { ...options };` に変更する
- `sendrecv` / `sendonly` / `recvonly` は呼び出し側 mutation を起こさないが、`ConnectionBase` 側の shallow copy で外部参照は切り離される
- 単体テストを `tests/utils.test.ts` (もしくは `tests/sora.test.ts` を新規作成) に追加し、次を assert する
  - `const opts = { audio: true, video: true };` を `connection.messaging("ch", null, opts)` に渡した後、`opts.audio === true` / `opts.video === true` / `opts.dataChannelSignaling === undefined` のまま (= 呼び出し側オブジェクトが破壊されていない)
  - 同じ `opts` を `connection.sendrecv("ch", null, opts)` と `connection.messaging("ch", null, opts)` に渡した後、`sendrecv` 側で取得できる SDK 内 options (グローバルからアクセスできる経路がないなら hidden DOM 経由などのテストフックを足すか、`connection.messaging` を呼んだ後の `opts` 自体が破壊されていないことのみ assert する)
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] messaging() が呼び出し側の options を破壊しないように修正する
  - [FIX] ConnectionBase で options を shallow copy して外部参照を切り離す
    - @voluntas
  ```
  (担当者行は両エントリに対して 1 行で足りる)
- 本 issue は SDK の他 issue とのマージ衝突はない。`src/sora.ts:215-217` および `src/base.ts:266` は他 issue で触られていない

## 解決方法

`src/sora.ts:210-227` を次の通り書き換える。

```ts
messaging(
  channelId: string,
  metadata: JSONType = null,
  options: ConnectionOptions = { audio: false, video: false },
): ConnectionMessaging {
  const merged: ConnectionOptions = {
    ...options,
    audio: false,
    video: false,
    dataChannelSignaling: true,
  };
  return new ConnectionMessaging(
    this.signalingUrlCandidates,
    // messaging は role sendonly として扱う
    "sendonly",
    channelId,
    metadata,
    merged,
    this.debug,
  );
}
```

`src/base.ts:266` を次の通り書き換える。

```ts
this.options = { ...options };
```

`tests/utils.test.ts` または新規 `tests/sora.test.ts` に次のテストを追加する。

```ts
test("messaging() が呼び出し側の options を破壊しない", () => {
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  connection.messaging("ch", null, opts);
  expect(opts.audio).toBe(true);
  expect(opts.video).toBe(true);
  expect(opts.dataChannelSignaling).toBeUndefined();
});
```

`Sora.connection` の URL は実際の接続に使われないため `ws://example.invalid/...` でよい (テストは options 破壊の有無のみを見る)。
