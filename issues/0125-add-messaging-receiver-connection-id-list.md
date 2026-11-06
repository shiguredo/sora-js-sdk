# DataChannel メッセージングで宛先の connection_id を指定して送るメソッドを追加する

- Created: 2026-11-06
- Completed: {YYYY-MM-DD}
- Branch: feature/add-messaging-receiver-connection-id-list
- Polished: {YYYY-MM-DD}

## 目的

Sora の DataChannel メッセージングに、送信者が宛先の connection_id を指定し、その接続にだけメッセージを届ける機能 (`header` の type `receiver_connection_id_list`) が追加される。sora-js-sdk からこの機能を使えるようにする。

この type を宣言したラベルでは、送信者がメッセージの先頭に宛先ヘッダーを付ける必要がある。付けずに送ると message の先頭が宛先ヘッダーとして扱われ、count が 0 の場合やバイト数が足りない場合は送信者が切断される。今の `sendMessage` でこの機能を使うには、アプリが宛先ヘッダーを自分で組み立てる必要があり、付け忘れると切断される。宛先ヘッダーの組み立てと、宣言の有無の検査は SDK が受け持つ。

この機能は experimental として提供する。Sora の仕様が変わったら、メソッドごと変更・削除できる形にする。

## Sora の仕様

出典: Sora ドキュメントの「`"type": "receiver_connection_id_list"`」 https://sora-doc-canary.shiguredo.jp/MESSAGING#8a4601

- `data_channels` の `header` に `{"type": "receiver_connection_id_list"}` を指定して宣言する
  - `direction` が `sendrecv` または `sendonly` の場合に指定できる (既存の `sender_connection_id` は `sendrecv` または `recvonly` の場合)
- 宛先ヘッダーはクライアント側で付与する
- クライアントから Sora へ送るメッセージは `[receiver_connection_id count (1 byte)][receiver_connection_id (26 bytes)][message (可変長)]` の形にする
  - 宛先が複数の場合は、件数分の `receiver_connection_id` (各 26 バイト) が `message` の前に並ぶ
  - `count` が 0 の場合、バイト数が足りない場合、空のメッセージを送った場合は、送信者が切断される
- ヘッダーに指定した connection_id の受信者にだけメッセージが送られる。自身の connection_id を指定しても、自身には送られない
- Sora からクライアントへ送るメッセージには、宛先ヘッダーは含まれない
- `compress` が `true` の場合は、宛先ヘッダーも含めた全体を圧縮する

上の仕様から、SDK の設計では次のことを前提にする。

- count は 1 バイトで、0 だと切断されるので、1 つのメッセージで指定できる宛先は 1 件から 255 件になる
- 宣言したラベルでは宛先ヘッダーが必須で、count を 0 にできない。そのため、そのラベルで宛先を指定せずに全員へ送る手段はない

## 現状

- `src/types.ts` の `MessagingHeaderFieldType` は `"sender_connection_id"` だけを持つ
- `src/base.ts` の `sendMessage(label, message)` には宛先を受け取る引数がない
  - `signalingOfferMessageDataChannels[label].compress` が `true` なら `compressMessage` で圧縮して送り、そうでなければ `Uint8Array` をそのまま送る。どちらも binary で送る
- `src/utils.ts` の `parseDataChannelConfiguration` は、`header` の配列を中身を検査せずに `data_channels` に載せる
  - 型を広げれば `receiver_connection_id_list` を Sora に送れる
- 受信側 (`src/base.ts` の `onDataChannel` のうち `#` で始まるラベルの `onmessage`) は、ヘッダーを解釈せずに `message` コールバックへ渡す
  - 宛先ヘッダーは受信者に付かないので、受信側は変えなくてよい

## 設計方針

### API

全員に送る `sendMessage` と、宛先を指定して送るメソッドを分ける。

- 分ける理由:
  - 今の `sendMessage` には options の口がない。2 種類の送信を 1 つのメソッドに混ぜると、呼び出し側が迷う
  - 別のメソッドにしておけば、experimental をやめるときにメソッドごと削除できる
- 名前を `sendMessageToReceivers` にする理由:
  - 宣言する type `receiver_connection_id_list` と同じ単語で対応が分かる
  - 宛先にできるのはそのラベルの受信者だけであることが、名前に出る
  - 渡すものが connection_id であることは、引数名 `receiverConnectionIds` で示す

```ts
/**
 * @experimental
 */
async sendMessageToReceivers(
  label: string,
  message: Uint8Array,
  receiverConnectionIds: string[],
): Promise<void>
```

