# DataChannel `onclose` で `disconnect()` が並列実行され callback が多重発火する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-reentrancy

## 目的

`onDataChannel` (`src/base.ts:2144-2149`) が各 DataChannel の `onclose` に `await this.disconnect()` を設定しており、`disconnect()` に再入ガードがない。`disconnect()` が並列実行されると `callbacks.disconnect()` が複数回発火する。`disconnect()` を冪等化し、複数入口から同時に `disconnect()` が呼ばれても `callbacks.disconnect()` が 1 回しか呼ばれないようにする。

## 優先度根拠

High。`signalingSwitched === true` の DataChannel signaling 構成では、PeerConnection 切断やユーザー操作で `disconnect()` が短時間に複数回呼ばれうる。アプリ側で `callbacks.disconnect` を起点に再接続を組んでいると多重再接続を起こす。

観測的根拠: timeline ログで複数 DC 切断時に `disconnect-normal` が複数記録される (`writeSoraTimelineLog("disconnect-normal", ...)` `src/base.ts:1100`)。ただし `disconnect-normal` は `shutdown()` / `abend()` からも出るため、0002 主シナリオ単体の証明にはならない (0030 参照)。

## 現状

`src/base.ts:2144-2149`

```ts
dataChannelEvent.channel.onclose = async (event): Promise<void> => {
  const channel = event.currentTarget as RTCDataChannel;
  this.writeDataChannelTimelineLog("onclose", channel);
  this.trace("CLOSE DATA CHANNEL", channel.label);
  await this.disconnect();
};
```

`disconnect()` (`src/base.ts:1053-1104`) は再入ガードを持たない。

### 再入が成立する経路

**A. 明示的な並列 `disconnect()` (本 issue の E2E 主対象)**

`Promise.all([disconnect(), disconnect()])` や UI 二重クリック等。2 本目が 1 本目の `await disconnectDataChannel()` / `await disconnectWebSocket()` 中に入る。ガードなしでは `callbacks.disconnect()` が複数回発火する。

**B. `signalingSwitched === false` 経路での DC `onclose` 再入**

1. 1 周目が `await this.disconnectWebSocket("NO-ERROR")` (`src/base.ts:1087`) の `onclose` resolver 待ち (`src/base.ts:874-885`, `setTimeout(disconnectWaitTimeout)`) 中に、別 DC `onclose` から 2 周目 `disconnect()` が入る
2. 2 周目冒頭 (`src/base.ts:1063-1070`) で 1 周目の `this.ws.onclose` resolver をログ専用ハンドラに上書きする
3. 1 周目は timeout 経路 (`src/base.ts:899`) のみ resolve し、複数周 `callbacks.disconnect()` が走りうる
4. `forceCloseDataChannels` (`src/base.ts:917`) は `onclose = null` するため、**`forceCloseDataChannels` 通過後**の DC `onclose` 再発火は起きない

**C. `signalingSwitched === true` 経路で 2 本目 `disconnect()` が実際に走った場合**

1 周目 `disconnect()` が `disconnectDataChannel()` (`src/base.ts:930-1029`) に入った後、2 周目も `disconnectDataChannel()` に入ると、2 周目が 956 行で 1 周目の close 待ち `onclose` resolver を上書きする。1 周目は `disconnectWaitTimeout` 側に落ちうる。

**`pc.close()` 単独では再入を再現しにくい理由 (重要):**

JS は単一スレッド。1 本目 DC `onclose` → `disconnect()` → `disconnectDataChannel()` 冒頭 (951-968 行) で **全 DC の `onclose` を resolve 専用に差し替える**のは、1 周目 `disconnect()` の最初の `await` より前の同期処理である。2 本目以降 DC `onclose` がその後に dispatch される典型モデルでは、旧 `onclose` ( `disconnect()` 呼び出し) は既に差し替え済みで、**`pc.close()` だけでは parallel `disconnect()` にならない**。

`data_channel_signaling_only` fixture は `ignoreDisconnectWebSocket: true` のため switched 後 `this.ws === null` (`src/base.ts:2045-2050`)。経路 B の `ws.onclose` resolver 破壊は本 E2E では再現しない。

### 実害

- `callbacks.disconnect` の多重発火 (本 issue の主目的)
- 1 周目 `signalingSwitched === true` 処理中に 2 周目が `initializeConnection()` 経由で `signalingSwitched = false` (`src/base.ts:841`) にされ、分岐が混線する

「`disconnect()` 並列実行で `TypeError`」は現状コードではほぼ起きない (`if (this.pc)` / `if (this.ws)` 等のガードあり)。実害中心は上記 2 点。

### スコープ外

- `abend()` / `abendPeerConnectionState()` / `shutdown()` の多重 `callbacks.disconnect()` → issue 0030
- `disconnect()` 1078-1082 行の event 無条件上書き → issue 0031
- ユーザーが意図的に 1 回目完了後に再度 `disconnect()` を呼ぶ契約 → issue 0005
- `onclose` 内の `await this.disconnect()` 自体は変更しない

