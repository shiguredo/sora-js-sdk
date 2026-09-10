# WebSocket シグナリングの onopen / onclose / onerror ログを signaling URL の単一 / 複数で統一する

- Priority: Low
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/refactor-unify-websocket-signaling-logs
- Polished: {YYYY-MM-DD}

## 目的

シグナリング用 WebSocket の onopen / onclose / onerror で出力されるログが、`signalingUrlCandidates` が単一 URL のときと複数 URL のときで非対称になっている。同じ事象 (接続成功・接続失敗・エラー) が URL の指定方法によって異なる形式で記録されるため、ログを横断して解析しづらい。両経路で同じ事象が同じログイベントとして記録されるように統一する。

## 優先度根拠

Low。接続の成否やアプリケーションの挙動には影響しない観測性 (ログ) の問題であり、機能的なバグではない。ただしログは障害調査の一次情報であり、同じ事象の記録形式が経路によって変わると調査コストが上がるため、放置はしない。

## 現状

### 接続確立後のログは共通

`src/base.ts` の `signaling()` が `new-websocket` / `contact-signaling-url` / `send-connect` / `onmessage-*` などを出力するため、接続確立後のログは単一 / 複数で共通になっている。

### 候補接続フェーズのログが非対称

`src/base.ts` の `getSignalingWebSocket()` は、`signalingUrlCandidates` が `string` または長さ 1 の `string[]` の場合 (単一経路) と、長さ 2 以上の `string[]` の場合 (複数経路) とで処理が分かれる。

単一経路:

- `ws.onopen` は `resolve(ws)` を呼ぶだけでログを出力しない
- `ws.onclose` は `writeWebSocketTimelineLog("onclose", ConnectError)` を出力するだけで、signaling ログは出力しない
- `ws.onerror` ハンドラを設定しない
- `signalingCandidateTimeout` によるタイムアウト処理が無い

複数経路 (`testSignalingUrlCandidate`):

- `ws.onopen` で `writeWebSocketSignalingLog("signaling-url-candidate", { type: "open", selected: true | false })` を出力する
- `ws.onclose` で `writeWebSocketSignalingLog("signaling-url-candidate", { type: "close", ... })` を出力する
- `ws.onerror` で `writeWebSocketSignalingLog("signaling-url-candidate", { type: "error", ... })` を出力する
- `signalingCandidateTimeout` 経過で `writeWebSocketSignalingLog("signaling-url-candidate", { type: "timeout", ... })` を出力する

このため、`signalingUrl` を単一の `string` で指定した場合と、同じ URL を要素 1 つの配列で指定した場合は同じログになるが、2 つ以上の候補を指定した場合とは onopen / onclose / onerror のログが一致しない。

### onerror のログも経路で異なる

- 単一経路の `getSignalingWebSocket()` には `ws.onerror` が無い
- `monitorSignalingWebSocketEvent()` の `ws.onerror` は `ConnectError` を data に付けた signaling ログを出力し、`signalingTerminate()` の後に reject する
- `monitorWebSocketEvent()` の `ws.onerror` は data 無しの signaling ログを出力し、`abend("WEBSOCKET-ONERROR")` する

エラー処理そのもの (接続中の reject / 確立後の abend) は接続フェーズごとの役割の違いであり、本 issue ではログの形式統一のみを対象とする。

## 設計方針

未確定。少なくとも以下を決める必要がある。

- 単一経路でも `signaling-url-candidate` を出力するか、複数経路のログを共通のイベント名に寄せるか
- `signaling-url-candidate` の `open` / `close` / `error` / `timeout` を単一経路でも同じ data 構造で出力するか
- 単一経路に `signalingCandidateTimeout` を適用するか (現状はタイムアウト処理が無い)
- `monitorSignalingWebSocketEvent()` と `monitorWebSocketEvent()` の `onerror` ログ data を揃えるか (接続フェーズが異なるため、揃えない判断もあり得る)

方針が確定したら `getSignalingWebSocket()` / `monitorSignalingWebSocketEvent()` / `monitorWebSocketEvent()` を修正する。

## 完了条件

- 単一 URL 経路と複数 URL 経路で、onopen / onclose / onerror の同じ事象が同じログイベントとして記録されること
- 方針上「揃えない」と決定した項目は、その理由がコメントとして残っていること
- `src/base.ts` のログ実装が既存の signaling ログ / timeline ログの使い分けと整合していること
- `CHANGES.md` の `## develop` に変更を追記すること
- 正常系の接続 / 切断が変わらないこと (非回帰確認)

## pending にした理由

統一後のログ仕様 (どのイベント名・data 構造を正とするか、単一経路にタイムアウトを適用するか) が未確定であり、SDK 利用者に公開されているログの形式を変えうるため、方針を決定するまで実装に着手しない。

着手判断のトリガー:

- 統一後のログイベント名と data 構造が決定した
- 単一経路に `signalingCandidateTimeout` を適用するかどうかが決定した
