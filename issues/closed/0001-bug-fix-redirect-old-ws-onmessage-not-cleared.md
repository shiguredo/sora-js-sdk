# redirect / switched で旧 WebSocket のハンドラが解除されず新接続の状態が壊れる

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Completed: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-ws-onmessage-leak-on-handover

## 目的

`type: redirect` 受信時および `type: switched` (`ignore_disconnect_websocket: true`) 受信時に、旧 WebSocket のメッセージ系ハンドラを解除しないまま `ws.close()` を呼んでいる経路を塞ぐ。

- **redirect**: `onmessage` が未解除（`onclose` / `onerror` は解除済み）
- **switched (`ignore_disconnect_websocket: true`)**: `onmessage` と `onerror` の両方が未解除（`onclose` のみ解除済み）
- **switched (`ignore_disconnect_websocket: false`)**: ws が生存し続けるため `onmessage` / `onerror` 解除は不要・むしろ有害。本 issue の修正対象外

`ws.close()` だけでは close 完了前にキューに入った `MessageEvent` の dispatch は止まらない。旧 ws のハンドラが生存したまま追送メッセージが届くと、`signaling()` が載せた `onmessage` クロージャが再入し、新接続の `connectionId` / `sessionId` / `clientId` / `bundleId` 等を上書きしうる。switched 経路では post-connect で `onerror` に `abend("WEBSOCKET-ONERROR")` が載っているため、意図的な `close()` が `abend` を誘発しうる。

`abendPeerConnectionState` / `abend` / `disconnect` では本体で `onmessage = null` / `onerror = null` を行った後に、後続の `disconnectWebSocket()` 内で `ws.close()` している。handler 解除と close は 2 段階に分離しており、呼び出し元前提の設計である。redirect / switched だけ解除が抜けている。（参照: `src/base.ts:622-623` および `733-734`、`1071-1072` の handler 解除。close は `disconnectWebSocket` 内で行われる。）

## 優先度根拠

**redirect: High。** クラスタ運用では入口ノードが別ノードへ `type: redirect` を返す経路が通る。`signalingUrlCandidates` の件数に依存せず、入口 URL 1 件指定でも redirect は発生する。`await getSignalingWebSocket` / `await signaling` により race 窓が長い (`src/base.ts:2074-2075`)。

**switched (`ignore_disconnect_websocket: true`): 付随修正。** `signalingOnMessageTypeSwitched` 自体は `await` を持たないため新たな race 窓は開かないが、ハンドラ未解除自体が `abend` / `disconnect` と同型の欠陥である。`onerror` 未解除は意図的 `close()` で `abend` を誘発しうる。`data_channel_signaling_only` + `ignoreDisconnectWebSocket: true` の典型経路では post-connect 切替が前提。

修正は、race の決定論的再現がなくても正当である。WebSocket 仕様上、`close()` 進行中でもキュー済み `MessageEvent` の dispatch は成立しうる。

## 現状

connect 後も ping / update / re-offer / switched / redirect は **`signaling()` が connect 時に付けた単一 `ws.onmessage`** (`src/base.ts:1270-1309`) が処理する。`monitorWebSocketEvent()` (`src/base.ts:1626-1652`) は `onclose` / `onerror` のみ上書きし `onmessage` は触らない。connect 後 switched では `this.ws` が null になり `disconnect()` 経由では旧 ws に届かないため、修正挿入点は `signalingOnMessageTypeSwitched` 本体である。

`signalingOnMessageTypeRedirect` (`src/base.ts:2067-2072`):

```ts
if (this.ws) {
  this.ws.onclose = null;
  this.ws.onerror = null;
  this.ws.close();
  this.ws = null;
}
```

`signalingOnMessageTypeSwitched` の `ignore_disconnect_websocket: true` 経路 (`src/base.ts:2045-2052`、先頭に `if (!this.ws) return` ガードあり: 2042-2044):

```ts
if (message.ignore_disconnect_websocket) {
  if (this.ws) {
    this.ws.onclose = null;
    this.ws.close();
    this.ws = null;
  }
  this.writeWebSocketSignalingLog("close");
}
```

## スコープ外