## 設計方針

`ConnectionBase` に `private disconnectingPromise: Promise<void> | null = null` を追加 (`src/base.ts:212` 付近、`disconnectWaitTimeout` と同セクション)。**0030 マージ時に `runShutdownOnce` へ置換され本フィールドは削除される** (中間 fix)。

`disconnect()` 冒頭で `if (this.disconnectingPromise) return this.disconnectingPromise;` を置く。IIFE 開始前、`clearMonitorIceConnectionStateChange()` や handler 剥がしより前。2 周目が `this.ws.onclose` を再設定する race を防ぐにはこの位置が必須。

`finally` で `disconnectingPromise = null` に戻し、`connect()` → `disconnect()` → `connect()` の繰り返しで 2 回目 `disconnect()` が新規実行できる。

1 回目完了後 (`initializeConnection` 済み) に late `onclose` が `disconnect()` を呼んでも、`event === null` のまま `if (event)` (`src/base.ts:1096`) を通らず callback は不発。これは意図どおり。

例外伝播: IIFE 内 reject なら全呼び出し側が同じ reject。`finally` で null 化するため 2 回目は新規実行可能。

`isDisconnecting` フラグ案は採用しない。`onclose` 内 `await this.disconnect()` があるため、後続呼び出しも同一 Promise を await する必要がある。

実装:

```ts
async disconnect(): Promise<void> {
  if (this.disconnectingPromise) {
    return this.disconnectingPromise;
  }
  this.disconnectingPromise = (async (): Promise<void> => {
    try {
      // 既存 disconnect() 本体 (1054-1103 行) をそのまま
    } finally {
      this.disconnectingPromise = null;
    }
  })();
  return this.disconnectingPromise;
}
```

**変更対象ファイル:**

| ファイル                                           | 内容                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `src/base.ts`                                      | `disconnectingPromise` 追加、`disconnect()` IIFE 化 |
| `e2e-tests/data_channel_signaling_only/index.html` | `#disconnect-count` (初期値 `0`) 追加               |
| `e2e-tests/data_channel_signaling_only/main.ts`    | disconnect カウンタ、`window` 露出、0031 統合       |
| `e2e-tests/tests/disconnect_reentrancy.test.ts`    | 新規                                                |
| `CHANGES.md`                                       | FIX 追記                                            |

## 完了条件

- `ConnectionBase` に `private disconnectingPromise: Promise<void> | null = null` が追加されている
- `disconnect()` 本体が async IIFE で包まれ、冒頭ガードが副作用より前、 `finally` で null 化される
- `e2e-tests/data_channel_signaling_only/index.html` に `#disconnect-count` (hidden, 初期 `0`) を追加
- `main.ts` で次を実装する
  - `this.connection.on("disconnect", ...)` で `#disconnect-count` を increment (`textContent = String(n)`)
  - `(window as unknown as { soraConnection: ConnectionPublisher | null }).soraConnection = this.connection` を `onSwitched` 後 (または connect 完了後) に設定。テスト終了時 / disconnect 後に `null` クリア
  - **0031 マージ済み**の `#disconnect-event-type` / `disconnectWaitTimeout` 設定と同一 `on("disconnect")` ハンドラに統合する (handler 二重登録禁止)
- 新規 `e2e-tests/tests/disconnect_reentrancy.test.ts`:
  - `data_channel_signaling_only` fixture、`checkSoraVersion` (2025.2.0+) は `switched_callback.test.ts` と同型
  - `#switched-status:not(:empty)` 待ち後、`page.evaluate(async () => { const c = window.soraConnection; if (!c) throw new Error("soraConnection missing"); await Promise.all([c.disconnect(), c.disconnect()]); })` で **明示的並列 disconnect** を再現
  - `expect(page.locator("#disconnect-count")).toHaveText("1", { timeout: 5000 })`
  - 修正前は `#disconnect-count` が `2` 以上になりうる (Red → Green 確認)
  - 5000ms 安定後 2 秒 `#disconnect-count` が増えないこと (任意)
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記 (0031 マージ後は 0031 エントリの直後)

  ```
  - [FIX] disconnect() が並列実行されたとき callbacks.disconnect() が複数回発火しないように冪等化する
    - @voluntas
  ```

**本 issue のスコープ:** `disconnect()` 経路のみ。ICE failed 二重発火等は 0030 未マージ時も残る。

**マージ順:** 0031 → 0002 → 0030。0002 は 0031 を PR に含めない。リポジトリ全体の順序は issue 0004 を正とする (0002 は 0004 チェーン内 `… → 0031 → 0002 → 0030`)。0005 は 0002 マージ後 (`0002 → 0005`)。
