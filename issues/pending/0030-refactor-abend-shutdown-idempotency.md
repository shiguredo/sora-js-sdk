# `abend()` / `abendPeerConnectionState()` / `shutdown()` / `disconnect()` 4 系統の冪等化リファクタ

- Priority: Medium
- Created: 2026-05-25
- Polished: 2026-06-09
- Model: Composer 2.5
- Branch: feature/refactor-abend-shutdown-idempotency

## 目的

0002 (closed) で `disconnect()` の再入ガード (`disconnectingPromise`) を入れたが、`abend()` (`src/base.ts:720-819`)、`abendPeerConnectionState()` (`src/base.ts:609-663`)、`shutdown()` (`src/base.ts:672-712`) は DataChannel `onerror` / ICE 状態変化 / `type: close` 等から並列に呼ばれ、`callbacks.disconnect()` が多重発火する同型問題を持つ。`disconnect()` を含む 4 系統を **`runShutdownOnce` 1 本** に集約して冪等化するリファクタリング。

本 issue が変える観測可能挙動は **「並列レース下で `callbacks.disconnect` を 1 回しか発火させない」一点のみ** (本 issue の本質)。それ以外の観測可能挙動 (event 種別・発火順・timeline ラベル・event の参照同一性・`pc.onicecandidate` 解除等) は現行のまま維持する。観測可能挙動を変える別目的の作業はすべて別 issue に分離してあり、本 issue は**それらすべてを先行マージ済の状態を前提に着手する** (本 issue 内で条件付き取り込みは行わない):

- `abend()` 818 行 event 二重生成バグ修正 → issue 0041 (bug)
- `abendPeerConnectionState()` の発火順を timeline → callback に揃える → issue 0042 (change)
- `disconnect()` の event 上書きバグ修正 → issue 0031 (bug)
- 切断系メソッドの `pc.onicecandidate = null` 追加 → issue 0009 (bug)

4 件すべての先行マージは**必須**。先行マージできない時点で本 issue は着手しない (条件分岐で本 issue が別目的の修正を取り込むと、`feature/refactor-` ブランチに bug fix がスニークインし「1 issue = 1 カテゴリ」原則を破る)。

行番号は 2026-06-09 時点の `src/base.ts` (2696 行)。実装着手時は grep で再確認すること (本 issue 全体)。

## 優先度根拠

Medium。SDK 内部状態の二重 `initializeConnection` やアプリ側の多重 `disconnect` callback は再接続事故に直結する。0002 は `disconnect()` 経路のみを冪等化し、残り 3 系統の race は手付かず。

## 現状

各系統の `callbacks.disconnect()` 発火位置と timeline 発火順 (0041 / 0042 マージ後を前提):

| メソッド                   | callback 発火行         | timeline 発火行 | 順序                | 呼び出し元                                         |
| -------------------------- | ----------------------- | --------------- | ------------------- | -------------------------------------------------- |
| `abendPeerConnectionState` | `src/base.ts:662`       | `:661`          | timeline → callback | ICE 状態異常 (`:1691`, `:1698`, `:1714`)           |
| `shutdown`                 | `src/base.ts:711`       | `:707-708`      | timeline → callback | `type: close` (`:1988`)、ws.onclose 1000 (`:1652`) |
| `abend`                    | `src/base.ts:813 / 818` | `:812 / 817`    | timeline → callback | DC `onerror` (`:2188`)、ws 異常 close 等           |
| `disconnect`               | `src/base.ts:1112`      | `:1108-1110`    | timeline → callback | DC `onclose` (`:2177-2182`) — 0002 で冪等化済      |

未冪等化の問題:

- 4 系統とも handler 剥がし + cleanup + `initializeConnection` + callback 発火が重複しており、`disconnect()` 以外には再入ガードがない

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
6. **sync 入口の 1 マイクロタスク遅延**: `shutdown` / `abendPeerConnectionState` の `work()` が sync でも `await work()` を介するため発火が次マイクロタスクになる。呼び出し元 (`signalingOnMessageTypeClose` / `monitorWebSocketEvent` / `monitorPeerConnectionState` 内 ICE 状態異常分岐) はいずれも直後に `this.pc` / `this.ws` を読まないため安全
7. **try/catch による例外吸収は observable contract の変更を伴うが許容する**。現コードの `disconnect()` (`:1062-1117`) には catch がなく `work()` 内例外は呼出元へ向かって reject する。0030 マージ後は `trace("RUN SHUTDOWN ONCE UNCAUGHT", ...)` に変換されて `await sora.disconnect()` は resolve する。`shutdown()` / `abendPeerConnectionState()` も現状 catch なしで、内部例外は uncaught exception になる。**`work()` 内で意図的に throw する経路は現コードでは `abend()` の `await compressMessage()` reject のみ** (これは 0040 完了後に別 issue で扱うためスコープ外節で touch しないと明示済) で、他の handler 剥がし・close 系メソッドは throw しない API のため、reject / uncaught の到達可能性は事実上ゼロ。実害なしと判断して取り込む。観測可能挙動を変えない原則との不整合は「契約上の到達不能経路に限る」として許容する。**契約逸脱で例外が到達した場合の挙動**: catch で握り潰された場合、`work()` 内 cleanup が partial な状態 (例: `initializeConnection()` 未実行) で `shuttingDownPromise = null` が立ち、次回 `disconnect()` が新規 `work()` を走らせる。state 不整合の可能性は残るが、本 issue のスコープ外 (リカバリ機構の追加は別 issue。observable contract が壊れたケースなので、本来は throw した API を bug として直すのが筋)

### event 種別の決定 (mode 引数は持たない)

timeline ラベル (`disconnect-abend` / `disconnect-normal`) は `work()` が返す `event.type` から導出する。event は `work()` 戻り値で渡し、`runShutdownOnce` に `mode` 引数や事前計算する `decideEvent` 形式は持たせない (`disconnect()` の event が `disconnectDataChannel()` の結果に依存するため戻り値方式しか採れない)。並列 2 本目は `work()` を実行しないため event の競合は発生しない。

#### 「1 本目が勝つ」契約と normal 中の abend 取りこぼし

normal disconnect 走行中に abend が並列に来たとき、発火タイミングによって結末が分かれる:

- 1 本目が `await this.disconnectDataChannel()` (`:1087`) の `Promise.race` に入った後の DC `onerror` は、`disconnectDataChannel` 内で `{ code: 4999, ... }` を返し、0031 マージ後の `if/else` で abend event として通知される
- 1 本目が `Promise.race` に入る前のごく短時間に来た DC `onerror` は、2 本目 abend として走るが `shuttingDownPromise` ガードで弾かれる。1 本目は `code !== 4999` 経路で normal を返す → **abend が normal に吸収される (既知の妥協)**

後勝ち / 2 本目 work 追加実行は複雑性に見合わない (cleanup は 1 本目で完了するため)。

#### 各系統の `work()` が返す event

- `abend()`: `title === "WEBSOCKET-ONCLOSE"` かつ `params?.code === 1000 || params?.code === 1005` のとき `soraCloseEvent("normal", "DISCONNECT", params)`、それ以外は `soraCloseEvent("abend", title, params)`。**0041 マージ後のコード** (`src/base.ts:810-818`、`event` 変数を timeline / callback で共有する形) と同等。`work()` 戻り値で event を 1 つ生成して `runShutdownOnce` に渡すことで参照同一性を維持する
- `abendPeerConnectionState()`: `soraCloseEvent("abend", title)`。**0042 マージ後** は呼び出し元側で発火順が `timeline → callback` に揃っているため、`runShutdownOnce` (timeline → callback 順) に素直に統合できる
- `disconnect()`: `signalingSwitched === true` 経路では 0031 で導入された if/else (`code === 4999` → `soraCloseEvent("abend", result.reason, { code, reason })` / それ以外 → `soraCloseEvent("normal", "DISCONNECT", result)`) をそのまま `work()` に転載する。`signalingSwitched === false` 経路では `disconnectWebSocket` 戻り値 `reason !== null` のとき `soraCloseEvent("normal", "DISCONNECT", reason)` を返し、`reason === null` のときは **event を null のまま返す** (0002 機構 2 = 1 回目完了後の late 再入を `initializeConnection` 済み状態で吸収する性質を維持する唯一のメカニズム)
- `shutdown()`: `soraCloseEvent("normal", "SHUTDOWN", params)`

