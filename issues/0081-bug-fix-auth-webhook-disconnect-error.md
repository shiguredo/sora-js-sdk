# 認証ウェブフックで認証エラーを返した際に SDK の disconnect callback にエラーが上がってこない

- Priority: High
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-auth-webhook-disconnect-error
- Polished: {YYYY-MM-DD}

## 目的

`auth_webhook` が `{"allowed": false}` を返して接続が拒否されたとき、利用者が認証エラーの原因 (Sora が返す reason) を判別できるようにする。

現状は接続確立前の拒否であり、`disconnect` callback が発火しないため、元 issue では「エラーが取れない」と報告されている。接続確立前の失敗が利用者にどう伝わるべきかを整理する。

## 優先度根拠

High。認証エラーはアプリケーションがユーザーにエラー表示する必要がある代表的な失敗であり、原因が判別できないと問い合わせ対応や再試行判断ができない。元 issue のコメントでも「最優先で確認する必要あり」とされている。

## 現状

### 接続確立前の認証エラー経路

- `src/base.ts` の `signaling()` は `ws.onclose` に `ConnectError` (`ConnectError.code` / `ConnectError.reason` に Sora の close code / reason を設定) を reject するハンドラを設定している
- 認証拒否で Sora が WebSocket を閉じると、`signaling()` の Promise が reject し、`src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` の `connect()` が reject する
- したがって認証エラーは現状 `connect()` の reject (`ConnectError.reason`) から取得できる

### disconnect callback は発火しない

- `src/base.ts` の `monitorWebSocketEvent()` (WebSocket の `onclose` を監視して `shutdown` / `abend` を呼ぶ) は、`connect()` の `multiStream()` が resolve した後に呼ばれる
- 接続確立前の認証エラーでは `monitorWebSocketEvent()` が設定されていないため、`disconnect` callback は発火しない
- 元 issue は 2024-08 時点の `examples/recvonly/main.mts` を対象にしており、当時は `connect()` の reject を catch していなかったため、認証エラーの reason がどこにも現れなかった

### 元 issue の再現手順

1. `auth_webhook` が `{"allowed": false, "reason": "AUTH-ERROR"}` を 200 OK で返すように設定して Sora を起動する
2. 視聴サンプルで Start を押下する
3. ブラウザのコンソールで `disconnect` callback の `console.log(event)` が出力されないことを確認する
4. 対照として `{"allowed": true}` にすると接続後に Disconnect API で切断でき、そのときは `disconnect` callback が発火する

## 設計方針

未確定。少なくとも以下を決める必要がある。

- 接続確立前の失敗は `connect()` の reject で伝える、という現状の挙動を正式な仕様として確定できるか。`ConnectError.reason` / `code` に Sora の close reason が入ることを利用者向けに明記する
- 接続確立前の失敗でも `disconnect` callback を発火させるか。接続していないのに `disconnect` (または `SoraCloseEvent`) を発火させるのは意味が合わない可能性が高い
- Sora が auth_webhook 拒否時に返す WebSocket close code / reason の仕様を確認する
- 現行コードで再現するか (2024-08 以降の切断系修正で挙動が変わっている可能性がある)。再現しない場合は本 issue を閉じる

## 完了条件

- 確認手順で認証エラーの reason (例: `AUTH-ERROR`) が利用者に伝わること
- 伝わる経路 (接続確立前は `connect()` reject、確立後は `disconnect` callback) が仕様として整理されていること
- 再現しない場合は、その旨を確認して本 issue を閉じること

## テスト方針

- 認証ウェブフックを設定した Sora が必要なため E2E テストでの再現は難しい。可能なら E2E を追加し、難しければ手動確認の手順と結果を issue に残す
- モック / スタブは利用しない
