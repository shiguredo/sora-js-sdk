# 認証ウェブフックで接続拒否されたときの認証エラーを利用者に伝える経路を整理して明記する

- Priority: High
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-auth-webhook-disconnect-error
- Polished: 2026-09-14

## 目的

`auth_webhook` が `{"allowed": false}` を返して接続が拒否されたとき、利用者が認証エラーの原因 (接続確立前の切断なので WebSocket close 時に Sora が返す code / reason) を判別できるようにする。

接続確立前の拒否では `disconnect` callback は発火しない。このため「エラーが取れない」と報告されてきたが、ソース照合の結果、SDK は `connect()` の reject (`ConnectError`) で既に理由を伝えている。したがって本 issue の作業は、伝達経路を仕様として確定・明記し、誤解を解消することである。

## 優先度根拠

High。認証エラーはアプリケーションがユーザーにエラー表示する必要がある代表的な失敗であり、原因が判別できないと問い合わせ対応や再試行判断ができない。SDK の `connect()` reject (`ConnectError`) に理由が入ることはコード上は実現しているが、この契約が利用者向けに明記されておらず、サンプルも対応していないため、実際に判別できている利用者は限られる。

- 旧 GitHub issue のコメントでも「最優先で確認する必要あり」とされていた (元 issue は GitHub の issue 機能廃止で参照できない。当時の SDK / サンプルの挙動は下記のとおり git 履歴で照合した)

## 現状

検証は 2026-09-14 時点の `develop` と、git 履歴との照合で行った。

### 接続確立前の失敗は connect() の reject で伝わる

- `src/base.ts` の `signaling()` は `ws.onclose` で `ConnectError` を reject する。`ConnectError.code` / `ConnectError.reason` には `CloseEvent` の code / reason が入り、`message` には `CloseEventCode:${code} CloseEventReason:'${reason}'` が入る
- 同様の `ConnectError` は `src/base.ts` の `getSignalingWebSocket()` (単一 URL 経路) と `monitorSignalingWebSocketEvent()` でも reject される。`connect()` は `Promise.race` 経由で最初の reject を受け取るため、いずれの経路でも利用者には同じ内容 (code / reason を持つ `ConnectError`) が届く
- したがって認証拒否による WebSocket 切断は、利用者からは `connect()` の reject として観測される。`ConnectError` は `src/sora.ts` から export されておらず、利用者は `error.name === "ConnectError"` と `error.code` / `error.reason` で判別する (closed issue `issues/closed/0021-refactor-connect-error-constructor.md` の方針と同じ)
- この挙動は 2024-08 時点でも同じである。git 履歴の `packages/sdk/src/base.ts` (当時の構成) の `signaling()` が `error.code = event.code` / `error.reason = event.reason` を設定して reject していた

### disconnect callback は発火しない (設計上の挙動)

- `src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` の `connect()` は、`Promise.race([multiStream(), setConnectionTimeout(), monitorSignalingWebSocketEvent()])` が resolve した後で `monitorWebSocketEvent()` を呼ぶ
- `monitorWebSocketEvent()` が `shutdown()` / `abend()` 経由で `callbacks.disconnect` を発火するため、接続確立前に WebSocket が閉じられる認証拒否では `disconnect` callback は発火しない
- 接続していないのに `disconnect` を発火させるのは意味が合わないため、これは SDK のバグではなく意図された挙動である。ただし、その旨が仕様として明記されていない

### 2024-08 時点のサンプルの状況

- 元 issue の再現対象は、当時このリポジトリにあった `examples/recvonly/main.mts` である (git 履歴 `fac46df3` (2024-08-18) で確認)
- 当該ファイルは `connect()` の reject を catch しておらず (`client.connect()` を await するだけ)、`disconnect` callback も登録していなかった
- したがって認証エラーの reason はどこにも表示されず、「エラーが取れない」という報告になった。SDK 側ではなくサンプル側の取りこぼしである
- サンプルは git 履歴 `5879e723` (2025-01-11) でこのリポジトリから削除され、sora-js-sdk-examples へ移管された

## 確認手順

1. `auth_webhook` が `{"allowed": false, "reason": "AUTH-ERROR"}` を 200 OK で返すように設定して Sora を起動する
2. サンプル (sora-js-sdk-examples の recvonly、`connect()` を try / catch する版) で Start を押下する
3. `connect()` の reject を受けたときの `error.name` / `error.code` / `error.reason` / `error.message` を確認する
4. `disconnect` callback が発火しないことを確認する (現状は発火しないことが期待される)
5. 対照として `{"allowed": true}` にすると接続後に Disconnect API で切断でき、そのときは `disconnect` callback が発火する

## 設計方針

以下を決定する。

- **`connect()` の reject を正式な仕様として確定できるか**: 接続確立前の失敗は `connect()` の reject (`ConnectError`) で伝える現状の挙動を仕様として確定できるか。確定する場合は利用者向けに明記する (TypeDoc の JSDoc)。あわせて、`ConnectError` を `src/sora.ts` から export するか (現状は export されておらず、利用者側に型・`instanceof` 判定がない) を決める
- **接続確立前でも `disconnect` callback を発火させるか**: 接続していないのに `disconnect` (または `SoraCloseEvent`) を発火させるのは接続状態の契約と食い違うため、発火させない現状維持を推すが、最終判断は確認後に行う。どちらにしても接続確立前後の発火条件を仕様として明記する
- **Sora が auth_webhook 拒否時に返す WebSocket close code / reason**: 本リポジトリの旧実装 (2015 年、git 履歴 `138c2579`「認証エラーは 4401 固定にする」、`9525ab3c`「認証失敗時の処理を修正する」) では、認証エラーを close code 4401 と判定して `onError(e.reason)` に reason を渡していた。現行 Sora でも 4401 なのか、また reason に何が入るのかを実機で確認する
- **サンプル修正は本 issue のスコープ外**: sora-js-sdk-examples 側で `connect()` の reject をハンドリングする修正は別リポジトリの話であり、本 issue では扱わない

## 完了条件

- `auth_webhook` 設定済みの Sora で拒否時の WebSocket close code / reason を確認し、`connect()` の reject から `ConnectError.code` / `ConnectError.reason` に同じ値が入ることを確認する (結果は本 issue に残す)
- 伝達経路 (接続確立前は `connect()` の reject、確立後は `disconnect` callback) が仕様として確定され、利用者向けに明記されている (TypeDoc の JSDoc に reject 時の `ConnectError` と判別方法を記載する。`ConnectError` を export する場合は `src/sora.ts` の export にも反映する。確定できない場合は、その旨と理由を本 issue に残す)
- 接続確立前では `disconnect` callback が発火しないことが仕様として明記されている
- 確認の結果、現行 Sora の close code / reason が旧実装 (4401) と異なる場合も、その旨を確認結果とともに明記する

## テスト方針

- Sora 側の `auth_webhook` 設定が必要であり、現行の e2e-tests は `auth_webhook` を設定した Sora を用意する手順を持っていないため、E2E テストの追加が難しい。確認手順と結果を本 issue に残す (手動確認)
- モック / スタブは利用しない (AGENTS.md)
