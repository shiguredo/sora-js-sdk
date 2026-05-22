# DataChannel `onclose` で `disconnect()` が並列実行され callback が多重発火する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-disconnect-reentrancy

## 目的

`onDataChannel` (`src/base.ts:2144-2149`) が各 DataChannel の `onclose` に `await this.disconnect()` を設定しており、`disconnect()` に再入ガードがない。PeerConnection が close すると `signaling` / `notify` / `push` / `stats` / `rpc` および messaging 用の任意ラベル DataChannel (`#` から始まるラベル) が同時に `onclose` を発火し、`disconnect()` が並列に走って `callbacks.disconnect()` が複数回発火する。`disconnect()` を冪等化し、複数 onclose 同時発火でも `callbacks.disconnect()` が 1 回しか呼ばれないようにする。

## 優先度根拠

High。`signalingSwitched === true` で運用される DataChannel signaling 構成では、PeerConnection 切断 (ICE 切断、`pc.close()` 等) で WebRTC スタック側から複数 DC の `onclose` がほぼ同時に上がる。アプリ側で `callbacks.disconnect` を起点に再接続を組んでいると多重再接続を起こす。観測的根拠: `writeDataChannelTimelineLog("onclose", ...)` (`src/base.ts:2146`) と `writeSoraTimelineLog("disconnect-normal", ...)` (`src/base.ts:1100`) を Sora の timeline ログで確認すると、複数 DC 切断時に `disconnect-normal` イベントが複数記録される。

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

`disconnect()` (`src/base.ts:1053-1104`) は再入ガードを持たない。`signalingSwitched === true` で運用される DataChannel signaling 構成における race は次の通り。

1. 1 個目の DC `onclose` が `await this.disconnect()` を呼ぶ
2. `disconnect()` が `signalingSwitched === true` 分岐 (1076) に入り `await this.disconnectDataChannel()` (`src/base.ts:1077`) で最大 `disconnectWaitTimeout` ミリ秒 (デフォルト 3000) 待機する
3. 待機中、別の DC `onclose` が並列で `await this.disconnect()` を呼ぶ
4. 2 周目は冒頭の `if (this.ws)` (1063) で 1 周目が設定した `this.ws.onclose` ハンドラを再度ログ吐き専用に書き換え、1 周目の状態を破壊する。さらに 2 周目も `disconnectDataChannel` (`src/base.ts:930-1029`) に入って独自の待ち合わせを始める
5. `disconnect()` 末尾で `initializeConnection()` (`src/base.ts:820-848`) が `this.signalingSwitched = false` (841)、`this.soraDataChannels = {}` (836)、`this.ws = null` (831)、`this.pc = null` (832) などにリセットする
6. その後 1095 行で `this.initializeConnection()` を経て 1102 行で `this.callbacks.disconnect(event)` が複数回呼ばれる

`signalingSwitched === false` の経路では `disconnectDataChannel` を呼ばずに `forceCloseDataChannels` (`src/base.ts:1090`) で同期的に DC を閉じるが、1 周目が `await this.disconnectWebSocket("NO-ERROR")` (`src/base.ts:1087`) の中で `disconnectWebSocket` の `onclose` resolver (`src/base.ts:874-885`) を仕掛けて `setTimeout(disconnectWaitTimeout)` で待っている間に 2 周目が `disconnect()` を呼ぶと、2 周目の冒頭 (1063) で `this.ws.onclose` がログ吐き専用に上書きされ、1 周目の resolver が消える。1 周目は `setTimeout` のタイムアウト経路でのみ resolve され (899: `resolve({ code: 1006, reason: "" })`)、2 周目以降も同じ流れで全員が timeout を踏み、最終的に複数回 `callbacks.disconnect` が呼ばれる。`forceCloseDataChannels` は `dataChannel.onclose = null` (`src/base.ts:917`) で onclose を解除するため、`forceCloseDataChannels` 通過後の DC `onclose` 再発火は発生しない。

「`disconnect()` 並列実行で `TypeError` が出る」というシナリオは現状コードではほぼ起きない。`disconnect()` 内の各分岐は `if (this.pc)` (1056)、`if (this.ws)` (1063)、`if (this.signalingSwitched)` (1076) で null/falsy ガードされており、`disconnectDataChannel` (935)、`disconnectWebSocket` (870, 886, 895) も同様にガード済み。実害の中心は次の 2 つ。