`signalingTerminate()` (`src/base.ts:582-598`) — connect 失敗時の `ws.close()` のみで `onmessage` 未解除。これは connect 処理の Promise が reject 済みであり、追送メッセージが `signaling()` の `onmessage` を通じて `resolve()` を二重発行しても、Promise の二重解決は無視される。副作用として `signalingOnMessageTypeOffer` (`src/base.ts:1876-1910`) による `this.connectionId` / `this.clientId` / `this.bundleId` 等の値上書きは起こりうるが、connect 失敗時点でこれらの値は後続で使用されず実害はないため別 issue で扱う。

## 設計方針

**handler 解除順序（両経路共通）:** `onclose` → `onmessage` → `onerror` → `close()` → `this.ws = null`。

順序の根拠:

- `onclose` を最初に解除することで、`close()` による close イベント発火時に `signalingTerminate()` や `abend()` が再入するのを防ぐ
- `onmessage` を `onerror` より先に解除するのは、`close()` の副作用として error イベントが発火する可能性があるのに対し、message イベントはデータ到着時のみ発火するため、先に遮断するのが安全側である
- `abend` (`src/base.ts:733-734`) では `onmessage = null` → `onerror = null` の順だが、`abend` では `onclose` をログ専用ハンドラに差し替えるため `onclose` から始まる本件の順序とは状況が異なる。本件は `onclose = null`（差し替えではなく完全削除）である点が根本的な違いである

**redirect:** `signalingOnMessageTypeRedirect` 内、既存 `this.ws.onclose = null;` (2068) の直後に `this.ws.onmessage = null;` を追加する（既存 `onerror = null` はその下に残す）。修正後の最終形:

```ts
if (this.ws) {
  this.ws.onclose = null;
  this.ws.onmessage = null;
  this.ws.onerror = null;
  this.ws.close();
  this.ws = null;
}
```

**switched (`ignore_disconnect_websocket: true`):** 既存 `this.ws.onclose = null;` (2047) の直後に `this.ws.onmessage = null;` と `this.ws.onerror = null;` を追加する。修正後の最終形:

```ts
if (message.ignore_disconnect_websocket) {
  if (this.ws) {
    this.ws.onclose = null;
    this.ws.onmessage = null;
    this.ws.onerror = null;
    this.ws.close();
    this.ws = null;
  }
  this.writeWebSocketSignalingLog("close");
}
```

- **`onmessage = null` の置き場所:** redirect は `await getSignalingWebSocket` より前の同期部分で解除する。JS のシングルスレッド実行モデル上、redirect 分岐に入った invocation は `signalingOnMessageTypeRedirect` の同期部分（`onmessage = null` を含む）を実行しきってから `await` で中断する。したがって、同期部分の実行中に別の `message` イベントが割り込むことはない。outer `onmessage` 側に移すと中断後に解除が走り、解除前に届いた 2 件目を取りこぼす。
- **`onclose` 扱い:** redirect / switched では旧 ws の close イベントで `signalingTerminate()` や `abend()` を再入させないため `onclose = null` とする（`abend` / `disconnect` が `onclose` をログ専用ハンドラに差し替える点とは意図的に異なる）。
- **`onerror` 扱い:** redirect は connect 前で `monitorSignalingWebSocketEvent()` (`src/base.ts:1592-1614`) が `onerror` を付けうるため現行どおり `onerror = null` を維持。switched (`ignore_disconnect_websocket: true`) は connect 後で `monitorWebSocketEvent()` が `onerror = abend(...)` を付けているため `onerror = null` を追加する。

**設計限界:** JS のシングルスレッドモデルにより、`onmessage = null` の同期実行中に別の `message` イベントが dispatch されることはない。しかし、redirect 到着前に同 ws 上で `type: update` / `type: re-offer` 等の `await` を含むハンドラが実行中で中断している場合、そのハンドラが再開した時点で `this.ws` が null または新接続の ws に差し替わっている可能性がある。これは本修正以前から存在する競合であり、`signaling()` 内に `if (this.ws !== ws) return;` ガードを入れると新 ws の正規メッセージを捨てうるため、本 issue では対応しない。同様に `this.ws = ws` 設定 (`src/base.ts:1328`) より前に redirect を受信した場合の `if (this.ws)` ガードスルーも本修正では扱わない。また `disconnectWebSocket()` の `signalingSwitched` 分岐 (`src/base.ts:862-867`) も `close()` 前に `onmessage` / `onerror` を解除していないが、現状 `signalingOnMessageTypeSwitched` で `this.ws = null` 済みのため dead code であり、本 issue では修正しない。

