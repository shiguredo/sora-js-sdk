# DataChannel メッセージングで宛先の connection_id を指定して送るメソッドを追加する

- Created: 2026-11-06
- Completed: 2026-11-06
- Branch: feature/add-messaging-receiver-connection-id-list
- Polished: 2026-11-06

## 目的

Sora の DataChannel メッセージングに、送信者が宛先の connection_id を指定し、その接続にだけメッセージを届ける機能 (`header` の type `receiver_connection_id_list`) が追加される。sora-js-sdk からこの機能を使えるようにする。

この type を宣言したラベルでは、送信者がメッセージの先頭に宛先ヘッダーを付ける必要がある。付けずに送ると message の先頭が宛先ヘッダーとして扱われ、count が 0 の場合やバイト数が足りない場合は送信者が切断される。今の `sendMessage` でこの機能を使うには、アプリが宛先ヘッダーを自分で組み立てる必要があり、付け忘れると切断される。

そこで次の 2 つを行う。

- 宛先ヘッダーを組み立てて送るメソッド `sendMessageToReceivers` を追加する
- 宣言したラベルでの `sendMessage` を送信前に例外にする

この機能は experimental として提供する。Sora の仕様が変わったら変更・削除できる形にする。

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
- 同じページに「接続時か認証成功時に指定された data_channels は `{"type": "offer"}` に含まれます」とある

上の仕様から、SDK の設計では次のことを前提にする。

- count は 1 バイトで、0 だと切断されるので、1 つのメッセージで指定できる宛先は 1 件から 255 件になる
- 宣言したラベルでは宛先ヘッダーが必須で、count を 0 にできない。そのため、そのラベルで宛先を指定せずに全員へ送る手段はない
- 「空のメッセージ」が DataChannel のメッセージ全体を指すのか、宛先ヘッダーの後ろの message を指すのかは、ドキュメントの記述から区別できない
  - 宛先ヘッダーを付けると全体は 27 バイト以上になるので、SDK に関係するのは message が空の場合だけ
  - 安全側に倒して、message が空の場合も切断される扱いにする

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
  - 宛先指定を別のメソッドに閉じ込めておけば、experimental をやめるときに削除する範囲がはっきりする
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
  - 各 connection_id を UTF-8 で表して 26 バイトでなければ、例外にする。文字数ではなくバイト数で検査する
  - message が空 (`message.byteLength === 0`) なら例外にする (「Sora の仕様」の前提を参照)
    - 公開ドキュメントで message が空でもよいと明記された場合は、この例外をやめる
  - `[count][receiver_connection_id x count][message]` を組み立てる。`compress` が `true` なら全体を `compressMessage` で圧縮し、binary で送る
    - 宛先ヘッダーは任意のバイト列になるので、text ではなく binary で送る
  - 宛先は SDK では重複を除かず、渡された順に並べる
- `sendMessage` の変更
  - そのラベルの `header` に `receiver_connection_id_list` があれば例外にする
  - message の先頭が宛先ヘッダーとして扱われ、送信者が切断されるのを送信前に止める
  - 既存の `sendMessage` の挙動が変わる。ただし対象は `receiver_connection_id_list` を宣言したラベルだけで、この type は今回追加される Sora の機能なので、これまでの使い方には影響しない
- 宣言の有無は、Sora から受け取った type: offer の `data_channels` (`signalingOfferMessageDataChannels`) の `header` で判定する
  - 公開ドキュメントのとおり、接続時の指定も認証成功時の指定も type: offer に含まれるので、どちらで宣言しても判定できる
  - type: offer の `header` に `receiver_connection_id_list` がどう載るかは、公開ドキュメントに例がない。実装時に Sora の type: offer で確かめる
- 宛先ヘッダーの組み立てと入力の検査 (件数、各 connection_id のバイト数、message が空かどうか) は `src/utils.ts` に純粋関数として置き、`tests/utils.test.ts` で単体テストする。公開 API としては export しない
- 圧縮の有無で分かれる送信処理は、`sendMessage` と共有する

### 型

- `MessagingHeaderFieldType` を `"sender_connection_id" | "receiver_connection_id_list"` にする
- `MessagingHeaderField` の `length` はもともと optional なので変えない

### experimental の扱い

- `sendMessageToReceivers` の TSDoc に `@experimental` を付ける
- `MessagingHeaderFieldType` の `receiver_connection_id_list` の要素には、`@experimental` を付けない。要素のコメント本文に「experimental であり、今後変更・削除する可能性がある」と書く
  - TypeDoc は union の要素のコメントに付いたタグを警告して捨て、本文だけを残す (`attachUnionComments`)
  - 型エイリアス全体に `@experimental` を付けると、既存の `sender_connection_id` まで experimental に見えるので付けない