他 3 系統 (`abend` / `abendPeerConnectionState` / `shutdown`) は cleanup で発火元ハンドラを剥がす / 置換するため late 再入経路を持たず、常に非 null の event を返す。各 work() の戻り値型は `Promise<SoraCloseEvent | null>` (`runShutdownOnce` シグネチャ整合のため `null` 許容で揃える)。

`SoraCloseEventType` は `"normal" | "abend"` の 2 値型 (`src/types.ts:490`) と定義されているが、`SoraCloseEvent` interface (`src/types.ts:483-488`) は `Event` 継承の `title` / `code` / `reason` / `params` のみ宣言で `type` プロパティを明示再宣言していない (`Event.type` は `string` のまま)。よって `runShutdownOnce` 内の `event.type === "abend"` は **型上の narrowing は `string` のまま**で、`else` 分岐が `"normal"` 確定であることは **契約上の保証** (`work()` が `soraCloseEvent("normal" | "abend", ...)` のみを生成する) に依存する。else if "normal" の追加チェックは契約に従って不要だが、契約逸脱に備えるならランタイム assert (`event.type === "normal"`) を入れても良い。

### `disconnect()` の `work()` 擬似実装 (0031 / 0002 機構 2 維持の統合擬似コード)

0031 / 0009 マージ後の `disconnect()` の `work()` は次のような形になる (現コード `:1062-1117` の IIFE 内本体を `work` 関数に押し出し、`work()` 戻り値で event を返すように変える):

```ts
const work = async (): Promise<SoraCloseEvent | null> => {
  this.clearPeerConnectionHandlers();
  // WebSocket の監視を止める
  if (this.ws) {
    this.ws.onclose = (event): void => {
      this.writeWebSocketTimelineLog("onclose", {
        code: event.code,
        reason: event.reason,
      });
    };
    this.ws.onmessage = null;
    this.ws.onerror = null;
  }

  let event: SoraCloseEvent | null = null;
  if (this.signalingSwitched) {
    // signalingSwitched === true: disconnectDataChannel の結果で event 種別を分岐 (0031 マージ済の if/else)
    const result = await this.disconnectDataChannel();
    if (result.code === 4999) {
      event = this.soraCloseEvent("abend", result.reason, {
        code: result.code,
        reason: result.reason,
      });
    } else {
      event = this.soraCloseEvent("normal", "DISCONNECT", result);
    }
    await this.disconnectWebSocket("NO-ERROR");
    this.maybeClosePeerConnection();
  } else {
    // signalingSwitched === false: 0002 機構 2 維持
    // disconnectWebSocket が null を返した経路では event を null のまま返し
    // late onclose の再入を `runShutdownOnce` で吸収する
    const reason = await this.disconnectWebSocket("NO-ERROR");
    this.maybeClosePeerConnection();
    // switched にはなっていないが dataChannel が存在する場合の掃除
    this.forceCloseDataChannels();
    if (reason !== null) {
      event = this.soraCloseEvent("normal", "DISCONNECT", reason);
    }
  }
  this.initializeConnection();
  return event;
};
return this.runShutdownOnce(work);
```

ポイント:

- `clearPeerConnectionHandlers()` 内に `pc.onicecandidate = null` (0009 マージ済) を含む
- `signalingSwitched === true` の `if/else` 構造は 0031 マージ済の if/else をそのまま転写
- `signalingSwitched === false` && `reason === null` のときだけ `event = null` を維持する (機構 2)
- timeline ログ出力と `callbacks.disconnect` の発火は `runShutdownOnce` 側で行うため、`work()` からは抜く

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
    // 0009 で 4 系統に追加済の onicecandidate 解除を共通化
    this.pc.onicecandidate = null;
  }
}
```

`signalingTerminate()` (`src/base.ts:586-602`) は本 issue では touch しない経路。0009 で signalingTerminate にも `pc.onicecandidate = null` が追加されているが、`signalingTerminate` 自体は `clearPeerConnectionHandlers` を呼ばない (`signalingTerminate` は connect-time クリーンアップで他のハンドラ剥がしを行わないため、共通化対象外)。

系統差 (ws ハンドラ・DC ハンドラ・close タイミング) は各 `work()` に残す:

| 系統                       | ws ハンドラ                              | DC ハンドラ・close                                                             | ws close                               | pc close                     |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------- |
| `disconnect`               | onclose ログ化、onmessage/onerror null   | `disconnectDataChannel` 経由 (`forceCloseDataChannels` で `onclose = null` 化) | `disconnectWebSocket("NO-ERROR")` 経由 | `maybeClosePeerConnection()` |
| `abend`                    | onclose ログ化、onmessage/onerror null   | DC.onclose ログ化、DC.onerror null、close()                                    | `disconnectWebSocket(title)` 経由      | `maybeClosePeerConnection()` |
| `abendPeerConnectionState` | onclose ログ化、onmessage/onerror null   | 同上                                                                           | `ws.close()` 直呼び (ws を null 化)    | `pc.close()` 直呼び          |
| `shutdown`                 | 触らない (Sora 側から既に閉じられた前提) | DC.onclose ログ化、close()                                                     | 触らない                               | `maybeClosePeerConnection()` |

共通化で `shutdown` が本来触らない ws を触る等の挙動変化を起こさないこと。`abendPeerConnectionState` の `ws.close()` 直 + `pc.close()` 直は現状維持 (スコープ外節を参照)。

## 変更対象ファイル

| ファイル                                               | 内容                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/base.ts`                                          | `runShutdownOnce` + `clearPeerConnectionHandlers` 追加、4 系統 refactor、`disconnectingPromise` 削除                                                                                                                                                                                                                                    |
| `e2e-tests/data_channel_signaling_only/index.html`     | `#disconnect-count` (hidden, 初期 0) を本 issue で追加。`#disconnect-event-type` / `#disconnect-event-reason` は 0031 で既に追加済のため本 issue では追加しない                                                                                                                                                                         |
| `e2e-tests/data_channel_signaling_only/main.ts`        | 0031 で追加された `on("disconnect")` ハンドラに count 増分 (`#disconnect-count` インクリメント) を追記。`window.connectionPublisher` 露出は **本 issue で新規導入** (`SoraClient.connection` の `ConnectionPublisher` 参照を `Window` 拡張型経由で晒す)。`disconnectWaitTimeout` URL クエリ受け取りは 0031 で導入済の経路をそのまま利用 |
| `e2e-tests/tests/disconnect_abend_idempotency.test.ts` | 新規。0002 で予定されていた `disconnect_reentrancy.test.ts` のシナリオ (明示的並列 `disconnect()`) も本ファイルに統合する (fixture セットアップを 2 ファイルで重複させるコストを避けるため)                                                                                                                                             |
| `CHANGES.md`                                           | `## develop` 配下の `### misc` セクション末尾に `[CHANGE]` を追記 (リファクタリングは shiguredo-changelog 規約上 `### misc` 配下、種別は `[CHANGE]`)                                                                                                                                                                                    |

## テスト方針

モック / スタブ禁止 (CLAUDE.md 規約)。**テストコード内のコメント / ログメッセージは日本語** (CLAUDE.md 規約)。決定的再現の可否で 2 群に分ける。

`disconnect_abend_idempotency.test.ts` のトップレベル (import 直後、test/describe 宣言の前) に共通型を置く (各 `page.evaluate` 内で再定義しない。`(window as any)` は使わない):

```ts
type ConnectionPublisherForTest = {
  disconnect: () => Promise<void>;
  // ConnectionBase の private soraDataChannels を E2E から見えるように型上アクセスする。
  // 本物の SDK では private 修飾子のため TypeScript 通常経路では参照不可。
  // E2E 用に Window 拡張型でキャストして晒す (fixture main.ts は as unknown as 二段キャストを使用)。
  soraDataChannels: Record<string, RTCDataChannel | undefined>;
};
type WindowForTest = {
  connectionPublisher: ConnectionPublisherForTest;
};
```

