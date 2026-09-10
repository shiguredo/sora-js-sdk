# type: redirect 受信時に createOffer を再実行せず生成済みの offer SDP を再利用する

- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/change-skip-create-offer-on-redirect
- Polished: {YYYY-MM-DD}

## 目的

クラスタ構成の Sora へ接続した際に `type: redirect` を受けて再接続するとき、`createOffer` を再実行せず最初の connect で生成した offer SDP を再利用する。

現状はリダイレクトのたびに一時 `RTCPeerConnection` を作成して offer を生成しており、1 回の接続で `createOffer` が 2 回以上実行される。無駄な PeerConnection と offer の生成をなくし、timeline ログの `create-offer` も 1 回だけにする。

## 現状

- `src/base.ts` の `signaling(ws, redirect)` は先頭で必ず `this.createOffer()` を実行する
- `src/base.ts` の `createOffer()` は `iceServers: []` の一時 `RTCPeerConnection` を生成して `pc.createOffer()` を呼び、`pc.close()` したうえで `create-offer` timeline ログを記録する
- `src/base.ts` の `signaling` 内 `ws.onmessage` の `type: redirect` 分岐は `signalingOnMessageTypeRedirect(message)` を呼ぶ
- `src/base.ts` の `signalingOnMessageTypeRedirect(message)` は `message.location` に対して `getSignalingWebSocket` で新しい WebSocket を取得し、`this.signaling(ws, true)` を呼ぶ。このため `signaling` 先頭の `createOffer()` が再度実行される
- 結果として、リダイレクトを挟む接続の流れは `create-offer` -> `ws open` -> `ws connect` -> `type: connect` -> `redirect` -> `ws close` -> `create-offer` -> `ws open` ... となる
- `redirect` フラグは `src/utils.ts` の `createSignalingMessage` の引数を経由して `type: connect` メッセージの `redirect: true` に使われている。この挙動は維持する必要がある

## 設計方針

- `signaling` に第 3 引数 `offer?: RTCSessionDescriptionInit` を追加する。指定時は `createOffer()` を呼ばずにその offer を `createSignalingMessage` に渡す。未指定時は従来どおり `createOffer()` を呼ぶ
- `signaling` 内 `ws.onmessage` の `type: redirect` 分岐から `signalingOnMessageTypeRedirect(message, offer)` に、`signaling` が生成または受け取った offer を渡す
- `signalingOnMessageTypeRedirect` は受け取った offer を `this.signaling(ws, true, offer)` に渡す。多段リダイレクトでも最初の offer が再利用される
- offer をインスタンス変数に保持する方式は、`disconnect` / `initializeConnection` でのクリア漏れにより前回接続の offer を使い回す危険があるため採用しない。接続試行のライフサイクル内に閉じるため、`signaling` の引数として引き回す
- 初回 connect の `createOffer` の実行タイミング、旧 WebSocket のハンドラ解除と `close`、`getSignalingWebSocket(message.location)` の流れは変更しない
- 後方互換がある変更のため `CHANGES.md` の `## develop` に `[UPDATE]` エントリを追記する

## 完了条件

- `type: redirect` 受信後に `createOffer` が再実行されず、redirect 後の `type: connect` メッセージの `sdp` に最初の offer SDP が使われること
- redirect を挟む接続の timeline で `create-offer` が 1 回だけになること
- 初回接続 (redirect なし) では従来どおり `createOffer` が 1 回実行されること
- 多段 redirect でも offer が再利用されること
- `type: connect` メッセージの `redirect: true` の付与が維持されていること
- `pnpm test` / `pnpm typecheck` / `pnpm lint` が通ること
- `CHANGES.md` の `## develop` に `[UPDATE]` エントリが追記されていること

## テスト方針

- `type: redirect` は複数ノードの Sora クラスタが必要で、単一 Sora に対する現行の E2E テストでは再現できない。またモック / スタブ禁止の規約があるため、WebSocket を差し替えた単体テストも追加しない
- 主担保はコードレビューとする
  - `signaling` に offer が渡された場合に `createOffer()` が呼ばれないこと
  - `ws.onmessage` の redirect 分岐が `signaling` の offer を `signalingOnMessageTypeRedirect` に渡していること
  - `signalingOnMessageTypeRedirect` が受け取った offer を `signaling(ws, true, offer)` に渡していること
  - offer 未指定時は従来どおり `createOffer()` が呼ばれること
- 既存の `pnpm test` / `pnpm typecheck` / `pnpm lint` が回帰なく通ることを確認する
- クラスタ環境が利用できる場合は手動で確認する。redirect を挟む接続で timeline の `create-offer` が 1 回だけであること、redirect 後の `type: connect` の `sdp` が最初の offer と一致することを確認する
