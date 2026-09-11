# DataChannel で Blob か ArrayBuffer のどちらで受信するかを指定できるようにする

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/add-datachannel-blob-support
- Polished: {YYYY-MM-DD}

## 目的

Sora から受信する DataChannel のデータ型を `ArrayBuffer` 固定ではなく、`Blob` も選べるようにする。大きなデータを扱うアプリケーションが、受信データを `Blob` としてそのままダウンロードやファイル保存に回せるようにする。

## 優先度根拠

Low。現在も `ArrayBuffer` で受信できており、機能が欠けているわけではない。ただし `Blob` を選べると受信データの扱いが楽になる用途があり、Chromium 側も `RTCDataChannel` の Blob 受信に対応しているため、機能として検討する。

## 現状

### SDK は binaryType を `arraybuffer` 固定にしている

- `src/base.ts` の `onDataChannel` は受信 DataChannel に対して `dataChannel.binaryType = "arraybuffer"` を設定している。直前には `// TODO: blob を変更できるようにする` というコメントが残っている
- `signaling()` 内でも `ws.binaryType = "arraybuffer"` を設定している
- DataChannel の `onmessage` は `string` を `TextEncoder` で `ArrayBuffer` に変換し、`ArrayBuffer` はそのまま使う。それ以外の型 (Blob など) は `console.warn` を出して捨てている
- `src/types.ts` の `DataChannelMessageEvent.data` は `ArrayBuffer` 固定
- `ConnectionOptions` に受信データ型を指定する項目は無い

### 参考

- Blob support in WebRTC data channels: <https://chromestatus.com/feature/5686378455105536>

## 設計方針

未確定。少なくとも以下を決める必要がある。

- 受信データ型を `ConnectionOptions` で指定できるようにするか、DataChannel 単位で指定できるようにするか
- 指定値は `"arraybuffer"` / `"blob"` の 2 択か
- `Blob` を選んだときの `DataChannelMessageEvent.data` の型 (union にするか、`Blob` に変換して渡すか)
- `compress` が有効な DataChannel で `Blob` を受信した場合の `decompressMessage` への受け渡し (現状は `Uint8Array` 前提)
- `type: string` を受信したときの扱い (現状は `ArrayBuffer` に変換している)
- `src/utils.ts` の `createDataChannelMessageEvent` / `decompressMessage` の対応

## 完了条件

- 受信データ型を `Blob` に指定できること
- `ArrayBuffer` を指定した場合は従来どおりの挙動であること
- `Blob` / `ArrayBuffer` それぞれの受信がテストで確認されていること
- `pnpm test` / `pnpm typecheck` / `pnpm lint` が通ること
- `CHANGES.md` の `## develop` に `[ADD]` エントリが追記されていること

## pending にした理由

- **API が未確定**: 指定方法 (オプションか DataChannel 単位か)、`DataChannelMessageEvent.data` の型、`Blob` 受信時の `compress` の扱いが決まっていない
- **元 issue (shiguredo/sora-oss-private#1645) が Chromium の Blob 対応リンクのみで、SDK 側の仕様が固まっていない**

着手判断のトリガー:

- 受信データ型の指定方法と `DataChannelMessageEvent.data` の型が決定した
- `compress` 有効時の `Blob` 受信の扱いが決定した