private フィールド (`soraDataChannels` は `src/base.ts:200` で `private` 宣言) の E2E 公開方針:

- **SDK 側 (`src/base.ts`) には公開メソッド (`getInternalDataChannels` 等) を追加しない** (観測可能挙動の変更を避ける)
- fixture (`e2e-tests/data_channel_signaling_only/main.ts`) 側で `(this.connection as unknown as { soraDataChannels: Record<string, RTCDataChannel | undefined> })` の二段キャストで private を覗き、`window.connectionPublisher = ...` で window 露出する
- テスト側はトップレベル型 `WindowForTest` 経由で型安全にアクセスする (`window as unknown as WindowForTest` も二段キャスト)

fixture は `data_channel_signaling_only` を使い、`switched` 完了後 (`#switched-status:not(:empty)` 待ち) に各シナリオを開始する。

### 決定的に E2E 化するシナリオ

#### シナリオ 1: 並列 abend (DataChannel `onerror` 同時発火)

```ts
await page.evaluate(() => {
  const w = window as unknown as WindowForTest;
  for (const key of ["signaling", "notify", "push", "stats"]) {
    w.connectionPublisher.soraDataChannels[key]?.dispatchEvent(new Event("error"));
  }
});
```

`dispatchEvent` で `onerror` が同期発火する想定。**ただしブラウザ実装によっては `RTCDataChannel.onerror` が `RTCErrorEvent` を期待し `new Event("error")` を無視するケースがあるため、E2E 着手前に Chromium で実発火を確認すること**。発火しない場合は `new RTCErrorEvent("error", { error: new RTCError({ errorDetail: "data-channel-failure" }) })` への切替を検討する。

**並列ガード検証としての限界 (重要)**: `dispatchEvent` は同期発火するため、ループ内 4 回連続 `dispatchEvent` は event loop に戻らずに連続実行される。1 本目 `dispatchEvent` で起動する handler が `await this.abend(...)` を呼ぶと、`abend()` の同期チャンク (handler 剥がしを含む) が **その場で完走**してから handler が suspend する。結果、2 / 3 / 4 つ目の `dispatchEvent` 時点では `DC.onerror = null` 化済で、そもそも handler が起動しない。よって `count = 1` の根拠は「並列ガードが効いた」ではなく「handler 剥がしが先勝ちした」可能性が高い。シナリオ 1 は本 issue の **並列ガード自体の検証としては best-effort** とし、主目的は「`runShutdownOnce` 統合後も `abend` 経路が正しく 1 回起動して abend event を返すこと」の回帰検出に位置付ける (event 種別と count = 1 の組み合わせ)。並列ガードの決定論的検証はシナリオ 3 で行う。

assert:

```ts
// 主 assert: dispatch 後に callback が 1 回起動し abend event を返したこと
await expect(page.locator("#disconnect-count")).toHaveText("1", { timeout: 5000 });
// 補助 assert: abend 経路を通って `work()` が abend event を返したこと (0031 で追加した #disconnect-event-type を使用)
await expect(page.locator("#disconnect-event-type")).toHaveText("abend");
```

`#disconnect-event-type === "abend"` は Chromium で `dispatchEvent` が `onerror` を実発火させる前提。Firefox / Safari で fail する場合は `RTCErrorEvent` 経由に切り替えるか、ブラウザ別に skip する。

#### シナリオ 2: normal disconnect 中の abend 割り込み

```ts
await page.evaluate(async () => {
  const w = window as unknown as WindowForTest;
  const p = w.connectionPublisher.disconnect();
  w.connectionPublisher.soraDataChannels.signaling?.dispatchEvent(new Event("error"));
  await p;
});
```

`disconnect()` 呼び出しから return までは同期 chunk で `shuttingDownPromise` 代入が完了するため、直後の `dispatchEvent` で起動する 2 本目 abend は確実に `shuttingDownPromise` ガードで弾かれる (= 「1 本目代入直後の割り込み」ケースの再現)。「1 本目 work 進行中 (`Promise.race` 突入後) の割り込み」を再現するには `await Promise.resolve()` を挟む必要があるが、いずれも結果は 1 本目が勝つため count = 1。