## 関連 issue とマージ順

- **0009 → 0001 → 0008** の順でマージする。0009 が `connect()` の Promise ライフサイクルと `monitorSignalingWebSocketEvent` の分離を先行して行うため 0001 より先。0001 は `signalingOnMessageTypeRedirect` / `signalingOnMessageTypeSwitched` のみ変更する。
- 0008 (`signaling()` 内 `ws.onmessage` 全体の例外ハンドリング): 編集箇所が重なるため 0001 後にマージ。0008 未マージ時の redirect 経路例外伝播は 0008 側で扱う。
- 0011 (timer 孤児化): 編集箇所・症状が異なり並行対応可能。0001 単独マージ後も connect 中 WS 監視競合は 0011 未修正なら残る。
- 0003 (switched 後 re-offer の DataChannel 同名上書き): 0001 修正後も残る別バグ。

## 変更対象ファイル

| ファイル      | 内容                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/base.ts` | `signalingOnMessageTypeRedirect` に `onmessage = null` 1 行、switched 経路に `onmessage` / `onerror` null 化 |
| `CHANGES.md`  | `## develop` に FIX 追記                                                                                     |

旧 ws から遅延到着した offer / notify 等を処理しなくなるのはバグ修正として意図した挙動変更。`callbacks.signaling` / `callbacks.notify` / `callbacks.connected` 等で旧 ws 由来追送が届かなくなる点は観測可能な挙動変更だが API 破壊ではない。

## 完了条件

- `signalingOnMessageTypeRedirect` で `ws.close()` の前に `this.ws.onmessage = null` が追加されている（既存の `onerror = null` 維持）
- `signalingOnMessageTypeSwitched` の `ignore_disconnect_websocket: true` 経路で `ws.close()` の前に `this.ws.onmessage = null` と `this.ws.onerror = null` が追加されている
- handler 解除順序が設計方針どおり（`onclose` → `onmessage` → `onerror` → `close()`）
- ローカルで `pnpm test` および単一ノード Sora 向け `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する

  ```
  - [FIX] type: redirect 受信時に旧 WebSocket の onmessage ハンドラが解除されていなかったのを修正する
    - @voluntas
  - [FIX] type: switched (ignore_disconnect_websocket) 経路で旧 WebSocket の onmessage / onerror ハンドラが解除されていなかったのを修正する
    - @voluntas
  ```

**検証の限界:** このバグの回帰は既存テストでは検出できない。redirect 向け Playwright テストはリポジトリに無く、`tests/` は WebSocket ライフサイクル未カバー（モック禁止）。既存 `e2e-tests/tests/type_switched.test.ts` / `switched_callback.test.ts` は修正後も通ること（switched 処理経路を含むため）。修正の正しさはコードレビューと既存 E2E スモーク通過で担保する。redirect の自動テストが困難な理由は、2 ノード以上の Sora クラスタが必要であり、redirect の再現に非決定性があるためである。手動検証手順は `e2e-tests/redirect/README.md` に残すことを推奨する（完了条件外）。

**補足 — `contactSignalingUrl`:** 現状、redirect 後も `contactSignalingUrl` は入口 URL のままである (`src/base.ts:1330-1332`: `redirect` フラグが true の場合は `this.contactSignalingUrl = ws.url` がスキップされる) 。これは仕様であり本 issue の修正対象外だが、手動検証時に注意すること。

## 解決方法

`src/base.ts` の 2 箇所に `onmessage` / `onerror` の null 化を追加した:

1. `signalingOnMessageTypeRedirect` (2067-2072): `this.ws.onclose = null;` の直後に `this.ws.onmessage = null;` を追加
2. `signalingOnMessageTypeSwitched` (2045-2052) の `ignore_disconnect_websocket: true` 経路: `this.ws.onclose = null;` の直後に `this.ws.onmessage = null;` と `this.ws.onerror = null;` を追加

handler 解除順序は `onclose → onmessage → onerror → close()` で統一した。既存 `pnpm test` (2 files, 72 tests) が通過することを確認した。CHANGES.md `## develop` に FIX エントリを 2 件追記した。