- `callbacks.disconnect` が複数回発火する
- 1 周目が `signalingSwitched === true` 分岐の途中 (例えば `disconnectDataChannel` 内部の await 中) に `initializeConnection` で `signalingSwitched = false` にされると、2 周目以降が `signalingSwitched === false` 分岐に流れて意味的に誤った経路を走る

なお `disconnect()` 以外にも `callbacks.disconnect()` を発火する経路として `abend()` (`src/base.ts:716-815`)、`abendPeerConnectionState()` (`src/base.ts:605-659`)、`shutdown()` (`src/base.ts:668-708`) があり、それぞれ DC `onerror` (`src/base.ts:2155`)、ICE 状態変化 (`src/base.ts:1676, 1682, 1699`)、`type: close` (`src/base.ts:1972`) と ws.onclose 1000 (`src/base.ts:1637`) から呼ばれる。これら 4 系統 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown`) を統一する大規模リファクタは別 issue に切り出し、本 issue は `disconnect()` の再入ガードに限定する。`abend()` の並列発火 (DC `onerror` が複数同時発火) は同じ問題を持ち、 `abend` の冪等化はリファクタ issue で扱う。

過去の関連コミット `6b8034df disconnect が複数回呼ばれた場合に例外が起きないようにする` (2020-08-27)、`b6b39633 非同期のまま複数回 disconnect が呼び出された場合の対応を追加する` (2021-08-05) は、いずれも null ガードを増やして例外を抑える方針で、`callbacks.disconnect` 多重発火そのものは塞いでいない。本 issue は冪等化により多重発火を塞ぐ。

## 設計方針

`ConnectionBase` クラスに `private disconnectingPromise: Promise<void> | null = null` を追加し、`disconnect()` の冒頭でこのフィールドを参照する。`null` でなければ既存の Promise をそのまま返し、`null` であれば本処理を async IIFE で包んで実行し、IIFE の `finally` で `disconnectingPromise = null` に戻す。

`finally` で `null` に戻すことで、ユーザーが意図的に `connect()` → `disconnect()` → `connect()` → `disconnect()` と繰り返すシナリオで 2 回目の `disconnect()` が新規実行できる。1 回目の `disconnect()` が完了した直後 (= `initializeConnection` まで終わっている) に並列で残っていた DC `onclose` が `disconnect()` を呼んでも、`pc` / `ws` / `soraDataChannels` がすべて空になっているため `disconnect()` の各分岐が早期 return し実害がない。

例外伝播は既存挙動を保つ。IIFE 内で reject すれば呼び出し側全員が同じ reject を受ける。1 回目の `disconnect()` が throw した場合は `finally` で `null` に戻り、2 回目は新規実行可能となる。

`isDisconnecting` フラグ案は採用しない。フラグだけだと後続呼び出しが完了を待てず、`onclose` ハンドラ内で `await this.disconnect()` した後に「切断完了済み」の前提でアプリコードが続いてしまうと壊れる。Promise メモ化なら全呼び出し側が同じ Promise を待てる。

## 完了条件

- `ConnectionBase` に `private disconnectingPromise: Promise<void> | null = null` フィールドが追加されている (宣言位置は `disconnectWaitTimeout` (`src/base.ts:212`) 等の他 private field と同じセクション)
- `disconnect()` (`src/base.ts:1053-1104`) の本体全体 (`clearMonitorIceConnectionStateChange` の呼び出し以降、`callbacks.disconnect(event)` まで) が async IIFE で包まれ、IIFE の `finally` で `disconnectingPromise = null` に戻る
- `disconnect()` の冒頭ガード (`if (this.disconnectingPromise) return this.disconnectingPromise;`) が IIFE 開始前に置かれており、ハンドラ剥がし含めあらゆる副作用の前に return する
- `e2e-tests/data_channel_signaling_only/main.ts` で次の 2 点を仕込む。(a) `callbacks.disconnect` 内でカウンタを進める hidden DOM (例: `#disconnect-count`)。(b) `connect()` 完了時点で `connection.pc` を `window` に露出する (例: `(window as unknown as { soraPc: RTCPeerConnection }).soraPc = this.connection.pc;`)。`connection.pc` は ConnectionPublisher / ConnectionSubscriber の public プロパティではなく、export 側のラッパで露出処理が必要なので main.ts 側で対応する
- 新規テスト (例: `e2e-tests/tests/disconnect_reentrancy.test.ts`) で接続して `signalingSwitched === true` の状態にした後、`page.evaluate(() => (window as any).soraPc?.close())` で PeerConnection を強制 close して複数 DC の `onclose` を同時発火させ、`#disconnect-count` の textContent が `1` になることを assert する。`type: close` 経路は `shutdown()` を通り並列再入を再現しないため使わない
- CHANGES.md `## develop` に次のエントリを追記する。担当者行を必ず付ける
  ```
  - [FIX] DataChannel の onclose が複数同時に発火したときに disconnect() が並列実行されないように冪等化する
    - @voluntas
  ```