assert は `#disconnect-count === "1"` のみ。「1 本目が勝つ契約」の **count レベルでの決定論的検証** は `shuttingDownPromise` の同期ガードによりシナリオ 2 でも成立する (= シナリオ 3 と同じ機構 1 を踏む)。一方 event 種別はタイミング依存で normal / abend どちらにもなりうる (normal disconnect が先に進めば normal、abend 割り込みが先に進めば abend) ため assert しない。**event 種別の決定論的検証は本 E2E では不可能で、その部分のみ主担保は「コードレビューで担保するシナリオ」記載のチェック項目**。

#### シナリオ 3: 明示的並列 `disconnect()` (0002 機構 1 の回帰検出、安定確認が本体)

```ts
await page.evaluate(async () => {
  const w = window as unknown as WindowForTest;
  await Promise.all([w.connectionPublisher.disconnect(), w.connectionPublisher.disconnect()]);
});
```

2 本目 `disconnect()` は `runShutdownOnce` の同期 `if (shuttingDownPromise) return ...` で**1 本目と同一の Promise**を return するため、`Promise.all` は 1 本目完了で両方解決する。count = 1 の保証は work() が 1 回しか走らないことに依存する性質。

`disconnectWaitTimeout` を実 DC close 往復より短く設定する (URL クエリ経由、例 1000ms)。**目的は count 増分の早期化ではなく、Red パス (1 本目・2 本目とも timeout 経路で `code === 4999` 経由) を意図的に踏ませて回帰検出すること** (closed/0002 line 137-142 を踏襲):

- 短設定 → `Promise.race` は timeout 側に落ち、`disconnectDataChannel` が `{ code: 4999, ... }` を返す
- `runShutdownOnce` ガードが正しく効いていれば 2 本目は work しないため count = 1
- ガードが壊れていれば 2 本目も work して count = 2

assert は **`#disconnect-count === "1"` のみ**。event 種別は assert しない (0031 マージ後は `disconnectWaitTimeout` 短設定で timeout 経路だと `code === 4999` 経由で abend、close 先勝ちなら normal となりタイミング依存で固定できない)。

**安定確認が回帰検出の本体** (closed/0002 line 140 を踏襲): `await expect(...).toHaveText("1")` の後、`disconnectWaitTimeout` を超える時間にわたり count が `1` から動かないことを確認する。0032 整合のため `page.waitForTimeout` は使わない。`expect.poll(...).toBe("1")` は「最初に成功した時点で resolve」してしまい「保ち続けること」を担保できないため使わず、**`expect(...).toPass({ timeout, intervals })` で毎回 `toHaveText("1")` を assert** して「2 秒間 1 度も 2 にならないこと」を検証する:

```ts
await expect(async () => {
  await expect(page.locator("#disconnect-count")).toHaveText("1");
}).toPass({ timeout: 2000, intervals: [500] });
```

`toPass` は内部 assert が fail すると retry し、timeout までに 1 度でも `count !== "1"` を観測した瞬間に fail する。これにより遅延発火する 2 回目 callback (`forceCloseDataChannels` 経由の `code: 4999`) で count が 2 になる Red を確実に検出する。

`disconnectWaitTimeout` の値: `disconnectWaitTimeout = 1000ms` に対して `toPass` timeout を **2 倍以上** (例 2500ms) のマージンで設定する (1 本目 timeout 1000ms → 2 本目 timeout 1000ms で合計 2000ms 近辺に count = 2 が観測されるため境界ギリギリを避ける)。1000ms の選択根拠は「実 Sora との RTT (数百 ms オーダ) より長く取って 1 本目が timeout 経路を踏みやすくする」ためで、E2E 環境差で RTT が不安定なら 0031 と同じく `disconnectWaitTimeout = 0` (確実に timeout) に切り替えても良い。

### コードレビューで担保するシナリオ

E2E で決定的再現できない契約は PR レビュー時に以下を確認する:

- **「1 本目が勝つ」契約 (シナリオ 2 の主担保)**:
  - `runShutdownOnce` の `if (this.shuttingDownPromise) return ...` が `(async () => {})()` の代入より前にあり同期チェックとして機能していること
  - 2 本目以降の `work()` 引数は参照ごと捨てられ、呼ばれないこと
  - 1 本目 `work()` が returning した event がそのまま timeline / callback に渡ること
- **`abend("WEBSOCKET-ONCLOSE", { code: 1005 })` の normal event 分岐**: code 1005 (No Status Received) はクライアントから能動的に再現する手段がないため、`abend` の `work()` の `params?.code === 1005` 分岐が削除されていないことを確認
- **0002 機構 2 (late 吸収)**: `disconnect()` の `work()` の `else` 分岐 (`signalingSwitched === false`、現 `:1096-1104` 相当) で、`disconnectWebSocket` 戻り値 `reason === null` のとき `event = null` を維持し、`reason !== null` のときのみ `event = soraCloseEvent("normal", "DISCONNECT", reason)` を返す `if (reason !== null)` 構造が残ること
- **機構 1 (並列ガード) と機構 2 (late 吸収) の分離**: 並列は `runShutdownOnce` 内 `if (this.shuttingDownPromise) return ...` の同期チェックで、late 再入は `work()` 内の `event = null` 維持で吸収する。両者は時間的に重ならず (`finally` 内 `shuttingDownPromise = null` は `work()` await 完了 + timeline + callback すべての後)、混線しないこと
- **callback ハンドラ内からの再入**: アプリ側 `callbacks.disconnect` ハンドラ内で `sora.disconnect()` 等を再帰的に呼ぶケースは、`runShutdownOnce` IIFE 内 `try { ... } finally { shuttingDownPromise = null }` 構造により callback 完了前なら `shuttingDownPromise !== null` で確実にガードされ 1 本目と同一 Promise が返ること (callback 完了後の再入は `initializeConnection` 済み状態で機構 2 経由の null 吸収に乗ること)
- **`abendPeerConnectionState()` 経由の冪等化検証** (E2E 不可): Playwright から `oniceconnectionstatechange` を強制発火しても `pc.iceConnectionState` (readonly) が変わらず `monitorPeerConnectionState` 内の ICE 状態異常分岐のガードを通らないため決定的再現不可能。`runShutdownOnce` ガードが `abendPeerConnectionState` 経由 (sync 入口 `void runShutdownOnce(...)`) でも効くことをコードレビューで確認する

## マージ順

着手前条件:

- **マージ済** (前提): 0001, 0002, 0003, 0005, 0006, 0011 (`issues/closed/`)
- **対応不要 close** (前提): 0004 (compress 関連は 0040 で機能検出方針に転換)
- **必須先行依存** (4 件すべて 0030 着手前にマージ済であること): 0041 / 0042 / 0031 / 0009

推奨マージ順 (必須先行依存の中の順序は自由、最後に 0030): `0009 / 0031 / 0042 / 0041 → 0030`。

必須先行依存と 0030 の関係 (条件分岐取り込みは行わず、すべて「マージ済の状態をそのまま転写する」):

| 依存 issue | 0030 との関係                                                                                                                                          | 0030 での取り込み方                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0041       | `abend()` 818 行の event 二重生成バグ修正。`work()` 戻り値で event を timeline / callback に共有する設計の前提                                         | 0041 マージ後の `:816-818` の構造 (`event` 変数共有) をそのまま `abend` の `work()` に転写する                                                                                                                                                      |
| 0042       | `abendPeerConnectionState()` の発火順を `timeline → callback` に揃える                                                                                 | 0042 マージ後は 4 系統がすべて `timeline → callback` 順になっており、`runShutdownOnce` に素直に統合できる                                                                                                                                           |
| 0031       | `disconnect()` の event 上書きバグ修正 (`src/base.ts:1088-1092`)。`disconnect` の `work()` 移植領域と完全に重なる                                      | 0031 マージ後の `if/else` (`code === 4999` → abend / それ以外 → normal) をそのまま `disconnect` の `work()` に転写する。E2E fixture の `#disconnect-event-type` / `#disconnect-event-reason` / `disconnectWaitTimeout` URL クエリ受け取りも既存利用 |
| 0009       | 切断系メソッドへの `pc.onicecandidate = null` 追加 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown` / `signalingTerminate` の 5 経路) | 0009 マージ後の 4 経路 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown`) の `onicecandidate = null` を `clearPeerConnectionHandlers` に集約。`signalingTerminate` 経路は本 issue で touch しないため 0009 の修正をそのまま残す     |