- `CHANGES.md` と `skills/sora-js-sdk/SKILL.md` に、experimental であり今後変更・削除する可能性があること、この機能に対応した Sora が必要なことを書く
- experimental をやめて削除するときは、次の 3 つをまとめて戻す
  - `sendMessageToReceivers`
  - `sendMessage` に足した例外
  - `MessagingHeaderFieldType` の `receiver_connection_id_list`

### テスト

- 単体テスト (`tests/utils.test.ts`)
  - 宛先ヘッダーの組み立てを確かめる: 1 件、複数件、255 件、重複した宛先 (除かずに並ぶ)
  - 例外になることを確かめる
    - 0 件、256 件
    - 25 バイトと 27 バイトの ASCII の connection_id
    - 26 文字だが UTF-8 では 26 バイトにならない connection_id (例: 1 文字を「あ」にして 28 バイト)
    - message が空
- E2E (`e2e-tests/messaging/` に追加するもの)
  - `receiver_connection_id_list` を宣言するチェックボックス
  - 宛先の connection_id の入力欄
  - `sendMessageToReceivers` で送るボタン
  - 送信時の例外の内容を表示する要素
- E2E テスト (`e2e-tests/tests/messaging_receiver_connection_id_list.test.ts` を新規に作る。3 つのブラウザコンテキストを使う)
  - どの項目も、3 ページすべてのメッセージング用 DataChannel が open したことを待ってから送る
    - `datachannel` コールバックは DataChannel が open する前に発火することがある (0073) ので、コールバック (`#messaging li`) だけでは open を待てない
    - ページから `RTCDataChannel` を取る公開 API はない (`DataChannelEvent.datachannel` と `datachannels` ゲッターは `DataChannelConfiguration` を返し、`soraDataChannels` は private)
    - open の確認には、既存の `e2e-tests/tests/messaging.test.ts` が送受信後の検証に使っている `#get-stats` と、`e2e-tests/tests/helper.ts` の `findDataChannelStats(stats, "#example", "open")` を流用する
    - 既存のテストは open を `#messaging li` で待っていて、統計を取り直して待つ処理はないので、新しく書く。Playwright の `expect.poll` などで、毎回 `#get-stats` を押してから統計を読み、`#example` の open が見つかるまで繰り返す
      - `#stats-report` は一度統計が書き込まれると表示されたままになるので、2 回目以降の取り直しでは `waitForSelector("#stats-report")` で統計が書き換わるのを待てない
      - 1 回の接続の中で繰り返す限り、押した直後に前の結果を読んでも、その結果は open ではない (open なら繰り返しは終わっている)。取り直すだけで済み、誤って open と判定することはない
      - 同じページで接続し直すと、前の接続の統計が `#stats-report` に残り、誤って open と判定しうる。compress の有無などで項目を分けるときは、項目ごとに新しいページを開いて接続する
  - 3 ページとも `#check-compress` を外して (`compress: false`) 接続し、page1 から page2 を宛先にして送ると、page2 だけが受け取り、page3 は受け取らない
    - page3 が受け取らないことは、続けて page3 を宛先にした区切りのメッセージを送り、page3 が最初に受け取ったのが区切りのメッセージであることで確かめる。固定時間の待機には頼らない
    - この確かめ方は、同じ送信者が同じラベルで送ったメッセージが、送った順に受信者へ届くことを前提にしている。この前提は公開ドキュメントには書かれていない。前提が崩れると、テストは失敗ではなく誤って合格する方向にずれる
  - 受信者に届くメッセージに、宛先ヘッダーが含まれない
  - 3 ページとも `#check-compress` を付けて (`compress: true`) 接続しても、宛先指定が効く
  - 次の 2 つが送信前に例外になり、例外の内容がそれぞれの原因を示すことを確かめる
    - `receiver_connection_id_list` を宣言したラベルで `sendMessage` を呼んだ場合
    - 宣言していないラベルで `sendMessageToReceivers` を呼んだ場合
  - `checkSoraVersion` で、この機能を入れる sora-js-sdk のバージョン (2026.2) より前ならスキップする

## 着手条件

- E2E の接続先 (`TEST_SIGNALING_URL`) の Sora がこの機能に対応していること
  - `checkSoraVersion` が見るのは sora-js-sdk のバージョンで、Sora のバージョンでは判定できない。未対応の Sora に対して E2E を追加すると、定期実行の E2E が失敗し続ける
  - 着手前に接続先の Sora の対応を確かめる。未対応なら着手せず、必要なら pending にする

## 完了条件