- 本 issue 着手前に `issues/SEQUENCE` から 2 連番採番して次の 2 件の issue 雛形 (タイトル・優先度・目的のみ) を `issues/` 配下に先に作成し、`issues/SEQUENCE` を +2 更新する。先行採番により本 issue 着手中の SEQUENCE 競合を避ける
  - `abend()` / `abendPeerConnectionState()` / `shutdown()` の冪等化と、4 系統を統一する大規模リファクタ
  - `disconnect()` 内の既存バグ「`result.code === 4999` で `event` に `abend` をセットした直後に無条件で `normal` で上書きする」(`src/base.ts:1078-1082`) の修正

## 解決方法

`src/base.ts` の `disconnectWaitTimeout` フィールド宣言の近く (`src/base.ts:212` 付近) に次のフィールドを追加する。

```ts
/**
 * disconnect() の冪等化用 Promise
 */
private disconnectingPromise: Promise<void> | null = null;
```

`src/base.ts:1053-1104` の `disconnect()` を次の通り書き換える。既存のコメント (`// callback を止める`、`// WebSocket の監視を止める`、`// onclose はログを吐く専用に残す`、`// DataChannel の切断処理がエラーの場合は event を abend に差し替える`、`// もう切断されている可能性が高いが一応止める`、`// switched にはなっていないが dataChannel が存在する場合の掃除`) はすべて保持する。

```ts
async disconnect(): Promise<void> {
  if (this.disconnectingPromise) {
    return this.disconnectingPromise;
  }
  this.disconnectingPromise = (async (): Promise<void> => {
    try {
      // 以下は既存の disconnect() 本体 (clearMonitorIceConnectionStateChange から callbacks.disconnect(event) まで) をそのまま入れる
    } finally {
      this.disconnectingPromise = null;
    }
  })();
  return this.disconnectingPromise;
}
```

冒頭ガード (`if (this.disconnectingPromise) return this.disconnectingPromise;`) は IIFE 開始前、`clearMonitorIceConnectionStateChange()` や `this.pc.ondatachannel = null` 等のハンドラ剥がしも含むあらゆる副作用の前に置く。2 周目が `this.ws.onclose` を再設定して 1 周目の `disconnectWebSocket` の resolver (`src/base.ts:874-885`) を破壊する race を完全に防ぐにはこの位置でなければならない。

`onclose` 内の `await this.disconnect()` (`src/base.ts:2148`) は変更しない。並列で同時に走った別 DC の onclose による呼び出しは 1 周目の `disconnectingPromise` を共有して同じ完了を待つ。ユーザーが意図的に再度呼んだ `disconnect()` (例えば `await sendrecv.disconnect(); await sendrecv.connect(...); await sendrecv.disconnect();`) は、1 周目完了時に `finally` で `null` に戻っているため新規実行できる。なお `finally` で `null` に戻った時点では `pc` / `ws` / `soraDataChannels` がすべて空のため、もし並列で残っていた DC `onclose` が直後に `disconnect()` を呼んでも各分岐が早期 return する。

`disconnect()` 内の既存バグ (`src/base.ts:1078-1082` の `event` 無条件上書き) は本 issue では扱わない。完了条件で先行採番した 2 件目の issue 雛形がこれに該当する。
