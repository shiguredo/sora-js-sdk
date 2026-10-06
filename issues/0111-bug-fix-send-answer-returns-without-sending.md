# sendAnswer() が pc / ws / localDescription のどれかが無いと送信せず return する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-send-answer-returns-without-sending
- Polished: {YYYY-MM-DD}

## 目的

`sendAnswer()` が answer を送らないとき、無言で return せず、接続処理が失敗として終わるようにする。WebSocket が OPEN でない、または `localDescription` が無い状態で ICE 待ちへ進まないようにする。

## 優先度根拠

Medium。`createAnswer` のあと `sendAnswer()` が条件を満たさないと、呼び出し側は成功したように次の `onIceCandidate()` へ進む。answer はサーバへ届かず、`connect()` は ICE 完了か `connectionTimeout` まで待つ。

`issues/closed/0007-bug-fix-send-answer-ws-send-uncaught-exception.md` は、`readyState` が OPEN のときに `ws.send` が throw した場合の cleanup である。条件を満たさず return する経路は含まない。

## 現状

`ConnectionBase.sendAnswer` は `this.pc` と `this.ws` と `this.pc.localDescription` がすべて真のときだけ送信する。どれかが無いときはログも `signalingTerminate()` も throw も無く return する。

`readyState !== 1` と `ws.send` の throw は、ログを残して `signalingTerminate()` し、`ConnectError` (`reason: "WS_SEND_INVALID_STATE"` または `"WS_SEND_FAILED"`) を throw する。

`ConnectionPublisher` / `ConnectionSubscriber` / `ConnectionMessaging` の `multiStream` は `sendAnswer()` の戻り値を見ない。throw した場合だけ、周囲の try が `signalingTerminate()` して再 throw する。無言の return はこの try を失敗にしない。

## 設計方針

answer を送らずに関数を抜けるときは、既存の送信失敗と同じく `signalingTerminate()` して `ConnectError` を throw する。reason は、WebSocket が OPEN でない既存の `"WS_SEND_INVALID_STATE"` と区別できる値にする。`pc` が無い場合と `localDescription` が無い場合を、reason で分けてよい。

すでに送信失敗で throw している 2 経路の reason 文字列は変えない。二重の `signalingTerminate()` は冪等であること。外側の try がもう一度呼んでも、閉じたあとの接続を壊し直さない。

## 完了条件

- `this.pc` が null、または `this.ws` が null、または `localDescription` が null のとき、`sendAnswer()` が `ConnectError` を throw する
- そのとき `signalingTerminate()` が呼ばれる
- `readyState !== 1` と `ws.send` 失敗の既存 reason は変わらない
- answer を送信できたときは従来どおり return する
