# `disconnectWebSocket` が `null` を返すと `disconnect` callback が発火しない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-websocket-null-callback

## 目的

`disconnect()` の `signalingSwitched === false` 経路 (`src/base.ts:1086-1094`) で、`disconnectWebSocket` (`src/base.ts:858-908`) が `null` を返したとき、`event` が `null` のまま `if (event)` (`src/base.ts:1096`) を素通りして `callbacks.disconnect(event)` (`src/base.ts:1102`) が呼ばれない。`await connection.disconnect()` が解決して戻ったのにアプリ側の `on('disconnect')` ハンドラが 1 度も発火しない API 契約破壊を直す。

## 優先度根拠

High。null を返す経路は次の 2 つで、いずれも実運用で踏みうる:

- `disconnectWebSocket` line 870-872: `this.ws === null`。`connect()` が WebSocket 確立前に失敗してアプリ側が `catch` で `disconnect()` を呼ぶケース、または `disconnect()` を 2 回連続で呼ぶケース (issue 0002 の冪等化が入れば 2 回目はメモ化された Promise を待つだけなので「2 回目で本ケースを踏む」のは 0002 マージ後はほぼなくなる。が、`connect()` 失敗時のリカバリ disconnect は残る)
- `disconnectWebSocket` line 901-905: `readyState !== 1` (CONNECTING / CLOSING / CLOSED)。`connect()` の握手中にアプリが `disconnect()` を呼んだケース、`abend` 経由で ws.onclose が走って readyState が CLOSING/CLOSED になった後にアプリが追い打ちで `disconnect()` を呼ぶケース

`signalingSwitched === true` 経路 (`src/base.ts:1076-1085`) では `disconnectWebSocket` は line 862-868 で必ず null を返すが、`event` は `disconnectDataChannel` の結果 (line 1080-1082) で既に設定済みのため、本 issue の対象外。

`shutdown` (`src/base.ts:703`) / `abend` (`src/base.ts:807, 814`) / `abendPeerConnectionState` (`src/base.ts:656`) の callback 発火経路には同型問題はない (event は呼び出し側から渡される params や固定値で組み立てられ null になる経路がない)。

## 現状

`src/base.ts:1086-1094`

```ts
} else {
  const reason = await this.disconnectWebSocket("NO-ERROR");
  this.maybeClosePeerConnection();
  // switched にはなっていないが dataChannel が存在する場合の掃除
  this.forceCloseDataChannels();
  if (reason !== null) {
    event = this.soraCloseEvent("normal", "DISCONNECT", reason);
  }
}
```

`disconnectWebSocket` (`src/base.ts:858-908`) は次の経路で `null` を返す:

- line 870-872 (`this.ws === null`): `resolve(null)`
- line 901-905 (`readyState !== 1`): `this.ws.close(); this.ws = null; resolve(null)`

このいずれかで `reason === null` になると `if (reason !== null)` (1091) を素通りし、`event` は `null` のまま 1095 行の `initializeConnection()` に到達。1096 行の `if (event)` を素通りして `callbacks.disconnect` が呼ばれずに `disconnect()` 関数が resolve する。

設計上、`disconnect()` を await して戻ってきたアプリは `on('disconnect')` が発火することを期待しており、ここで callback が落ちると「disconnect 完了をどう検知すればよいか」が API 仕様から消える。

## 完了条件

- `signalingSwitched === false` 経路で `disconnectWebSocket` が null を返した場合でも、`callbacks.disconnect` がちょうど 1 回発火する
- 発火される `SoraCloseEvent` の `code` / `reason` は固定値 `{ code: 1000, reason: "NO-ERROR" }` を採用する。null を返す 2 経路 (`!this.ws` と `readyState !== 1`) は意味が異なる (前者は最初から ws が無い、後者は ws の状態が OPEN ではない) が、API 契約上はどちらも「ユーザー操作による正常切断」として扱う。経路の区別が必要になった場合は別途仕様検討する
- E2E テストとして `e2e-tests/sendrecv/main.ts` (もしくは `sendonly_audio` 等の既存ページ) で `callbacks.disconnect` の発火回数を hidden DOM (例: `#disconnect-count`) に出し、新規テスト `e2e-tests/tests/disconnect_after_connect_failure.test.ts` でわざと不正な `signalingUrlCandidates` を渡して `connect()` を失敗させ、その後 `disconnect()` を呼んで `#disconnect-count` が `1` になることを assert する。CONNECTING / CLOSING / CLOSED 全状態を網羅するテストは難しいため、最低 1 経路だけ assert
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] disconnect() で WebSocket が null や OPEN 以外の状態のときに disconnect callback が発火しなかったのを修正する
    - @voluntas
  ```
- 本 issue は issue 0002 (`disconnect()` 冪等化) の修正と同じ `disconnect()` 関数を編集するため、マージ順序を 0002 → 0005 とする。0002 が `disconnect()` 本体を async IIFE で包む変更を入れるため、本 issue は IIFE 内の `signalingSwitched === false` 分岐を編集する形で当てる

## 解決方法

`src/base.ts:1086-1094` の `signalingSwitched === false` 分岐を次の通り書き換える。

```ts
} else {
  const reason = await this.disconnectWebSocket("NO-ERROR");
  this.maybeClosePeerConnection();
  // switched にはなっていないが dataChannel が存在する場合の掃除
  this.forceCloseDataChannels();
  event = this.soraCloseEvent("normal", "DISCONNECT", reason ?? { code: 1000, reason: "NO-ERROR" });
}
```

`reason` が `null` のときは `{ code: 1000, reason: "NO-ERROR" }` を `soraCloseEvent` に渡す。`reason` の型は `{ code: number; reason: string } | null` で、`soraCloseEvent` の引数型 (`SoraCloseEventInitDict` で `{ code?: number; reason?: string; params?: Record<string, unknown> }`) と整合する。

issue 0002 のマージ後はこのブロックは async IIFE の中に入っているため、本 issue を当てる際は IIFE 内の対応ブロックを差し替える。
