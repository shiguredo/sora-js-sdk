# 複数シグナリング URL で先に成功したあと、負けた候補の WebSocket が閉じられない

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-close-losing-signaling-url-candidates
- Polished: {YYYY-MM-DD}

## 目的

シグナリング URL が複数あるとき、1 つが接続に成功したあとも、まだ CONNECTING の負け候補を `signalingCandidateTimeout` で閉じる。

## 優先度根拠

Medium。速い候補が先に open したあと、遅い候補がハンドシェイクのまま止まると、その WebSocket はブラウザの TCP タイムアウトまで残る。接続自体は成功するため、失敗としては見えない。

候補が全部失敗したときのエラー内容は `issues/0093-bug-fix-preserve-caught-error-on-connect.md` の対象であり、本 issue では変えない。

## 現状

`ConnectionBase.getSignalingWebSocket` は候補が 2 つ以上のとき `testSignalingUrlCandidate` を `Promise.any` する。各候補の `setTimeout` は `resolved === false` のときだけ `close()` して reject する。別候補が先に `resolved = true` になると、タイムアウトはログだけ出してソケットを閉じない。

`onopen` で自分が敗者だと分かったときは `close()` する。open も error も close も来ない CONNECTING のソケットは、タイムアウトでは閉じられない。

タイムアウト ID の解除は `clearInterval` である。`setTimeout` で張った ID だが、ブラウザでは `clearTimeout` と `clearInterval` が同じタイマー一覧を消すため、これ自体はソケットが残る原因ではない。

単一 URL と要素数 1 の配列はこの関数内に候補タイムアウトを持たない。その中断は `issues/0094-bug-fix-abort-inflight-connect.md` で扱う。

## 設計方針

候補タイムアウトは、その候補がまだ開いていて、勝者として採用されていないなら必ず `close()` する。すでに勝者が決まっていても、自分のソケットは閉じる。勝者のソケットは閉じない。タイマー ID の解除方法は本 issue では変えない。

## 完了条件

- 候補 A が open したあと、候補 B が `signalingCandidateTimeout` まで CONNECTING のとき、B の WebSocket が close される
- 勝者の WebSocket は close されない
- 全候補失敗時の `ConnectError` のメッセージは 0093 の範囲として本 issue では変えない