- `sendMessageToReceivers` で、指定した connection_id の接続にだけメッセージが届くこと (`compress` が `true` の場合と `false` の場合の両方)
- 次の 2 つが、送信前に例外になること
  - `receiver_connection_id_list` を宣言したラベルでの `sendMessage`
  - 宣言していないラベルでの `sendMessageToReceivers`
- `MessagingHeaderFieldType` で `receiver_connection_id_list` を指定できること
- 単体テストと E2E テストが通ること
- ソースの TSDoc、`skills/sora-js-sdk/SKILL.md`、`CHANGES.md` に experimental として記載されていること
  - typedoc の出力での表示は、この issue の完了条件に含めない。実装時に 0089 が解消済みなら確かめ、未解消なら確かめずに完了してよい

## 関連 issue

- 0089 (`vp run doc` を TypeScript 7 で実行可能にする): 今の develop では typedoc が起動時に落ちるので、typedoc の出力は 0089 が解消するまで確かめられない
- 0073 (`datachannel` コールバックが open 前に発火する): 同じ `e2e-tests/messaging/main.ts` を変える。0073 が先に解消すれば、E2E の open 待ちを `datachannel` コールバック (`#messaging li`) で行える

## 対象外

- 受信側の変更 (宛先ヘッダーは受信者に付かない)
- SDK での `header` と `direction` の組み合わせの検査
  - 既存の `sender_connection_id` も SDK では検査していない。`parseDataChannelConfiguration` は `header` の中身を検査しない
- Sora JavaScript SDK ドキュメント (https://sora-js-sdk.shiguredo.jp/) への記載 (experimental の間は、TSDoc と `skills/sora-js-sdk/SKILL.md` に留める)

## 解決方法

- `src/types.ts`
  - `MessagingHeaderFieldType` に `"receiver_connection_id_list"` を追加した
  - この要素には `@experimental` を付けず、コメント本文に experimental であることを書いた
- `src/utils.ts`: 純粋関数を 2 つ追加した。どちらも `@internal` で、公開 API としては export していない
  - `hasReceiverConnectionIdListHeader`: type: offer の DataChannel の設定が `receiver_connection_id_list` を宣言しているかを判定する
  - `createReceiverConnectionIdListMessage`: 宛先ヘッダーを付けたメッセージを組み立てる。宛先の件数、各 connection_id のバイト数、message が空かどうかを検査する
- `src/base.ts`
  - `sendMessageToReceivers(label, message, receiverConnectionIds)` を追加し、TSDoc に `@experimental` を付けた
  - `sendMessage` は、`receiver_connection_id_list` を宣言したラベルで呼ぶと送信前に例外を投げるようにした
  - 圧縮の有無で分かれる送信処理は、private メソッド `sendMessagingDataChannelMessage` にまとめ、`sendMessage` と共有した
- 設計方針から変えた点
  - `receiverConnectionIds` の型を `readonly string[]` にした。関数は配列を変更しない。`string[]` もそのまま渡せる
  - 未宣言のラベルでの例外には、代わりに使う `sendMessage` を案内する文を足した
- type: offer の確認
  - テスト用の Sora の type: offer で、宣言したラベルの `header` が `{"type": "receiver_connection_id_list"}` (`length` なし) で返ることを確かめた
  - 宣言の判定は `type` だけで行う
- テスト
  - `tests/utils.test.ts`: issue の単体テストの項目をすべて追加した
    - 26 バイトだが 26 文字ではない connection_id を受け付けるケース
    - byteOffset が 0 でない message のケース
    - `hasReceiverConnectionIdListHeader` の判定のケース
  - `e2e-tests/messaging/`
    - 宣言のチェックボックス、宛先の入力欄、`sendMessageToReceivers` の送信ボタン、送信時の例外を表示する要素を追加した
    - `#get-stats` を押すごとに番号を振るようにした。押した回の統計を書き込むと、その番号を `data-stats-response-id` に残す。前に押した回の統計を、テストが新しい統計として読まないようにするため
  - `e2e-tests/tests/messaging_receiver_connection_id_list.test.ts` を新規に作った
    - compress が false の場合と true の場合の宛先指定
    - 宣言と送信メソッドが合わない場合の例外。例外の後に取り直した統計で `#example` の `messagesSent` が 0 であることを確かめ、送信前に止まったことを検証する
  - 一時的に「送ってから例外」に壊した実装で、E2E が落ちることを確かめた
- ドキュメント
  - `skills/sora-js-sdk/SKILL.md` に宛先指定の送信を experimental として追記した
  - `CHANGES.md` に `[ADD]` を追記した
- typedoc の出力は、0089 が未解消のため確かめていない
