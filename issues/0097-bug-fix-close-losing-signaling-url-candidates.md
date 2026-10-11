# 複数シグナリング URL で先に成功したあと、負けた候補の WebSocket が閉じられない

- Priority: Medium
- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-close-losing-signaling-url-candidates
- Polished: 2026-10-12

## 目的

シグナリング URL が複数あるとき、1 つが接続に成功したあとも、まだ CONNECTING のままの負け候補を `signalingCandidateTimeout` の経過時点で閉じる。

## 優先度根拠

Medium。速い候補が先に open したあと、遅い候補がハンドシェイクのまま止まると、その WebSocket は CONNECTING のまま残る。サーバーが接続を切るかページを閉じるまで閉じられず、再接続を繰り返すと残ったソケットが蓄積する。接続自体は成功するため、失敗としては見えない。

候補が全部失敗したときのエラー内容は `issues/0093-bug-fix-preserve-caught-error-on-connect.md` の対象であり、本 issue では変えない。

## 現状

`ConnectionBase.getSignalingWebSocket` は候補が 2 つ以上のとき `testSignalingUrlCandidate` を `Promise.any` する。各候補の `setTimeout` は `resolved === false` のときだけ `close()` して reject する。別候補が先に `resolved = true` になると、タイムアウトはログだけ出してソケットを閉じない。

`onopen` で自分が敗者だと分かったときは `close()` する。別候補が勝って `resolved = true` になったあと、open も error も close も来ない CONNECTING のソケットは、タイムアウトでは閉じられない。

タイムアウト ID の解除は `clearInterval` である。`setTimeout` で張った ID だが、ブラウザでは `clearTimeout` と `clearInterval` が同じタイマー一覧を消すため、これ自体はソケットが残る原因ではない。

単一 URL と要素数 1 の配列はこの関数内に候補タイムアウトを持たない。その中断は `issues/0094-bug-fix-abort-inflight-connect.md` で扱う。

## 設計方針

候補タイムアウトが発火したとき、そのソケットはまだ open / error / close のいずれも来ていない CONNECTING である。これら 3 つのどれもがタイマーを解除するため、タイムアウトが発火する候補は勝者になれない。候補タイムアウトは自分のソケットを必ず `close()` する。別候補が勝って `resolved = true` でも、勝者でないソケットは閉じる。勝者のソケットは `onopen` でタイマーが解除されるため、閉じられない。`close()` の前にハンドラを外すのは現行どおり、reject も `resolved` で分岐せず必ず行う。勝者確定後の reject は `Promise.any` が最初に決着した候補の結果だけを使うため観測されず、全候補失敗時の挙動は現行と変わらない。タイマー ID の解除方法は本 issue では変えない。

## 完了条件

- 候補 A が open したあと、候補 B が `signalingCandidateTimeout` 経過時点でまだ CONNECTING のとき、B の WebSocket が close される
- 勝者の WebSocket は close されない
- 全候補失敗時の `ConnectError` のメッセージは `issues/0093-bug-fix-preserve-caught-error-on-connect.md` の範囲として本 issue では変えない
