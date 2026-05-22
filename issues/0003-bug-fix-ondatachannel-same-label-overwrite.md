# `onDataChannel` で同名 label の DC を無条件に上書きし旧 DC のハンドラから誤って abend / disconnect が発火する

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-ondatachannel-dc-overwrite

## 目的

`onDataChannel` (`src/base.ts:2116-2294`) が `this.soraDataChannels[dataChannel.label]` に新しい DC を無条件に代入する (`src/base.ts:2121`)。既存 DC のハンドラ解除と close を行わないため、Sora が再ネゴで同名 label の `RTCDataChannel` を新規に追加した場合、旧 DC オブジェクトの `onerror` (`src/base.ts:2151-2158`) と `onclose` (`src/base.ts:2144-2149`) のクロージャがイベントループから dispatch される余地が残り、それぞれが `await this.abend("DATA-CHANNEL-ONERROR")` および `await this.disconnect()` を呼んで新しい接続を強制切断する経路を作る。代入前に旧 DC のハンドラを null 化し close する。

## 優先度根拠

Medium。発生条件が「Sora が re-offer または DataChannel 経由 re-offer (`src/base.ts:2176-2181`) で同名 label の `RTCDataChannel` を新規追加する」という限定的な経路に依存する。redirect 経路 (`signalingOnMessageTypeRedirect` `src/base.ts:2064-2077`) では `multiStream` 冒頭の `await this.disconnect()` (`src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts`) で `soraDataChannels` が空にされてから `connectPeerConnection` (`src/base.ts:1343-`) が新規 RTCPeerConnection を生成 (`src/base.ts:1355`) するため、本問題は redirect では発生しない。

実害は、新規 PC が成立した直後に旧 DC からの遅延イベントで abend / disconnect が走り `callbacks.disconnect` が誤発火することにある。Sora が同名 label の DataChannel を一度閉じてから再追加する re-offer を返すケースが具体的にどの機能で発生するかは未確定で、本 issue では特定機能 (spotlight 切替や stats 機能オン・オフなど) を断定的に列挙しない。再現条件を確定したログ・タイムラインの取得は完了条件の検証作業で行う。`re-offer` 経路で同名 label の `ondatachannel` が再発火するか自体はブラウザ・Sora 双方の挙動に依存するため、再現確認できない場合は本 issue を `issues/pending/` に送る。

## 現状

`src/base.ts:2121`

```ts
this.soraDataChannels[dataChannel.label] = dataChannel;
```

既存 channel が存在しても close せず、ハンドラを null 化せず代入で上書きする。

`onDataChannel` 内で設定されるハンドラの副作用:

- `onerror` (`src/base.ts:2151-2158`): `await this.abend("DATA-CHANNEL-ONERROR", { params: { label: channel.label } })` を呼ぶ。`abend` (`src/base.ts:716-815`) は WebSocket / DataChannel / PeerConnection を全終了し `callbacks.disconnect` を発火する
- `onclose` (`src/base.ts:2144-2149`): `await this.disconnect()` を呼ぶ
- `onmessage` (`src/base.ts:2161-2276` 周辺、label 別に分岐): signaling label なら `signalingOnMessageTypeReOffer` / `signalingOnMessageTypeClose` を呼ぶ。notify label なら `signalingOnMessageTypeNotify` を呼ぶ。push / stats / rpc / messaging の各 label も対応するコールバックを呼ぶ

旧 DC オブジェクトはハンドラを差し替えない限り、上記のハンドラがそのまま `pc.ondatachannel` 経由ではなく `RTCDataChannel` プロパティ経由でイベントループから dispatch される。`close()` 後でも dispatch キューに残っていた `error` / `close` イベントは null 化前なら走る。null 化後は EventHandler IDL 属性が dispatch 時に最新値を参照するため走らない。

過去 issue との関係: 0002 (`disconnect()` 冪等化) が完了していなくても、本 issue の修正 (旧 DC の `onclose` を `null` 化してから `close()` を呼ぶ) で旧 DC の `onclose` ハンドラはそもそも走らず、`disconnect()` 経路に入らない。0002 とは独立に修正できる。

`abend()` / `abendPeerConnectionState()` / `shutdown()` / `disconnect()` / `signalingTerminate()` / `forceCloseDataChannels` で行っている類似の「旧 DC のハンドラ null 化 → `close()`」パターンを共通化するリファクタは本 issue では扱わない (別 issue として扱う)。

## 完了条件