- 引数は `sendMessage(label, message)` の後ろに宛先を足した順にする
- `sendMessageToReceivers` の動作
  - `this.pc === null` なら何もしない。DataChannel が無い場合と open でない場合は例外にする (`sendMessage` と同じ)
  - そのラベルの `header` に `receiver_connection_id_list` が無ければ例外にする
  - `receiverConnectionIds` が 0 件の場合と 256 件以上の場合は例外にする
  - 各 connection_id を UTF-8 で表して 26 バイトでなければ、例外にする
  - `[count][receiver_connection_id x count][message]` を組み立てる。`compress` が `true` なら全体を `compressMessage` で圧縮し、binary で送る
    - 宛先ヘッダーは任意のバイト列になるので、text ではなく binary で送る
  - 宛先は SDK では重複を除かず、渡された順に並べる
  - message が空の場合の扱いは公開ドキュメントから読み取れないので、実装時に Sora の挙動を確かめて決める
- `sendMessage` の変更
  - そのラベルの `header` に `receiver_connection_id_list` があれば例外にする
  - message の先頭が宛先ヘッダーとして扱われ、送信者が切断されるのを送信前に止める
- 宣言の有無は、Sora から受け取った type: offer の `data_channels` (`signalingOfferMessageDataChannels`) の `header` で判定する
  - type: offer の `header` に `receiver_connection_id_list` がどう載るかは公開ドキュメントに記載がない。実装時に Sora の type: offer で確かめる
- 宛先ヘッダーの組み立ては `src/utils.ts` に純粋関数として置き、`tests/utils.test.ts` で単体テストする。公開 API としては export しない
- 圧縮の有無で分かれる送信処理は、`sendMessage` と共有する

### 型

- `MessagingHeaderFieldType` を `"sender_connection_id" | "receiver_connection_id_list"` にする
- `MessagingHeaderField` の `length` はもともと optional なので変えない

### experimental の扱い

- `sendMessageToReceivers` と、`MessagingHeaderFieldType` の `receiver_connection_id_list` の説明に、TSDoc の `@experimental` を付ける
  - typedoc の出力に表示されることを確かめる。表示されない場合は `typedoc.json` で対応する
- `CHANGES.md` と `skills/sora-js-sdk/SKILL.md` に、experimental であり今後変更・削除する可能性があること、この機能に対応した Sora が必要なことを書く

### テスト

- 単体テスト (`tests/utils.test.ts`)
  - 宛先ヘッダーの組み立てを確かめる: 1 件、複数件、255 件、重複した宛先 (除かずに並ぶ)
  - 例外になることを確かめる: 0 件、256 件、26 バイトでない connection_id、非 ASCII を含む connection_id
- E2E (`e2e-tests/messaging/` に追加するもの)
  - `receiver_connection_id_list` を宣言するチェックボックス
  - 宛先の connection_id の入力欄
  - `sendMessageToReceivers` で送るボタン
  - 送信時の例外を表示する要素
- E2E テスト (`e2e-tests/tests/messaging_receiver_connection_id_list.test.ts` を新規に作る。3 つのブラウザコンテキストを使う)
  - page1 から page2 を宛先にして送ると、page2 だけが受け取り、page3 は受け取らない
    - page3 が受け取らないことは、続けて page3 を宛先にした区切りのメッセージを送り、page3 が最初に受け取ったのが区切りのメッセージであることで確かめる。固定時間の待機には頼らない
  - 受信者に届くメッセージに、宛先ヘッダーが含まれない
  - `compress: true` でも宛先指定が効く
  - 送信前に例外になることを確かめる
    - `receiver_connection_id_list` を宣言したラベルで `sendMessage` を呼んだ場合
    - 宣言していないラベルで `sendMessageToReceivers` を呼んだ場合
  - `checkSoraVersion` で、この機能を入れる sora-js-sdk のバージョン (2026.2) より前ならスキップする
- E2E の接続先 (`TEST_SIGNALING_URL`) の Sora がこの機能に対応していることが前提

## 完了条件

- `sendMessageToReceivers` で、指定した connection_id の接続にだけメッセージが届くこと (`compress` が `true` の場合と `false` の場合の両方)
- 次の 2 つが、送信前に例外になること
  - `receiver_connection_id_list` を宣言したラベルでの `sendMessage`
  - 宣言していないラベルでの `sendMessageToReceivers`
- `MessagingHeaderFieldType` で `receiver_connection_id_list` を指定できること
- 単体テストと E2E テストが通ること
- typedoc、`skills/sora-js-sdk/SKILL.md`、`CHANGES.md` に experimental として記載されていること

## 対象外

- 受信側の変更 (宛先ヘッダーは受信者に付かない)
- SDK での `header` と `direction` の組み合わせの検査
  - 既存の `sender_connection_id` も SDK では検査していない。`parseDataChannelConfiguration` は `header` の中身を検査しない
- Sora JavaScript SDK ドキュメント (https://sora-js-sdk.shiguredo.jp/) への記載 (experimental の間は、typedoc と `skills/sora-js-sdk/SKILL.md` に留める)
