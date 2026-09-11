# シグナリングメッセージ系のコールバック (offer / answer / re-offer / re-answer) を追加する

- Priority: Medium
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/add-signaling-message-callbacks
- Polished: {YYYY-MM-DD}

## 目的

Sora JavaScript SDK の利用者が、シグナリングの `type: offer` / `type: answer` / `type: re-offer` / `type: re-answer` の送受信タイミングをコールバックでフックできるようにする。

現状これらのメッセージは `signaling` コールバックの `data` を利用者が自分で解析しないと取得できず、Sora とのネゴシエーションを調査・可視化したい利用者にとって扱いづらい。プロトコル調査用のコールバックを SDK が提供することで、利用者がシグナリングの流れを追いやすくする。

あわせて、`type: notify` の `connection.created` を `notify` コールバックで `event_type` 判定せずに拾えるショートハンド (例: `sendrecv.on("connection.created", ...)`) を追加するかどうかを検討する。

## 優先度根拠

Medium。接続の成否やメディアの送受信には影響しない観測性 (プロトコル調査) の機能追加であり、バグではない。ただし SDK 利用者に公開するコールバック API を増やす変更であり、後から名前や引数を変えにくいため、機能追加として優先的に方針を固めておく。

## 現状

### `Callbacks` に offer / answer 系が無い

`src/types.ts` の `Callbacks` は次の 13 個のみ。

- `disconnect` / `push` / `track` / `removetrack` / `notify` / `switched` / `connected` / `log` / `timeout` / `timeline` / `signaling` / `message` / `datachannel`

`offer` / `answer` / `re-offer` / `re-answer` に対応するコールバックは無い。

### `on()` は `keyof Callbacks` しか受け付けない

`src/base.ts` の `on<T extends keyof Callbacks>(kind: T, callback: Callbacks[T])` は `Callbacks` のキーだけを受け付ける。`on("connection.created", ...)` のような `notify` の `event_type` を指定する形式は無い。

### offer / re-offer の受信と answer / re-answer の送信

- `src/base.ts` の `ws.onmessage` は `message.type` で分岐し、`type: offer` を `signalingOnMessageTypeOffer`、`type: re-offer` を `signalingOnMessageTypeReOffer`、deprecated な `type: update` を `signalingOnMessageTypeUpdate` に渡す
- `signalingOnMessageTypeOffer` は simulcast / spotlight / session_id / client_id / bundle_id / connection_id / metadata / encodings / mid / data_channels / rpc_methods をインスタンスに反映するだけで、コールバックを呼ばない
- `signalingOnMessageTypeReOffer` は `setRemoteDescription` → `createAnswer` → `sendReAnswer` を行う
- answer 送信は `sendAnswer` / `sendReAnswer` / (deprecated な) `sendUpdateAnswer` が担い、いずれもコールバックを呼ばない

### `switched` / `connected` は追加済み

- `switched` コールバックは `signalingOnMessageTypeSwitched` から `callbacks.switched` として発火する (`CHANGES.md` 2025.2.0 の `[ADD] Callbacks に switched コールバックを追加する`、PR #646)
- `connected` コールバックは `triggerConnectedCallbackIfReady` から `callbacks.connected` として発火する (`CHANGES.md` 2025.2.0 の `[ADD] Callbacks に connected コールバックを追加する`、PR #647)

元 issue が挙げていた `switched` と `connection.created` のラッパーは、この 2 つで一部カバーされている。

### `notify` に `connection.created` は含まれる

`src/base.ts` の `signalingOnMessageTypeNotify` は全ての `SignalingNotifyMessage` を `callbacks.notify` に渡す。`connection.created` は `SignalingNotifyConnectionCreated` の `event_type` として届くため、利用者は `event_type` を判定すれば取得できる。

## 設計方針

未確定。少なくとも以下を決める必要がある。

- offer / answer / re-offer / re-answer のコールバックを追加するか、`signaling` コールバックで十分とするか
- 追加する場合のコールバック名と引数。受信した生の `WebSocketSignalingMessage` を渡すか、SDK が加工した値 (SDP など) を渡すか
- re-offer / re-answer を offer / answer と別のコールバックにするか、共通のコールバックに種別を付けて渡すか
- `sendAnswer` / `sendReAnswer` / `sendUpdateAnswer` の送信側にもコールバックを出すか、受信側だけにするか
- deprecated な `type: update` / `sendUpdateAnswer` をコールバックの対象に含めるか
- `on("connection.created", ...)` のような `notify` の `event_type` ショートハンドを追加するか、既存の `connected` / `notify` で足りるか

方針が確定したら `src/types.ts` の `Callbacks` と `src/base.ts` の該当箇所 (`on` / `signalingOnMessageTypeOffer` / `signalingOnMessageTypeReOffer` / `sendAnswer` / `sendReAnswer`) を修正する。コールバックの追加は後方互換がある。

## 完了条件

- 追加するコールバックの名前と引数の型が `Callbacks` に定義されていること
- 方針に従って `src/base.ts` の該当箇所からコールバックが発火すること
- 追加したコールバックの発火を確認するテストが追加されていること
- `pnpm test` / `pnpm typecheck` / `pnpm lint` が通ること
- `CHANGES.md` の `## develop` に `[ADD]` エントリが追記されていること

## pending にした理由

- **API 仕様が未確定**: 追加するコールバックの範囲 (受信側だけか送信側も含むか)、名前、引数 (生メッセージか加工値か)、re-offer / re-answer の扱いが未確定。利用者に公開する API を増やすため、方針を決めるまで実装に着手しない
- **元 issue (shiguredo/sora-oss-private#1294) が「もっと色々なコールバックを用意すべき」という提案レベルで、必要なコールバックの一覧と API 名が固まっていない**
- 元 issue の `switched` と `connection.created` のラッパーは、`switched` / `connected` コールバックの追加で一部カバー済み。残りのスコープを確定する必要がある

着手判断のトリガー:

- 追加するコールバックの一覧と、それぞれの名前・引数の型が決定した
- `notify` の `event_type` ショートハンドを追加するかどうかが決定した