- `onDataChannel` (`src/base.ts:2116-`) の `this.soraDataChannels[dataChannel.label] = dataChannel` 代入前に、既存 DC があれば `onerror` / `onclose` / `onmessage` を `null` に差し替えてから `close()` を呼ぶロジックが追加されている。新規 DC と既存 DC が万一同一インスタンスのケース (`existing === dataChannel`) は何もしない
- 既存 DC を close した際にタイムラインで追跡できるよう、`this.writeDataChannelTimelineLog("close-stale-data-channel", existing)` などのログを残す
- ハンドラ null 化対象は `onerror` / `onclose` / `onmessage` の 3 つに限定する。`onopen` と `onbufferedamountlow` はログ用途しかなく abend / disconnect を呼ばないため null 化対象から外す。`abend` (`src/base.ts:725-748`) などが `onclose` をログ専用関数に **差し替えている** のは「自分が起こした close を timeline に残す」目的だが、本 issue は「旧 DC からの遅延 close イベントが新接続を壊すのを防ぐ」目的のため `onclose = null` で完全に殺す。旧 DC 由来の `onclose` ログが timeline に出なくなる代償として、新規 DC 代入直前に `writeDataChannelTimelineLog("close-stale-data-channel", existing)` を出す
- 検証は実機 Sora で再ネゴ起点の DataChannel 追加が発生する条件を整え、その手順を既存の `e2e-tests/data_channel_signaling_only/README.md` (なければ追記) に「再ネゴで同名 label の DataChannel が再追加されるケースの確認手順」として残す。専用ページを新設して `e2e-tests/vite.config.ts` の `rolldownOptions.input` を増やす形は取らない。修正前に `callbacks.disconnect` が誤発火し、修正後は誤発火しないログを PR 説明に添付する
- 再現条件が確定できない場合は本 issue を `issues/pending/` に移す。pending 送りの判断は実装着手者が SDK 修正コードを書く前後で行い、pending に移す際は試した Sora バージョン、Sora 側の機能設定 (spotlight / stats / rpc / messaging 等)、収集できた SDP / timeline ログを issue 末尾に追記する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] onDataChannel で同名 label の DataChannel を上書きする際に旧 DC のハンドラを解除し close するようにする
    - @voluntas
  ```

## 解決方法

`src/base.ts:2121` の `this.soraDataChannels[dataChannel.label] = dataChannel;` の直前に次の処理を入れる。`null` 化を `close()` の前に行うことで、旧 DC の `onclose` ハンドラ経由で `disconnect()` が呼ばれる経路、`onerror` 経由で `abend()` が呼ばれる経路、`onmessage` 経由で signaling 系メッセージが処理される経路をすべて遮断する。

```ts
const existing = this.soraDataChannels[dataChannel.label];
if (existing && existing !== dataChannel) {
  existing.onerror = null;
  existing.onclose = null;
  existing.onmessage = null;
  this.writeDataChannelTimelineLog("close-stale-data-channel", existing);
  if (existing.readyState !== "closed" && existing.readyState !== "closing") {
    existing.close();
  }
}
this.soraDataChannels[dataChannel.label] = dataChannel;
```

`existing === dataChannel` ガードを入れる理由: ブラウザ仕様上 `ondatachannel` イベントが同一インスタンスを 2 回渡すことは通常ないが、テスト経路や将来の SDK 変更で同一インスタンスが渡された場合に自身を close するのを防ぐ。

`readyState` ガードを入れる理由: 既に `closed` / `closing` の DC に対して `close()` を呼ぶのは仕様上 no-op だが、明示することでレビュー時に意図を読み取りやすくする。

`writeDataChannelTimelineLog` を `existing.close()` の前に出す理由: `close()` 後は `RTCDataChannel.id` などの内部状態が実装依存で `null` になりうるため、close 前にスナップショットを取る。

旧参照は `this.soraDataChannels[dataChannel.label] = dataChannel;` の上書き代入で失われるため `delete` は不要。

`signalingOfferMessageDataChannels[label]` (`src/base.ts:1902` で書き込まれる旧 offer の DataChannel 設定) は本 issue では触らない。新 DC が同じ label なら旧設定がそのまま再利用される。設定そのものは Sora が新 offer で送ってきた値に基づくため、SDP に変更がなければ問題ない。設定変更を伴う再ネゴでは `signalingOnMessageTypeOffer` が新値で上書きする (`src/base.ts:1900-1904`)。
