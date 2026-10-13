# sendAnswer() が pc / ws / localDescription のどれかが無いと送信せず return する

- Created: 2026-10-06
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-send-answer-returns-without-sending
- Polished: 2026-10-14

## 目的

`sendAnswer()` が answer を送信できないとき、無言で return せず、ログを残して `signalingTerminate()` を実行し、`ConnectError` を throw する。これにより呼び出し側の `multiStream` は接続処理を失敗として終え、`onIceCandidate()` の ICE 待ちへ進まないようにする。

対象はガード (`this.pc` / `this.ws` / `this.pc.localDescription` の真偽) が不成立の経路である。`readyState !== 1` と `ws.send` の同期例外の 2 経路は `issues/closed/0007-bug-fix-send-answer-ws-send-uncaught-exception.md` で対応済みのため、挙動を変えない。

## 優先度根拠

Medium。ガード不成立で実際に意味を持つのは「`this.ws` が null」と「`this.pc` が null」の 2 状態であり、通常フローでは発生しない (現状の分析参照)。ユーザーが制御できない次の経路で発生する。

- **offer 受信直後の WebSocket 切断** (本 issue の主対象)。`signaling()` が resolve した直後、`monitorSignalingWebSocketEvent()` の interval (100ms) が `this.ws` の `onclose` / `onerror` を差し替えるまでの間に WebSocket が閉じた場合。この間に閉じると、`signaling()` の `ws.onclose` は `signalingTerminate()` だけを呼び (Promise は settle 済みのため reject できない)、`connect()` を reject する経路が残らない。answer はサーバへ届かず、`connect()` は `connectionTimeout` (既定 60000ms) まで決着しない。決着しても `ConnectError` ではなく `Error("Signaling connection timeout")` で reject する
- **接続中の `disconnect()` との race**。`disconnect()` が `ws` / `pc` を null 化した直後に `sendAnswer()` へ到達した場合。この経路は issue 0094 (High) が「接続中に `disconnect()` すると `connect()` が戻らなくなる」として対象にしているため、本 issue では扱わず、対象の分離を「現状」に明記する

発火は狭い時間窓に依存するため High とはしないが、発生すると `connect()` が実質宙吊りになるため放置しない。

`issues/closed/0007-bug-fix-send-answer-ws-send-uncaught-exception.md` は、`readyState` が OPEN ではないときと `ws.send` が throw したときの cleanup を扱う。同 issue は「`ws` が null の場合は従来どおり何もせず return する」と明記しており、ガード不成立の無言 return 経路は含まない。

## 現状

`ConnectionBase.sendAnswer` (src/base.ts) は `this.pc` と `this.ws` と `this.pc.localDescription` がすべて真のときだけ送信する。どれかが無いときはログも `signalingTerminate()` も throw も無く return する。

`readyState !== 1` と `ws.send` の throw は、`writeWebSocketSignalingLog("failed-to-send-answer")` を残して `signalingTerminate()` し、`ConnectError` (`reason: "WS_SEND_INVALID_STATE"` または `"WS_SEND_FAILED"`) を throw する。JSDoc は「内部状態 (ws / pc / soraDataChannels) が dangling のまま残らないように signalingTerminate() で同期的にクリーンアップしてから ConnectError を throw する」とあり、ガード不成立の無言 return はこの契約と不整合である。

`ConnectionPublisher` / `ConnectionSubscriber` / `ConnectionMessaging` の `multiStream` は `sendAnswer()` の戻り値を見ない。throw した場合だけ、周囲の try が `signalingTerminate()` して再 throw する。無言の return はこの try を失敗にしない。

### ガード不成立になる経路の分析

`createAnswer()` (src/base.ts) は通常・simulcast の両分岐で必ず `setLocalDescription()` してから return するため、成功後は `pc.localDescription` が null にならない。`connectPeerConnection()` (src/base.ts) は最初の await (`RTCPeerConnection.generateCertificate`) のあとで必ず `this.pc` を代入する。したがって通常フローではガードは常に成立し、不成立になるのは pc 代入から `sendAnswer()` 到達までの間に接続中断が入った場合だけである。中断で `sendAnswer()` に無言 return を残すのは次の 2 経路である:

- **WebSocket 切断**: 上記の offer 受信直後 (monitor 未装着) の閉じた場合。このとき `generateCertificate` の await から続行した `multiStream` は新しい `RTCPeerConnection` を作り、`this.ws` が null のままガード不成立で無言 return する。`onIceCandidate()` は gather 完了で resolve するが、answer は送られないため接続は `"connected"` にならず、`waitChangeConnectionStateConnected()` が宙吊りになる。この経路は issue 0094 が扱う中断 (タイムアウト / `disconnect()`) のどちらでもなく、0094 の完了条件にも含まれない
- **`disconnect()` / タイムアウトとの race**: `setRemoteDescription()` / `createAnswer()` の await 中に `disconnect()` や接続タイムアウトが `pc` を null 化した場合。in-flight の操作が throw すれば catch で終わるが、null ガード (`if (!this.pc) return;`) を通過した場合は `onIceCandidate()` が宙吊りになる。この経路は 0094 が対象とするため、本 issue の修正で合わせて解消されるが、主対象にはしない

## 設計方針

- ガード不成立のときは、既存の送信失敗経路と同じ順序で処理する: `writeWebSocketSignalingLog("failed-to-send-answer")` → `signalingTerminate()` → `ConnectError` を throw する。ログラベルは既存経路と同じ `failed-to-send-answer` を再利用する
- 新 reason は `"WS_NOT_OPEN"` とする。ガード不成立 (pc / ws / localDescription のいずれかが無い) の経路で使い、`"WS_SEND_INVALID_STATE"` (readyState が OPEN でない) と区別する。pc と localDescription の null は現行フローではほぼ到達しないため、個別の reason は設けない
- `issues/closed/0007-bug-fix-send-answer-ws-send-uncaught-exception.md` は ws が null の場合に従来どおり return するガードの維持を明記している。本 issue は「優先度根拠」に示した実害 (answer 不達による `connect()` の宙吊り) を根拠に、その経路も throw に変更する
- `signalingTerminate()` は、WebSocket 切断の `ws.onclose` が先に走った場合などに既に呼ばれていることがある。冪等であること (src/base.ts の `signalingTerminate() の冪等性に依存` というコメントが前提にしている)
- 呼び出し側 (publisher / subscriber / messaging の `multiStream`) は変更しない。周囲の try が catch して `signalingTerminate()` + 再 throw するため、`connect()` は reject で決着する
- 接続中の `disconnect()` / タイムアウトによる中断は issue 0094 が扱う (接続試行の世代無効化)。本 issue の修正は 0094 の実装前後どちらでも有効で、実装順に依存しない

## 完了条件

- ガード不成立 (pc / ws / localDescription のどれかが無い) で `sendAnswer()` が無言 return しない。必ず `ConnectError` (`reason: "WS_NOT_OPEN"`) を throw する
- そのとき `signalingTerminate()` が呼ばれる。既に呼ばれている場合でも 2 回目の呼び出しで状態を壊さない
- `readyState !== 1` と `ws.send` 失敗の既存 reason (`"WS_SEND_INVALID_STATE"` / `"WS_SEND_FAILED"`) と、その際のクリーンアップ順序 (ログ → `signalingTerminate()` → throw) は変わらない
- answer を送信できたときは従来どおり return し、`onIceCandidate()` の ICE 待ちへ進む
- `tests/utils.test.ts` の sendAnswer 経路 reason 固定化テストに `"WS_NOT_OPEN"` を追加する。sendAnswer 自体の制御フローはブラウザ依存のため、ガード不成立で throw する分岐と `signalingTerminate()` の冪等性がソース上で辿れることを完了条件とする
- モックは使わない
