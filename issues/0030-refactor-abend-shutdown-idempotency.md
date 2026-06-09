# `abend()` / `abendPeerConnectionState()` / `shutdown()` / `disconnect()` 4 系統の冪等化リファクタ

- Priority: Medium
- Created: 2026-05-25
- Polished: 2026-06-09
- Model: Composer 2.5
- Branch: feature/refactor-abend-shutdown-idempotency

## 目的

0002 (closed) で `disconnect()` の再入ガード (`disconnectingPromise`) を入れたが、`abend()` (`src/base.ts:720-819`)、`abendPeerConnectionState()` (`src/base.ts:609-663`)、`shutdown()` (`src/base.ts:672-712`) は DataChannel `onerror` / ICE 状態変化 / `type: close` 等から並列に呼ばれ、`callbacks.disconnect()` が多重発火する同型問題を持つ。`disconnect()` を含む 4 系統 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown`) を **`runShutdownOnce` 1 本** に集約して冪等化し、callback と timeline の発火順序も統一する。

行番号は 2026-06-09 時点の `src/base.ts` (2696 行)。実装着手時は grep で再確認すること (本 issue 全体)。

## 優先度根拠

Medium。SDK 内部状態の二重 `initializeConnection` やアプリ側の多重 `disconnect` callback は再接続事故に直結する。0002 (マージ済) は `disconnect()` 経路のみを冪等化し、残り 3 系統の race は手付かず。

## 現状

各系統の `callbacks.disconnect()` 発火位置と timeline 発火順:

| メソッド                   | callback 発火行         | timeline 発火行 | 順序                | 呼び出し元                                         |
| -------------------------- | ----------------------- | --------------- | ------------------- | -------------------------------------------------- |
| `abendPeerConnectionState` | `src/base.ts:661`       | `:662`          | callback → timeline | ICE 状態異常 (`:1691`, `:1698`, `:1714`)           |
| `shutdown`                 | `src/base.ts:711`       | `:707-708`      | timeline → callback | `type: close` (`:1988`)、ws.onclose 1000 (`:1652`) |
| `abend`                    | `src/base.ts:813 / 818` | `:812 / 817`    | timeline → callback | DC `onerror` (`:2188`)、ws 異常 close 等           |
| `disconnect`               | `src/base.ts:1112`      | `:1108-1110`    | timeline → callback | DC `onclose` (`:2177-2182`) — 0002 で冪等化済      |

既知のバグ (本 issue で同時修正):

- **`abend()` 818 行の event 二重生成**: `callbacks.disconnect(this.soraCloseEvent("abend", title, params))` が 1 つ上 (`:816`) で生成した `event` 変数とは別の新規 `SoraCloseEvent` インスタンスを引数にしている。timeline (`:817`) は `:816` の `event`、callback (`:818`) は別インスタンス
- 4 系統とも handler 剥がし + cleanup + `initializeConnection` + callback 発火が重複しており、`disconnect()` 以外には再入ガードがない
- **`abendPeerConnectionState` のみ callback → timeline の順**で他 3 系統 (timeline → callback) と発火順が逆。`runShutdownOnce` 統一でこの順序も timeline → callback に揃える

### 再現条件 (コードパス)

- **ICE failed 二重発火**: `iceConnectionState === "failed"` (`:1691`) と `connectionState === "failed"` (`:1714`) が短時間に両方走る → `callbacks.disconnect` 2 回。0006 マージ済で `iceConnectionState === "disconnected"` の 10 秒タイマー経路 (`:1698`) も復活している
- **abend 並列**: ws `onclose` + ws `onerror`、または複数 DC `onerror` がほぼ同時 → `abend()` 2 本目が cleanup を再実行
- **shutdown + abend 競合**: `type: close` と ws 異常 close が競合

### スコープ外 (本 issue では触らない範囲)

- `disconnect()` の event 上書き (`code === 4999` 後の無条件 normal 上書き) → issue 0031
- `abend()` の `compress === true` 分岐 (`src/base.ts:759-779`) の `await compressMessage()` reject 経路 → issue 0040 (`Sora.getCapabilities()` API 設計) で機能検出方針に転換。0004 は対応不要として close 済
- `signalingTerminate()` (`src/base.ts:586-602`) は `callbacks.disconnect()` を呼ばない connect-time クリーンアップ経路 → `runShutdownOnce` には統合しない
- `sendSignalingMessage` / `sendStatsMessage` の send 同期例外 + readyState ガード → issue 0034
- `sendAnswer` の `ws.send` 同期例外 → issue 0007
- `onicecandidate` の解除 → issue 0009
- `abendPeerConnectionState` の `ws.close()` 直呼び / `pc.close()` 直呼び (他 3 系統は `maybeClosePeerConnection` 経由) は**現状維持**。`maybeClosePeerConnection` への揃えは別 issue
- `callbacks.disconnect()` 自体のユーザコード throw → `runShutdownOnce` の IIFE 内 try/catch で握る (0002 と同等)。ただし型上 `(event: SoraCloseEvent) => void` のため async コールバックの reject は捕捉できない (0002 と同等の限界)
- `abend()` 内の `params?.code === 1000` 分岐 (`monitorWebSocketEvent` の `:1652` で `code === 1000` は `shutdown` 経路に振り分けられるため dead code) は冪等化リファクタの原則上、現コードと同等で transcribe する。dead code 整理は別 issue

各依存 issue の 0030 への取り込み方は「マージ順」セクションを参照。

## 設計方針

### 共通ヘルパー `runShutdownOnce`

現 `src/base.ts:216` の `private disconnectingPromise: Promise<void> | null = null` を削除し、4 系統の共通概念である「shut down」を冠した `shuttingDownPromise` に rename する:

```ts
private shuttingDownPromise: Promise<void> | null = null;
```

`runShutdownOnce` の擬似実装:

```ts
private runShutdownOnce(
  work: () => Promise<SoraCloseEvent | null>,
): Promise<void> {
  if (this.shuttingDownPromise) {
    return this.shuttingDownPromise;
  }
  this.shuttingDownPromise = (async (): Promise<void> => {
    try {
      const event = await work();
      if (event !== null) {
        if (event.type === "abend") {
          this.writeSoraTimelineLog("disconnect-abend", event);
        } else {
          this.writeSoraTimelineLog("disconnect-normal", event);
        }
        this.callbacks.disconnect(event);
      }
    } catch (error) {
      // Error 派生は message、それ以外は文字列化
      this.trace(
        "RUN SHUTDOWN ONCE UNCAUGHT",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      // 次回呼び出しのために必ず null 化する
      this.shuttingDownPromise = null;
    }
  })();
  return this.shuttingDownPromise;
}
```

挙動の要点:

1. **再入ガードは同期チェックが本体**。`(async () => {})()` は同期的に Promise を返し代入も sync chunk で完結するため、並列 2 本目は必ず非 null を観測する
2. **`work()` シグネチャは `() => Promise<SoraCloseEvent | null>` に統一**。sync で完結する系統 (`shutdown` / `abendPeerConnectionState`) も async ラッパで包む
3. **try 範囲は `await work()` と `callbacks.disconnect(event)` 両方**を含む。`work()` 内の例外も `callbacks.disconnect` の **同期 throw** も IIFE 内で握り、sync 入口 (`void runShutdownOnce(...)`) の unhandled rejection を防ぐ (`callbacks.disconnect` の型 `(event: SoraCloseEvent) => void` 通り同期想定。async コールバックを渡された場合の reject は捕捉できないが、これは 0002 と同等の契約挙動)
4. **戻り値**: sync 入口 (`abendPeerConnectionState` / `shutdown`) は `void`、async 入口 (`abend` / `disconnect`) は `return`
5. **boolean フラグは導入しない** (`shuttingDownPromise !== null` で判定可能)
6. **sync 入口の 1 マイクロタスク遅延**: `shutdown` / `abendPeerConnectionState` の `work()` が sync でも `await work()` を介するため発火が次マイクロタスクになる。呼び出し元 (`signalingOnMessageTypeClose` `:1988` / `monitorWebSocketEvent` `:1652` / `monitorPeerConnectionState` `:1691` `:1698` `:1714`) はいずれも直後に `this.pc` / `this.ws` を読まないため安全

### event 種別の決定 (mode 引数は持たない)

timeline ラベル (`disconnect-abend` / `disconnect-normal`) は `work()` が返す `event.type` から導出する。event は `work()` 戻り値で渡し、`runShutdownOnce` に `mode` 引数や事前計算する `decideEvent` 形式は持たせない (`disconnect()` の event が `disconnectDataChannel()` の結果に依存するため戻り値方式しか採れない)。並列 2 本目は `work()` を実行しないため event の競合は発生しない。

#### 「1 本目が勝つ」契約と normal 中の abend 取りこぼし

normal disconnect 走行中に abend が並列に来たとき、発火タイミングによって結末が分かれる:

- 1 本目が `await this.disconnectDataChannel()` (`:1087`) の `Promise.race` に入った後の DC `onerror` は、`disconnectDataChannel` 内で `{ code: 4999, ... }` を返し、0031 マージ後の `if/else` で abend event として通知される
- 1 本目が `Promise.race` に入る前のごく短時間に来た DC `onerror` は、2 本目 abend として走るが `shuttingDownPromise` ガードで弾かれる。1 本目は `code !== 4999` 経路で normal を返す → **abend が normal に吸収される (既知の妥協)**

後勝ち / 2 本目 work 追加実行は複雑性に見合わない (cleanup は 1 本目で完了するため)。

#### 各系統の `work()` が返す event

- `abend()`: `title === "WEBSOCKET-ONCLOSE"` かつ `params?.code === 1000 || params?.code === 1005` のとき `soraCloseEvent("normal", "DISCONNECT", params)`、それ以外は `soraCloseEvent("abend", title, params)`。現コード (`src/base.ts:810-818`) と同等
- `abendPeerConnectionState()`: `soraCloseEvent("abend", title)`
- `disconnect()`: 0031 マージ後の if/else (`code === 4999` → `abend(result.reason, { code, reason })` / それ以外 → `normal("DISCONNECT", result)`) をそのまま転載する。**0002 機構 2 (1 回目完了後の late 再入を `initializeConnection` 済み状態で吸収する性質) を維持するため、`signalingSwitched === false` && `disconnectWebSocket` が null を返した経路では event を null のまま返す** (null 返却の唯一の維持メカニズム)。0031 が未マージなら本 issue が 0031 修正も同時に取り込む
- `shutdown()`: `soraCloseEvent("normal", "SHUTDOWN", params)`

他 3 系統 (`abend` / `abendPeerConnectionState` / `shutdown`) は cleanup で発火元ハンドラを剥がす / 置換するため late 再入経路を持たず、常に非 null の event を返す。各 work() の戻り値型は `Promise<SoraCloseEvent | null>` (`runShutdownOnce` シグネチャ整合のため `null` 許容で揃える)。

### 4 系統への適用

| メソッド                   | 元コード                        | 新シグネチャ                      | 内部呼出形式                        |
| -------------------------- | ------------------------------- | --------------------------------- | ----------------------------------- |
| `disconnect`               | 0002 IIFE 内本体 (`:1062-1117`) | `(): Promise<void>`               | `return this.runShutdownOnce(work)` |
| `shutdown`                 | `:672-712`                      | `(params?): void`                 | `void this.runShutdownOnce(work)`   |
| `abendPeerConnectionState` | `:609-663`                      | `(title): void`                   | `void this.runShutdownOnce(work)`   |
| `abend`                    | `:720-819`                      | `(title, params?): Promise<void>` | `return this.runShutdownOnce(work)` |

シグネチャは変えず、呼び出し元への影響を最小化する。

### handler 剥がしの共通化

4 系統で完全に同一のブロックを `private clearPeerConnectionHandlers(): void` に切り出す:

```ts
private clearPeerConnectionHandlers(): void {
  this.clearMonitorIceConnectionStateChange();
  if (this.pc) {
    this.pc.ondatachannel = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.onicegatheringstatechange = null;
    this.pc.onconnectionstatechange = null;
    // 0009 マージ後は this.pc.onicecandidate = null を追加 (マージ順参照)
  }
}
```

系統差 (ws ハンドラ・DC ハンドラ・close タイミング) は各 `work()` に残す:

| 系統                       | ws ハンドラ                              | DC ハンドラ・close                                                             | ws close                               | pc close                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------- |
| `disconnect`               | onclose ログ化、onmessage/onerror null   | `disconnectDataChannel` 経由 (`forceCloseDataChannels` で `onclose = null` 化) | `disconnectWebSocket("NO-ERROR")` 経由 | `maybeClosePeerConnection()` |
| `abend`                    | onclose ログ化、onmessage/onerror null   | DC.onclose ログ化、DC.onerror null、close()                                    | `disconnectWebSocket(title)` 経由      | `maybeClosePeerConnection()` |
| `abendPeerConnectionState` | onclose ログ化、onmessage/onerror null   | 同上                                                                           | `ws.close()` 直呼び (ws を null 化)    | `pc.close()` 直呼び          |
| `shutdown`                 | 触らない (Sora 側から既に閉じられた前提) | DC.onclose ログ化、close()                                                     | 触らない                               | `maybeClosePeerConnection()` |

共通化で `shutdown` が本来触らない ws を触る等の挙動変化を起こさないこと。`abendPeerConnectionState` の `ws.close()` 直 + `pc.close()` 直は現状維持 (スコープ外節を参照)。

## 変更対象ファイル

| ファイル                                               | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/base.ts`                                          | `runShutdownOnce` + `clearPeerConnectionHandlers` 追加、4 系統 refactor、`disconnectingPromise` 削除                                                                                                                                                                                                                                                                                                                                           |
| `e2e-tests/data_channel_signaling_only/index.html`     | `#disconnect-count` (hidden, 初期 0) と `#disconnect-event-type` (hidden, 初期空) を追加。0030 が 0031 を取り込む場合は `#disconnect-event-reason` (hidden, 初期空) も同時追加。0031 マージ済の場合は本 issue では DOM 追加不要 (既存利用)                                                                                                                                                                                                     |
| `e2e-tests/data_channel_signaling_only/main.ts`        | `on("disconnect")` ハンドラ (count 増分 + event 種別の DOM 反映 + `__lastDisconnectEvent` 格納) と `on("timeline")` ハンドラ (`type === "disconnect-abend" / "disconnect-normal"` のみフィルタして `__lastTimelineEvent` 格納) を追加。`window.soraConnection` 露出 (private な `soraDataChannels` を含む内部参照を E2E 用に晒す)、`disconnectWaitTimeout` URL クエリ受け取り。既存 `switched_callback.test.ts` 等への影響がないことを確認する |
| `e2e-tests/tests/disconnect_abend_idempotency.test.ts` | 新規。0002 で予定されていた `disconnect_reentrancy.test.ts` のシナリオ (明示的並列 `disconnect()`) も本ファイルに統合する (fixture セットアップを 2 ファイルで重複させるコストを避けるため)                                                                                                                                                                                                                                                    |
| `CHANGES.md`                                           | `## develop` 直下の既存 `[FIX]` 群末尾 (`### misc` より前) に `[FIX]` を追記                                                                                                                                                                                                                                                                                                                                                                   |

## テスト方針

モック / スタブ禁止 (CLAUDE.md 規約)。**テストコード内のコメント / ログメッセージは日本語** (CLAUDE.md 規約)。決定的再現の可否で 2 群に分ける。

`disconnect_abend_idempotency.test.ts` のトップレベル (import 直後、test/describe 宣言の前) に共通型を置く (各 `page.evaluate` 内で再定義しない。`(window as any)` は使わない):

```ts
type SoraConnectionForTest = {
  disconnect: () => Promise<void>;
  soraDataChannels: Record<string, RTCDataChannel | undefined>;
};
type SoraCloseEventFields = {
  type?: string;
  code?: number;
  reason?: string;
  title?: string;
};
type WindowForTest = {
  soraConnection: SoraConnectionForTest;
  __lastTimelineEvent?: SoraCloseEventFields;
  __lastDisconnectEvent?: SoraCloseEventFields;
};
```

fixture は `data_channel_signaling_only` (`ignoreDisconnectWebSocket: true` && `dataChannelSignaling: true`) を使い、`switched` 完了後 (`#switched-status:not(:empty)` 待ち) に各シナリオを開始する。

### 決定的に E2E 化するシナリオ

#### シナリオ 1: 並列 abend (DataChannel `onerror` 同時発火)

```ts
await page.evaluate(() => {
  const w = window as unknown as WindowForTest;
  for (const key of ["signaling", "notify", "push", "stats"]) {
    w.soraConnection.soraDataChannels[key]?.dispatchEvent(new Event("error"));
  }
});
```

`dispatchEvent` で `onerror` が同期発火する想定。**ただしブラウザ実装によっては `RTCDataChannel.onerror` が `RTCErrorEvent` を期待し `new Event("error")` を無視するケースがあるため、E2E 着手前に Chromium で実発火を確認すること**。発火しない場合は `new RTCErrorEvent("error", { error: new RTCError({ errorDetail: "data-channel-failure" }) })` への切替を検討する。

count = 1 が保証されるのは `shuttingDownPromise` の同期ガードによる: 1 本目 `dispatchEvent` で `await this.abend()` が起動し、最初の同期 chunk で `shuttingDownPromise` が代入される。続く 2 / 3 / 4 つ目の `dispatchEvent` は handler 内で `await this.abend()` を起動するが、`runShutdownOnce` の同期 read で `shuttingDownPromise !== null` を観測して弾かれる。

assert:

```ts
await expect(page.locator("#disconnect-count")).toHaveText("1", { timeout: 5000 });
// シナリオ 1 では event 種別を assert する。dispatchEvent でハンドラが発火することが前提
await expect(page.locator("#disconnect-event-type")).toHaveText("abend");
```

`#disconnect-event-type === "abend"` は Chromium で `dispatchEvent` が `onerror` を実発火させる前提。Firefox / Safari で fail する場合は `RTCErrorEvent` 経由に切り替えるか、ブラウザ別に skip する。

#### シナリオ 2: normal disconnect 中の abend 割り込み

```ts
await page.evaluate(async () => {
  const w = window as unknown as WindowForTest;
  const p = w.soraConnection.disconnect();
  w.soraConnection.soraDataChannels.signaling?.dispatchEvent(new Event("error"));
  await p;
});
```

`disconnect()` 呼び出しから return までは同期 chunk で `shuttingDownPromise` 代入が完了するため、直後の `dispatchEvent` で起動する 2 本目 abend は確実に `shuttingDownPromise` ガードで弾かれる (= 「1 本目代入直後の割り込み」ケースの再現)。「1 本目 work 進行中 (`Promise.race` 突入後) の割り込み」を再現するには `await Promise.resolve()` を挟む必要があるが、いずれも結果は 1 本目が勝つため count = 1。

assert は `#disconnect-count === "1"` のみ。event 種別は best-effort で assert しない (タイミング依存で normal/abend どちらにもなりうる)。**「1 本目が勝つ契約」自体の検証は本 E2E では決定論的に保証できず、主担保は「コードレビューで担保するシナリオ」記載のチェック項目**。

#### シナリオ 3: 明示的並列 `disconnect()` (0002 機構 1 の回帰検出、安定確認が本体)

```ts
await page.evaluate(async () => {
  const w = window as unknown as WindowForTest;
  await Promise.all([w.soraConnection.disconnect(), w.soraConnection.disconnect()]);
});
```

2 本目 `disconnect()` は `runShutdownOnce` の同期 `if (shuttingDownPromise) return ...` で**1 本目と同一の Promise**を return するため、`Promise.all` は 1 本目完了で両方解決する。count = 1 の保証は work() が 1 回しか走らないことに依存する性質。

`disconnectWaitTimeout` を実 DC close 往復より短く設定する (URL クエリ経由、例 1000ms)。**目的は count 増分の早期化ではなく、Red パス (1 本目・2 本目とも timeout 経路で `code === 4999` 経由) を意図的に踏ませて回帰検出すること** (closed/0002 line 137-142 を踏襲):

- 短設定 → `Promise.race` は timeout 側に落ち、`disconnectDataChannel` が `{ code: 4999, ... }` を返す
- `runShutdownOnce` ガードが正しく効いていれば 2 本目は work しないため count = 1
- ガードが壊れていれば 2 本目も work して count = 2

assert は **`#disconnect-count === "1"` のみ**。event 種別は assert しない (0031 マージ後は `disconnectWaitTimeout` 短設定で timeout 経路だと `code === 4999` 経由で abend、close 先勝ちなら normal となりタイミング依存で固定できない)。

**安定確認が回帰検出の本体** (closed/0002 line 140 を踏襲): `await expect(...).toHaveText("1")` の後、`disconnectWaitTimeout` を超える時間 (例 2000ms) を `expect.poll` 等で待機し、再度 `await expect(page.locator("#disconnect-count")).toHaveText("1")` を assert する。0032 整合のため `page.waitForTimeout` は使わない。`expect.poll(async () => page.locator("#disconnect-count").textContent(), { timeout: 2000, intervals: [500] }).toBe("1")` で「2 秒間 count が 1 を保つこと」を担保する形が望ましい。これにより遅延発火する 2 回目 callback (`forceCloseDataChannels` 経由の `code: 4999`) で count が 2 になる Red を検出する。

### コードレビューで担保するシナリオ

E2E で決定的再現できない契約は PR レビュー時に以下を確認する:

- **「1 本目が勝つ」契約 (シナリオ 2 の主担保)**:
  - `runShutdownOnce` の `if (this.shuttingDownPromise) return ...` が `(async () => {})()` の代入より前にあり同期チェックとして機能していること
  - 2 本目以降の `work()` 引数は参照ごと捨てられ、呼ばれないこと
  - 1 本目 `work()` が returning した event がそのまま timeline / callback に渡ること
- **ICE failed 二重発火**: Playwright から `oniceconnectionstatechange` を強制発火しても `pc.iceConnectionState` (readonly) が変わらず `:1691` のガードを通らないため決定的再現不可能。`runShutdownOnce` ガードが `abendPeerConnectionState` 経由でも効くことを確認
- **`abend("WEBSOCKET-ONCLOSE", { code: 1005 })` の normal event 分岐**: code 1005 (No Status Received) はクライアントから能動的に再現する手段がないため、`abend` の `work()` の `params?.code === 1005` 分岐が削除されていないことを確認
- **0002 機構 2 (late 吸収)**: `disconnect()` の `work()` の `else` 分岐 (`signalingSwitched === false`、現 `:1096-1104` 相当) で、`disconnectWebSocket` 戻り値 `reason === null` のとき `event = null` を維持し、`reason !== null` のときのみ `event = soraCloseEvent("normal", "DISCONNECT", reason)` を返す `if (reason !== null)` 構造が残ること
- **機構 1 (並列ガード) と機構 2 (late 吸収) の分離**: 並列は `runShutdownOnce` 内 `if (this.shuttingDownPromise) return ...` の同期チェックで、late 再入は `work()` 内の `event = null` 維持で吸収する。両者は時間的に重ならず (`finally` 内 `shuttingDownPromise = null` は `work()` await 完了 + timeline + callback すべての後)、混線しないこと

### 同一値の assert (event 二重生成の回帰検出、シナリオ 1 内で実施)

`abend` 818 行二重生成バグの回帰検出は **シナリオ 1 内で実施** (event 種別が abend で確定するため二重生成の構造差分が観測しやすい)。fixture 側 `main.ts` で:

```ts
this.connection.on("timeline", (e) => {
  if (e.type === "disconnect-abend" || e.type === "disconnect-normal") {
    (window as unknown as WindowForTest).__lastTimelineEvent = e.data;
  }
});
this.connection.on("disconnect", (e) => {
  (window as unknown as WindowForTest).__lastDisconnectEvent = e;
});
```

をフックする。テスト側で:

```ts
const result = await page.evaluate(() => {
  const w = window as unknown as WindowForTest;
  return {
    sameRef: w.__lastTimelineEvent === w.__lastDisconnectEvent,
    timelineFields: w.__lastTimelineEvent,
    disconnectFields: w.__lastDisconnectEvent,
  };
});
expect(result.timelineFields).toEqual(result.disconnectFields);
if (!result.sameRef) {
  // timeline event と disconnect event の参照が一致しない (structuredClone が clone 成功した経路)
  console.warn(
    "__lastTimelineEvent と __lastDisconnectEvent の参照が一致しない (structuredClone 成功経路)",
  );
}
```

`createTimelineEvent` (`src/utils.ts:458-476`) は `event.data = structuredClone(data)` を試み、Event 派生 (= `SoraCloseEvent`) で `DataCloneError` を投げると catch (`:468-470`) で `data` 参照をそのまま格納する。**Chromium / Firefox の現行実装は Event 派生を clone 不可とする**ため、Chromium 環境 (E2E の主 target) では参照同一性が成立する。Safari は将来 expose されたとき soft assert に fallback。構造一致 (`type` / `code` / `reason` / `title`) は全環境で hard assert で 818 行二重生成バグの回帰検出能力を保つ。

## マージ順

着手前条件:

- **マージ済** (前提): 0001, 0002, 0003, 0005, 0006, 0011 (`issues/closed/`)
- **対応不要 close** (前提): 0004 (compress 関連は 0040 で機能検出方針に転換、`issues/closed/`)
- **残存 open 依存**: 0007, 0008, 0009, 0021, 0031, 0034 (リスコープ済)

推奨マージ順 (リリース管理上の推奨、厳密な線形依存ではない): `0021 → 0009 → 0008 → 0007 → 0034 → 0031 → 0030`。厳密な依存は 0007 / 0008 が 0021 (`ConnectError` constructor) に依存するのみ。

各 open 依存と 0030 の関係:

| 依存 issue | 0030 との関係                                                                                                                       | 取り込み方                                                                                                                                                                                                                                                                                                                                    | 前提依存                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0021       | `ConnectError` constructor シグネチャ確定。0030 の `disconnect` `work()` は `ConnectError` を生成しないため直接影響なし             | 0021 先行マージで signature が固まれば順序自由                                                                                                                                                                                                                                                                                                | なし                              |
| 0031       | 修正領域 (`disconnect()` `:1088-1092`) が `disconnect` `work()` 移植領域と完全に重なる                                              | 同一 PR でもよい。未マージなら 0030 が取り込む。CHANGES.md エントリは両方含める。0030 が 0031 を取り込む場合は fixture に `#disconnect-event-reason` も追加                                                                                                                                                                                   | なし                              |
| 0009       | 5 経路 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown` / `signalingTerminate`) に `pc.onicecandidate = null` 追加 | 0009 マージ後に取り込む (4 経路を `clearPeerConnectionHandlers` に集約、`signalingTerminate` は本 issue では触らない)。未マージで 0030 を先行する場合は `clearPeerConnectionHandlers` に追加しない。0030 単独で `pc.onicecandidate = null` が無くても新規 E2E は pass する (`onicecandidate` 遅延発火と本 issue の冪等化は独立した経路のため) | なし                              |
| 0034       | `sendSignalingMessage` / `sendStatsMessage` の send 同期例外 + readyState ガード。0030 の `work()` 内 cleanup 経路には触れない      | 順序自由                                                                                                                                                                                                                                                                                                                                      | なし                              |
| 0007       | `sendAnswer` の ws.send 同期例外 (connect-time)。`signalingTerminate` 経路を改修                                                    | 0030 は `signalingTerminate` 統合対象外のため順序自由                                                                                                                                                                                                                                                                                         | 0021 (`ConnectError` constructor) |
| 0008       | `signaling onmessage` 例外 hang (connect-time)。`signalingTerminate` 経路を改修                                                     | 同上                                                                                                                                                                                                                                                                                                                                          | 0021 (`ConnectError` constructor) |
| 0040       | `abend` の `compress === true` 分岐 (`:759-779`) の `compressMessage` reject 経路は 0040 完了後に別 issue で扱う                    | 0030 では現状維持                                                                                                                                                                                                                                                                                                                             | なし                              |

## 完了条件

- `abend()` / `abendPeerConnectionState()` / `shutdown()` / `disconnect()` がすべて `runShutdownOnce` 経由になる
- `private disconnectingPromise` が削除され `shuttingDownPromise` に rename される
- `callbacks.disconnect()` が単一の disconnect lifecycle (並列呼び出しを含む) において **1 回だけ** 発火する (4 系統のどの組み合わせで並列に走っても 2 回以上発火しない)
- 4 系統で `writeSoraTimelineLog` → `callbacks.disconnect` の発火順が timeline → callback に統一される (`abendPeerConnectionState` のみ現状で順序逆 → 揃える)
- `work()` が返す `event` で callback / timeline が同一 `SoraCloseEvent` インスタンスを使う設計になる (`abend()` 818 行の event 二重生成解消)
- `abend` の `compress === true` 分岐 (`src/base.ts:759-779`) はそのまま `work()` 内に転載し改変しない (0040 完了後に別 issue で扱う)
- `abend` の `work()` の `title === "WEBSOCKET-ONCLOSE"` かつ `params?.code` 1000 / 1005 の normal 分岐が維持される
- **0002 機構 2** (`disconnect()` `work()` の `signalingSwitched === false` 経路で `disconnectWebSocket` null のとき event を null のまま返し late `onclose` 再入を吸収する性質) が維持される (具体的なチェックは「コードレビューで担保するシナリオ」参照)
- 0031 マージ後の `disconnect()` 内 `if/else` (`code === 4999` の event 種別決定) が `disconnect` の `work()` 内に保持される (0031 マージ前なら本 issue が同時に取り込む)
- 0009 マージ後の `pc.onicecandidate = null` が `clearPeerConnectionHandlers` 内に追加される (0009 マージ前なら本 issue では追加しない。`signalingTerminate` 本体の `pc.onicecandidate = null` は 0009 のスコープで 0030 では触らない)
- E2E: `disconnect_abend_idempotency.test.ts` のシナリオ 1 / 2 / 3 がテスト方針セクション記載の assert で pass する
  - シナリオ 1: count + event 種別 (Chromium 想定。ブラウザ差で `dispatchEvent` が onerror を発火させない場合は `RTCErrorEvent` への切替か skip)
  - シナリオ 2: count のみ (event 種別は best-effort、主担保はコードレビュー)
  - シナリオ 3: count のみ + 安定確認 (`disconnectWaitTimeout` を超える時間 count が 1 を保つことを `expect.poll` で確認、回帰検出の本体)
- E2E: timeline event と disconnect callback event の構造一致 (`type` / `code` / `reason` / `title` 全フィールド一致) をシナリオ 1 内で hard assert、参照同一性は Chromium で成立する想定だが Safari 等での実装変更に備え soft check
- ローカルで `pnpm test` および `pnpm e2e-test` が通ること
- CHANGES.md `## develop` 直下の既存 `[FIX]` 群末尾 (`### misc` より前) に追記する。種別は `[FIX]` (`callbacks.disconnect` 多重発火という観測可能挙動の修正、818 行二重生成バグの修正を含む):

  ```
  - [FIX] abend / abendPeerConnectionState / shutdown / disconnect の 4 系統を冪等化し callbacks.disconnect の多重発火を防ぐ。さらに abendPeerConnectionState の発火順を callback → timeline から timeline → callback に揃え 4 系統の発火順を統一する
    - @voluntas
  ```
