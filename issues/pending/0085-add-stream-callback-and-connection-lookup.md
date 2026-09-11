# `on("stream")` コールバックと connection_id から Stream / Track / Metadata を引く仕組みを追加する

- Priority: Medium
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/add-stream-callback-and-connection-lookup
- Polished: {YYYY-MM-DD}

## 目的

`ontrack` のラッパーである `track` コールバックとは別に、1 つのリモート MediaStream につき 1 回だけ発火する `stream` コールバックを追加する。あわせて、`connection_id` / `client_id` をキーに Stream / Track / Metadata を引ける仕組みを追加する。

`track` コールバックは音声と映像で 2 回発火し、発火時点では signaling notify を受け取っていないため、そのストリームの `connection_id` しか分からない。`connection_id` だけでは表示名などのメタデータを出せず、映像が出た後に情報を反映するしかない。ストリーム単位でメタデータをまとめて受け取れるようにする。

## 優先度根拠

Medium。接続やメディアの送受信自体には影響しないが、マルチストリームで受信した各ストリームを `connection_id` / `client_id` / metadata と対応付けるのはアプリケーション実装で頻出の要求であり、SDK が仕組みを提供する価値が高い。既存 callback の追加であり後方互換は保てる。

## 現状

### track コールバックの制約

- `src/publisher.ts` / `src/subscriber.ts` の `pc.ontrack` は `callbacks.track` を呼ぶ。`RTCTrackEvent` を渡すため、音声・映像で 2 回発火する
- `ontrack` は signaling notify (`type: notify`) より先に発火することがあり、`track` コールバック時点では `SignalingNotifyConnectionCreated` などのメタデータが揃っていない場合がある
- `src/base.ts` の `signalingOnMessageTypeNotify` は `callbacks.notify` に `SignalingNotifyMessage` を渡す。`connection.created` などの `metadata` / `metadata_list` / `connection_id` / `client_id` はここで取得できる
- `src/base.ts` に `remoteConnectionIds` はあるが、`connection_id` から `MediaStream` や `SignalingNotifyMetadata` を引くテーブルは無い
- `ConnectionBase` に `getStreams()` のような参照 API は無い

### 元 issue のイメージ

- `.on("stream", ...)` は 1 ストリームにつき 1 回発火する。`SoraMediaStreamEvent` に `bundleId` / `clientId` / `connectionId` / `timestamp` / `metadata` と `MediaStream` を含める
- `connection_id` / `client_id` で引っ張れるテーブルを作る (例: `sendrecv.getStreams(): Record<ConnectionId, MediaStream>`)

## 設計方針

未確定。少なくとも以下を決める必要がある。

- `stream` コールバックを追加するか、既存の `track` / `notify` の組み合わせで足りるか
- `SoraMediaStreamEvent` 相当の型に何を含めるか (`MediaStream`、`connectionId`、`clientId`、`bundleId`、`timestamp`、`metadata` など)
- `stream` コールバックの発火条件。signaling notify を先に受信してから発火させるか、`ontrack` と notify のどちらを待つか (元 issue は「signaling notify を受け取った時初めてコールバックする」としている)
- `connection_id` / `client_id` から Stream / Track / Metadata を引く API の形 (`getStreams()` / `getTracks()` / `getMetadata()` など) と、リモート側か自ストリームも含めるか
- `removetrack` 時のテーブルからの削除と、同一 `connection_id` の再接続時の上書き
- notify の `metadata_list` / `data` をどう正規化して保持するか

## 完了条件

- 1 ストリームにつき 1 回発火するコールバック (または同等の参照 API) が追加されていること
- `connection_id` / `client_id` から Stream / Track / Metadata を取得できること
- notify のメタデータとトラックの対応付けがテストで確認されていること
- `pnpm test` / `pnpm typecheck` / `pnpm lint` が通ること
- `CHANGES.md` の `## develop` に `[ADD]` エントリが追記されていること

## pending にした理由

- **API の形が未確定**: `stream` コールバックの型と発火条件、参照 API の名前・戻り値が決まっていない
- **`ontrack` と signaling notify の順序依存の解決方法が未確定**: notify が `ontrack` より後に来る場合にどう情報を反映するか (後から埋める / notify を待って発火する) の設計が必要
- **元 issue が 2 件 (shiguredo/sora-oss-private#1524 / #1605) に分かれており、内容が重複しているため統合して扱う**

着手判断のトリガー:

- `stream` コールバック (または参照 API) の型と発火条件が決定した
- `connection_id` / `client_id` からの参照 API の形が決定した
- `ontrack` と notify の順序依存をどう解決するかが決定した