関連はあるが順序自由 (本 issue の実装領域に直接影響しないため、マージ順序は独立):

- 0007, 0008, 0021 (`ConnectError` constructor 関連、connect-time クリーンアップ経路)
- 0034 (`sendSignalingMessage` / `sendStatsMessage` の readyState ガード)
- 0040 (`Sora.getCapabilities()` 設計、`abend` の `compress === true` 分岐の reject 経路)

## 完了条件

- `abend()` / `abendPeerConnectionState()` / `shutdown()` / `disconnect()` がすべて `runShutdownOnce` 経由になる
- `private disconnectingPromise` が削除され `shuttingDownPromise` に rename される (`private` フィールド名変更で、契約上の観測可能挙動には影響しない)
- `callbacks.disconnect()` が単一の disconnect lifecycle (並列呼び出しを含む) において **1 回だけ** 発火する (4 系統のどの組み合わせで並列に走っても 2 回以上発火しない) — 本 issue 唯一の意図された観測可能挙動の変化
- `work()` が返す `event` を `runShutdownOnce` 内で timeline / callback の両方に渡し、0041 マージ済の参照同一性 (timeline と callback が同一 `SoraCloseEvent` インスタンス) を維持する
- 4 系統の `writeSoraTimelineLog` → `callbacks.disconnect` の発火順が timeline → callback で維持される (0042 マージ済の状態を `runShutdownOnce` 経由でも保つ)
- `abend` の `compress === true` 分岐 (`src/base.ts:759-779`) はそのまま `work()` 内に転載し改変しない
- `abend` の `work()` の `title === "WEBSOCKET-ONCLOSE"` かつ `params?.code` 1000 / 1005 の normal 分岐が維持される
- **0002 機構 2** (`disconnect()` `work()` の `signalingSwitched === false` 経路で `disconnectWebSocket` null のとき event を null のまま返し late `onclose` 再入を吸収する性質) が維持される (具体的なチェックは「コードレビューで担保するシナリオ」参照)
- 0031 マージ済の `disconnect()` 内 `if/else` (`code === 4999` の event 種別決定) が `disconnect` の `work()` 内に保持される
- 0009 マージ済の `pc.onicecandidate = null` が `clearPeerConnectionHandlers` 内に集約される (4 経路分。`signalingTerminate` 本体の `onicecandidate = null` は 0009 のスコープで 0030 では touch しない)
- E2E: `disconnect_abend_idempotency.test.ts` のシナリオ 1 / 2 / 3 がテスト方針セクション記載の assert で pass する
  - シナリオ 1: count + event 種別 (Chromium 想定。ブラウザ差で `dispatchEvent` が onerror を発火させない場合は `RTCErrorEvent` への切替か skip。並列ガード自体は best-effort、主目的は `runShutdownOnce` 統合後の abend 経路の回帰検出)
  - シナリオ 2: count のみ (event 種別は best-effort、主担保はコードレビュー)
  - シナリオ 3: count のみ + 安定確認 (`disconnectWaitTimeout` を超える時間 count が 1 を保つことを `expect.poll` で確認、並列ガード検証の本体)
- ローカルで `pnpm test` および `pnpm e2e-test` が通ること
- CHANGES.md `## develop` 配下の `### misc` セクション末尾に次を追記する。種別は `[CHANGE]` (shiguredo-changelog 規約で `[REFACTOR]` カテゴリは存在せず、機能影響のない内部実装変更は `### misc` 配下に置く運用):

  ```
  - [CHANGE] abend / abendPeerConnectionState / shutdown / disconnect の 4 系統を runShutdownOnce 経由に集約して冪等化し callbacks.disconnect の多重発火を防ぐ
    - @voluntas
  ```
