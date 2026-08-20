---
name: sora-js-sdk
description: Sora JavaScript SDK (sora-js-sdk) を使って WebRTC SFU Sora / Sora Cloud に接続するアプリケーションの実装。接続 (sendrecv / sendonly / recvonly / messaging)、コールバック、ConnectionOptions、DataChannel メッセージング、RPC、トラック操作、切断処理に関する質問で使用。
---

# Sora JavaScript SDK (sora-js-sdk)

- **バージョン**: 2026.1.0
- **リポジトリ**: https://github.com/shiguredo/sora-js-sdk
- **ドキュメント**: https://sora-js-sdk.shiguredo.jp/
- **API リファレンス**: https://sora-js-sdk.shiguredo.jp/api.html
- **サンプル**: https://github.com/shiguredo/sora-js-sdk-examples

[WebRTC SFU Sora](https://sora.shiguredo.jp) / [Sora Cloud](https://sora-cloud.shiguredo.app/) をブラウザから扱うための SDK。

## 動作条件

- WebRTC SFU Sora 2025.1.0 以降
- TypeScript 5.1 以降
- Node.js 22.12 以降
- ブラウザは Compression Stream API 対応が必須
  - Chrome / Edge 80 以降
  - Firefox 113 以降
  - Safari 16.4 以降

## インストール

```bash
npm install sora-js-sdk
# または
pnpm add sora-js-sdk
# または
vp install sora-js-sdk
```

ESM 専用パッケージ (`"type": "module"`) であり、CommonJS の `require` では利用できない。

## 制限事項

- **マルチトラック非対応**: Sora が 1 メディアストリームにつき音声 1 トラック、映像 1 トラックまでしか対応していないため
- **messaging 接続は Sora 側の設定が必要**: 音声・映像なしの接続 (messaging_only) を許可する設定が必要

---

## 基本的な使い方

### 接続の流れ

1. `Sora.connection(signalingUrlCandidates, debug)` で `SoraConnection` を生成する
2. `sendrecv()` / `sendonly()` / `recvonly()` / `messaging()` で role 毎の Connection オブジェクトを生成する
3. `on()` でコールバックを登録する
4. `connect()` で接続する
5. `disconnect()` で切断する

### import

```typescript
import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  ConnectionPublisher,
  ConnectionSubscriber,
  ConnectionMessaging,
  SignalingNotifyMessage,
  SoraCloseEvent,
} from "sora-js-sdk";
```

実体は `Sora` (デフォルトエクスポート) のみで、クラスや型は全て type-only エクスポート。

---

## API リファレンス

### Sora (デフォルトエクスポート)

```typescript
// SoraConnection を生成する
Sora.connection(signalingUrlCandidates: string | string[], debug = false): SoraConnection

// SDK のバージョンを返す
Sora.version(): string

// MediaStream の constraints を動的に変更する
Sora.helpers.applyMediaStreamConstraints(
  mediaStream: MediaStream,
  constraints: MediaStreamConstraints,
): Promise<void>
```

`signalingUrlCandidates` に複数の URL を渡すと、候補として順に接続を試行し、最初に成功した URL を利用する。

### SoraConnection

```typescript
// role sendrecv の Connection を生成する
sendrecv(channelId: string, metadata: JSONType = null, options?: ConnectionOptions): ConnectionPublisher

// role sendonly の Connection を生成する
sendonly(channelId: string, metadata: JSONType = null, options?: ConnectionOptions): ConnectionPublisher

// role recvonly の Connection を生成する
recvonly(channelId: string, metadata: JSONType = null, options?: ConnectionOptions): ConnectionSubscriber

// DataChannel メッセージングのみの Connection を生成する
messaging(channelId: string, metadata: JSONType = null, options?: ConnectionOptions): ConnectionMessaging
```

- `metadata` は認証で利用する任意の JSON (例: `{ access_token: "..." }`)
- `options` 省略時は `{ audio: true, video: true }` (messaging のみ `{ audio: false, video: false }`)
- `messaging()` は `audio: false` / `video: false` / `dataChannelSignaling: true` が強制され、role は sendonly として扱われる

### connect / disconnect

```typescript
// ConnectionPublisher (sendrecv / sendonly)
async connect(stream: MediaStream): Promise<MediaStream>

// ConnectionSubscriber (recvonly) / ConnectionMessaging
async connect(): Promise<void>

// 共通
async disconnect(): Promise<void>
```

### 主なプロパティ (接続後に参照できる)

| プロパティ              | 型                           | 内容                                                  |
| :---------------------- | :--------------------------- | :---------------------------------------------------- |
| `connectionId`          | `string \| null`             | Sora が払い出した接続 ID                              |
| `clientId`              | `string \| null`             | クライアント ID                                       |
| `sessionId`             | `string \| null`             | セッション ID                                         |
| `bundleId`              | `string \| null`             | バンドル ID                                           |
| `stream`                | `MediaStream \| null`        | ローカルストリーム                                    |
| `pc`                    | `RTCPeerConnection \| null`  | PeerConnection (`pc.getStats()` で統計取得)           |
| `authMetadata`          | `JSONType`                   | 認証ウェブフックの成功時に払い出されたメタデータ      |
| `rpcMethods`            | `string[]`                   | type offer で払い出された RPC メソッドのリスト        |
| `connectedSignalingUrl` | `string`                     | type offer を受信したシグナリング URL                 |
| `contactSignalingUrl`   | `string`                     | 最初に type connect を送信したシグナリング URL        |
| `audio` (getter)        | `boolean`                    | 音声が有効かどうか                                    |
| `video` (getter)        | `boolean`                    | 映像が有効かどうか                                    |
| `datachannels` (getter) | `DataChannelConfiguration[]` | メッセージング用 DataChannel の情報 (switched 後のみ) |

### コールバック (on)

```typescript
on<T extends keyof Callbacks>(kind: T, callback: Callbacks[T]): void
```

同じ kind への再登録は上書きになる (1 kind につき 1 コールバック)。

| kind          | 引数                                    | 発火タイミング                                                              |
| :------------ | :-------------------------------------- | :-------------------------------------------------------------------------- |
| `connected`   | `SignalingNotifyConnectionCreated`      | PeerConnection が connected かつ自身の connection.created 受信後に 1 回だけ |
| `disconnect`  | `SoraCloseEvent`                        | 切断時 (正常・異常どちらも)                                                 |
| `track`       | `RTCTrackEvent`                         | リモートトラック追加時                                                      |
| `removetrack` | `MediaStreamTrackEvent`                 | リモートトラック削除時                                                      |
| `notify`      | `SignalingNotifyMessage, TransportType` | type notify 受信時                                                          |
| `push`        | `SignalingPushMessage, TransportType`   | type push 受信時                                                            |
| `switched`    | `SignalingSwitchedMessage`              | WebSocket から DataChannel シグナリングへの切り替え時                       |
| `message`     | `DataChannelMessageEvent`               | メッセージング用 DataChannel のメッセージ受信時                             |
| `datachannel` | `DataChannelEvent`                      | メッセージング用 DataChannel の open 時                                     |
| `timeout`     | なし                                    | 接続タイムアウト時                                                          |
| `signaling`   | `SignalingEvent`                        | シグナリングイベント (デバッグ用)                                           |
| `timeline`    | `TimelineEvent`                         | タイムラインイベント (デバッグ用)                                           |
| `log`         | `title: string, message: JSONType`      | ログ (デバッグ用)                                                           |

### ConnectionOptions

音声:

| オプション                                                                                                        | 型                                            |
| :---------------------------------------------------------------------------------------------------------------- | :-------------------------------------------- |
| `audio`                                                                                                           | `boolean`                                     |
| `audioCodecType`                                                                                                  | `"OPUS"`                                      |
| `audioBitRate`                                                                                                    | `number`                                      |
| `audioOpusParamsChannels` / `audioOpusParamsMaxplaybackrate` / `audioOpusParamsMinptime` / `audioOpusParamsPtime` | `number`                                      |
| `audioOpusParamsStereo` / `audioOpusParamsSpropStereo` / `audioOpusParamsUseinbandfec` / `audioOpusParamsUsedtx`  | `boolean`                                     |
| `audioStreamingLanguageCode`                                                                                      | `string`                                      |
| `forceStereoOutput`                                                                                               | `boolean` (Answer SDP に stereo=1 を追記する) |

映像:

| オプション                                                                  | 型                                            |
| :-------------------------------------------------------------------------- | :-------------------------------------------- |
| `video`                                                                     | `boolean`                                     |
| `videoCodecType`                                                            | `"VP9" \| "VP8" \| "AV1" \| "H264" \| "H265"` |
| `videoBitRate`                                                              | `number`                                      |
| `videoVP9Params` / `videoH264Params` / `videoH265Params` / `videoAV1Params` | `JSONType`                                    |

サイマルキャスト・スポットライト:

| オプション                                  | 型                               |
| :------------------------------------------ | :------------------------------- |
| `simulcast`                                 | `boolean`                        |
| `simulcastRid`                              | `"r0" \| "r1" \| "r2"`           |
| `simulcastRequestRid`                       | `"none" \| "r0" \| "r1" \| "r2"` |
| `spotlight`                                 | `boolean`                        |
| `spotlightNumber`                           | `number`                         |
| `spotlightFocusRid` / `spotlightUnfocusRid` | `"none" \| "r0" \| "r1" \| "r2"` |

DataChannel:

| オプション                  | 型                                                                 |
| :-------------------------- | :----------------------------------------------------------------- |
| `dataChannelSignaling`      | `boolean` (シグナリングを DataChannel に切り替える)                |
| `ignoreDisconnectWebSocket` | `boolean` (切替後の WebSocket 切断を無視する)                      |
| `dataChannels`              | `DataChannelConfiguration[]` (メッセージング用 DataChannel の定義) |

その他:

| オプション                  | 型                                            |
| :-------------------------- | :-------------------------------------------- |
| `clientId`                  | `string`                                      |
| `bundleId`                  | `string`                                      |
| `signalingNotifyMetadata`   | `JSONType`                                    |
| `connectionTimeout`         | `number` (ミリ秒)                             |
| `disconnectWaitTimeout`     | `number` (ミリ秒)                             |
| `signalingCandidateTimeout` | `number` (ミリ秒、URL 候補の試行タイムアウト) |
| `forwardingFilters`         | `ForwardingFilter[]`                          |
| `skipIceCandidateEvent`     | `boolean`                                     |

### トラック操作 (主に ConnectionPublisher で利用)

```typescript
// トラックを置き換える (カメラ・マイクのデバイス変更など)
async replaceAudioTrack(stream: MediaStream, audioTrack: MediaStreamTrack): Promise<void>
async replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void>

// トラックを停止して削除する
async removeAudioTrack(stream: MediaStream): Promise<void>
async removeVideoTrack(stream: MediaStream): Promise<void>
```

### DataChannel メッセージング

`options.dataChannels` で定義する。**label は `#` で始まる必要がある**。

```typescript
interface DataChannelConfiguration {
  label: string; // "#" で始まるラベル
  direction: "sendonly" | "sendrecv" | "recvonly";
  compress?: boolean; // DEFLATE 圧縮 (送受信とも SDK が自動処理)
  maxPacketLifeTime?: number;
  maxRetransmits?: number;
  protocol?: string;
  ordered?: boolean;
  header?: MessagingHeaderField[]; // [{ type: "sender_connection_id" }]
}
```

送信:

```typescript
// message は Uint8Array。compress: true なら自動で圧縮される
// 未接続 (pc === null) の場合は何もしない
// DataChannel が存在しない・open でない場合は例外を投げる
async sendMessage(label: string, message: Uint8Array): Promise<void>
```

受信は `message` コールバックで行う。`event.data` は `ArrayBuffer`。
`header` に `sender_connection_id` を指定すると、受信メッセージの先頭に送信者の connection_id が付与される。

### RPC

Sora の RPC 機能 (JSON-RPC 2.0 over DataChannel) を呼び出す。認証成功時に `rpc_methods` が払い出されている必要があり、利用可能なメソッドは `connection.rpcMethods` で確認できる。

```typescript
async rpc<T = unknown>(
  method: string,
  params?: Record<string, unknown> | unknown[],
  options?: RPCOptions,
): Promise<T>

interface RPCOptions {
  timeout?: number;       // ミリ秒。超過で reject する
  notification?: boolean; // true でレスポンスを待たない (id なしの notification)
}
```

```typescript
// サイマルキャストの受信 rid を RPC で変更する例
const result = await connection.rpc("2025.2.0/RequestSimulcastRid", {
  receiver_connection_id: connection.connectionId,
  rid: "r0",
});
```

### 切断イベント (SoraCloseEvent)

`disconnect` コールバックで受け取る。

```typescript
interface SoraCloseEvent extends Event {
  // type は "normal" (正常切断) または "abend" (異常切断)
  title: string;
  code?: number;
  reason?: string;
  params?: Record<string, unknown>;
}
```

異常切断時の title (`SoraAbendTitle`):
`CONNECTION-STATE-FAILED` / `DATA-CHANNEL-ONERROR` / `ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT` / `ICE-CONNECTION-STATE-FAILED` / `INTERNAL-ERROR` / `WEBSOCKET-ONCLOSE` / `WEBSOCKET-ONERROR`

再接続は SDK では自動で行わないため、`disconnect` コールバックの `event.type === "abend"` を契機にアプリケーション側で `connect()` をやり直す。

---

## 使用例

### sendrecv (ビデオチャット)

```typescript
import Sora from "sora-js-sdk";
import type { SoraCloseEvent } from "sora-js-sdk";

const sora = Sora.connection("wss://sora.example.com/signaling");
const sendrecv = sora.sendrecv(
  "sora",
  { access_token: "..." },
  { audio: true, video: true, videoCodecType: "VP9", videoBitRate: 1000 },
);

// リモートトラックの追加
sendrecv.on("track", (event) => {
  const stream = event.streams[0];
  if (!stream) {
    return;
  }
  // stream.id はリモートの connection_id と一致する
  attachRemoteVideo(stream);
});

// リモートトラックの削除
sendrecv.on("removetrack", (event) => {
  const stream = event.target as MediaStream;
  detachRemoteVideo(stream.id);
});

// 切断
sendrecv.on("disconnect", (event: SoraCloseEvent) => {
  if (event.type === "abend") {
    // 異常切断。必要ならここで再接続する
  }
});

const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
await sendrecv.connect(mediaStream);

// 切断する
await sendrecv.disconnect();
```

### recvonly (視聴のみ)

```typescript
const sora = Sora.connection("wss://sora.example.com/signaling");
const recvonly = sora.recvonly("sora", { access_token: "..." });

recvonly.on("track", (event) => {
  const stream = event.streams[0];
  if (stream) {
    attachRemoteVideo(stream);
  }
});

await recvonly.connect();
```

### messaging (DataChannel メッセージングのみ)

```typescript
const sora = Sora.connection("wss://sora.example.com/signaling");
const messaging = sora.messaging(
  "sora",
  { access_token: "..." },
  {
    dataChannels: [
      {
        label: "#example",
        direction: "sendrecv",
        compress: true,
      },
    ],
  },
);

// DataChannel の open を待ってから送信を開始する
messaging.on("datachannel", (event) => {
  console.log("opened:", event.datachannel.label);
});

// メッセージ受信 (data は ArrayBuffer)
messaging.on("message", (event) => {
  console.log(event.label, new TextDecoder().decode(event.data));
});

await messaging.connect();

// メッセージ送信 (Uint8Array で渡す)
await messaging.sendMessage("#example", new TextEncoder().encode("hello"));
```

### 自身の接続確立を検知する

```typescript
sendrecv.on("notify", (event) => {
  // notify は他クライアントの接続・切断でも発火するため connection_id で自身を判別する
  if (event.event_type === "connection.created" && event.connection_id === sendrecv.connectionId) {
    console.log("connected:", event.connection_id);
  }
});

// または connected コールバックを使う (自身の接続確立時に 1 回だけ発火)
sendrecv.on("connected", (event) => {
  console.log("connected:", event.connection_id);
});
```

### カメラの切り替え

```typescript
const newStream = await navigator.mediaDevices.getUserMedia({
  video: { deviceId: { exact: newDeviceId } },
});
const newVideoTrack = newStream.getVideoTracks()[0];
// sendrecv.stream は接続中のローカルストリーム
if (sendrecv.stream && newVideoTrack) {
  await sendrecv.replaceVideoTrack(sendrecv.stream, newVideoTrack);
}
```

### 統計の取得

```typescript
if (sendrecv.pc !== null) {
  const statsReport = await sendrecv.pc.getStats();
  for (const report of statsReport.values()) {
    console.log(report.type, report);
  }
}
```

### サイマルキャスト

```typescript
// 送信側
const sendonly = sora.sendonly("sora", metadata, {
  audio: false,
  video: true,
  videoCodecType: "VP8",
  videoBitRate: 3000,
  simulcast: true,
});

// 受信側 (rid を指定して受信)
const recvonly = sora.recvonly("sora", metadata, {
  simulcast: true,
  simulcastRid: "r2",
});

// simulcast.switched で現在の rid を確認できる
recvonly.on("notify", (event) => {
  if (event.event_type === "simulcast.switched") {
    console.log("current rid:", event.current_rid);
  }
});
```

---

## 非推奨 API

| 非推奨                     | 代替                        |
| :------------------------- | :-------------------------- |
| `stopAudioTrack(stream)`   | `removeAudioTrack(stream)`  |
| `stopVideoTrack(stream)`   | `removeVideoTrack(stream)`  |
| `options.timeout`          | `options.connectionTimeout` |
| `options.forwardingFilter` | `options.forwardingFilters` |
| `signalingUrl` (getter)    | `signalingUrlCandidates`    |

## クイックリファレンス

| やりたいこと             | コード                                                            |
| :----------------------- | :---------------------------------------------------------------- |
| 接続の生成               | `Sora.connection(url, debug)`                                     |
| 送受信で接続             | `sora.sendrecv(channelId, metadata, options)` → `connect(stream)` |
| 送信のみで接続           | `sora.sendonly(channelId, metadata, options)` → `connect(stream)` |
| 受信のみで接続           | `sora.recvonly(channelId, metadata, options)` → `connect()`       |
| メッセージングのみで接続 | `sora.messaging(channelId, metadata, options)` → `connect()`      |
| 切断                     | `connection.disconnect()`                                         |
| コールバック登録         | `connection.on(kind, callback)`                                   |
| リモート映像の表示       | `on("track", (event) => event.streams[0])`                        |
| メッセージ送信           | `connection.sendMessage("#label", uint8Array)`                    |
| メッセージ受信           | `on("message", (event) => event.data)`                            |
| RPC 呼び出し             | `connection.rpc(method, params, options)`                         |
| トラック置き換え         | `connection.replaceVideoTrack(stream, track)`                     |
| トラック削除             | `connection.removeVideoTrack(stream)`                             |
| 統計取得                 | `connection.pc?.getStats()`                                       |
| 自身の接続 ID            | `connection.connectionId`                                         |
| 認証メタデータ           | `connection.authMetadata`                                         |
| constraints の変更       | `Sora.helpers.applyMediaStreamConstraints(stream, constraints)`   |
