# `signalingTerminate()` で `ws.onmessage` / `ws.onerror` が解除されず pre-offer reject 後に queue 済み message が漏れる

- Priority: Medium
- Created: 2026-06-10
- Polished: 2026-06-14
- Model: Opus 4.7
- Branch: feature/fix-signaling-terminate-leaks-ws-handlers

## 目的

`signalingTerminate()` (`src/base.ts`) は `this.ws.close()` を呼ぶだけで、`ws.onmessage` / `ws.onerror` を解除しない。一方、同じく接続を終了させる `abendPeerConnectionState()` および `abend()` (`src/base.ts`) は、明示的に `ws.onmessage = null` / `ws.onerror = null` し、`ws.onclose` のみログを吐く専用クロージャに置き換えている。`signalingTerminate()` だけが非対称な実装になっており、broken window 状態である。

実害として、pre-offer reject 経路 (issue 0008 で導入された `settleReject` 経由) で `signalingTerminate()` が呼ばれた後、WebSocket dispatcher の queue 済み message が `signaling()` 内で設定された `ws.onmessage` クロージャに届く。`settled === true` のため post-offer 扱いでログ `onmessage-exception-post-offer` のみだが、その途中で `signalingOnMessageTypeNotify` 経由で `callbacks.notify` がユーザに発火する。ユーザから見ると「`connect()` が reject したのに後から notify コールバックが来る」観測になる。

また、issue 0008 で導入された `src/base.ts` のコメント `// signaling() の Promise が resolve / reject 済みかを追跡するフラグ。` は厳密には誤りで、`ws.onclose` 経由の reject や `createSignalingMessage` 失敗時の素 reject では `settled` を更新しない。実態は「`ws.onmessage` 内例外の pre-offer / post-offer 判別フラグ」が正確なので、同時に修正する。

## 優先度根拠

Medium。`connect()` のハングや内部状態破壊は引き起こさないため致命的ではない。ただし以下の理由で放置すべきではない:

- `abendPeerConnectionState` / `abend` と挙動が非対称で broken window 状態
- pre-offer reject 後にユーザコールバック (`callbacks.notify`) が漏れる外部観測可能な不整合
- 修正は局所的 (3 行追加程度) で副作用が小さい

issue 0008 (High) のフォローアップとして、近い順序で対応するのが筋。

## 現状

### `signalingTerminate()` の実装 (`src/base.ts`)

```ts
private signalingTerminate(): void {
  for (const key of Object.keys(this.soraDataChannels)) {
    const dataChannel = this.soraDataChannels[key];
    if (dataChannel) {
      dataChannel.close();
    }
    delete this.soraDataChannels[key];
  }
  if (this.ws) {
    this.ws.close();
    this.ws = null;
  }
  if (this.pc) {
    // close() より前に置く: close() 後に queue 済みの icecandidate イベントが
    // dispatch されると sendSignalingMessage が CLOSING の ws/dc に send して
    // unhandled rejection を起こすため、発火源を先に断つ。
    // 他 4 ハンドラは sync で sendSignalingMessage を呼ばないためここでは null 化しない。
    this.pc.onicecandidate = null;
    this.pc.close();
  }
  this.initializeConnection();
}
```

`ws.close()` だけで `ws.onmessage` / `ws.onerror` / `ws.onclose` の解除がない。

### 既存の対称的な実装 (`abendPeerConnectionState` / `abend` の場合、`src/base.ts` 抜粋)

```ts
if (this.ws) {
  // onclose はログを吐く専用に残す
  this.ws.onclose = (event): void => {
    this.writeWebSocketTimelineLog("onclose", {
      code: event.code,
      reason: event.reason,
    });
  };
  this.ws.onmessage = null;
  this.ws.onerror = null;
}
```

`disconnect()` (`src/base.ts`) も同じ handler 解除パターンを採用している。
`shutdown()` は Sora からの正常終了を処理するメソッドで、呼ばれた時点では WebSocket は既に close 状態を前提としており、今回の対象外とする。

### pre-offer reject 後の問題経路

issue 0008 マージ後の `signaling()` 内 (`src/base.ts`) で:

1. pre-offer で `ws.onmessage` 内が throw する
2. catch で `settleReject(wrapped)` が呼ばれる → `settled = true`、`signalingTerminate()` 実行、`reject(error)`
3. `signalingTerminate()` は `ws.close()` を呼ぶが `ws.onmessage` は解除しない
4. WebSocket dispatcher の queue に残っていた message frame (例: `type: notify`) が、`ws.close()` 完了前に dispatch される
5. 同一 closure の `ws.onmessage` が呼ばれ、`settled === true` なので post-offer 分岐に入る
6. `signalingOnMessageTypeNotify` 経由で `callbacks.notify(message, ...)` がユーザに発火する
7. ユーザは「`connect()` が reject されたのに notify が後から来る」と観測する

`this.ws` は `signalingTerminate()` 内で null 化されているが、`ws.onmessage` クロージャは `signaling()` の Promise executor に閉じ込められた `ws` 変数を参照するため、`this.ws = null` の影響を受けず handler が生き続ける。

### コメント `settled` の精度問題

```ts
// signaling() の Promise が resolve / reject 済みかを追跡するフラグ。
let settled = false;
```

`settled` を `true` にする経路:

- OFFER 受信時、`resolve(message)` の直前
- REDIRECT 経路、`resolve(redirectMessage)` の直前
- `settleReject` 内 (pre-offer reject 時)

`settled` を更新しない reject 経路:

- `ws.onclose`: `reject(error)` するが `settled` を更新しない
- `createSignalingMessage` 失敗: 素 `reject` で `settled` を更新しない

したがって「Promise の settle 状況を完全に追跡している」わけではなく、`ws.onmessage` 内例外の pre/post-offer 判別フラグというのが実態。

## 設計方針

### 修正 1: `signalingTerminate()` で `ws.onmessage` / `ws.onerror` を解除する

`abendPeerConnectionState()` / `abend()` / `disconnect()` と同じパターンを採用する。`ws.onclose` は「ログ吐く専用」クロージャに置き換える案と、現状維持の案がある。

#### 案 A: `abendPeerConnectionState()` / `abend()` / `disconnect()` と完全に同じパターン

```ts
if (this.ws) {
  this.ws.onclose = (event): void => {
    this.writeWebSocketTimelineLog("onclose", {
      code: event.code,
      reason: event.reason,
    });
  };
  this.ws.onmessage = null;
  this.ws.onerror = null;
  this.ws.close();
  this.ws = null;
}
```

メリット: `abendPeerConnectionState()` / `abend()` / `disconnect()` と完全に対称になり、broken window が解消される。

懸念: `signalingTerminate()` は `signaling()` の Promise が settle される前に呼ばれることもある (issue 0008 の `settleReject` 経由)。pre-offer 中の `ws.onclose` は `signaling()` 内で設定された「reject する」クロージャだが、`settleReject` 内では `signalingTerminate()` の前に `settled = true` を立てるため、`signalingTerminate()` 内で `ws.onclose` を上書きしても問題ない (settleReject 自身がすでに reject 済み)。`ws.onclose` を上書きしないと、`ws.close()` 後に既存の `ws.onclose` が発火して二度目の `reject` (no-op) を呼ぶだけになる。どちらでも settle 結果は同じだが、ログを吐く専用クロージャに置き換える方が観測しやすい。

#### 案 B: `ws.onmessage` / `ws.onerror` のみ null 化、`ws.onclose` は現状維持

```ts
if (this.ws) {
  this.ws.onmessage = null;
  this.ws.onerror = null;
  this.ws.close();
  this.ws = null;
}
```

メリット: 変更を最小化し、`ws.onclose` 経路 (二度目の reject による no-op) を維持する。pre-offer reject 後の挙動は不変。

懸念: `abendPeerConnectionState()` / `abend()` / `disconnect()` と挙動が微妙に非対称 (broken window が完全に解消されない)。ただし「signaling() の Promise を確実に reject する」観点では現状の `ws.onclose` 経路を残す方が安全とも言える。

**推奨は案 A**。理由は (1) 既存の `abendPeerConnectionState()` / `abend()` / `disconnect()` と完全に対称にすることで broken window が解消する、(2) pre-offer reject 経路では `settleReject` が `signalingTerminate()` より先に `reject` 済みのため、`ws.onclose` を上書きしても settle 結果に影響しない。

### 修正 2: `settled` コメントの精度向上

```ts
- // signaling() の Promise が resolve / reject 済みかを追跡するフラグ。
+ // ws.onmessage 内例外を pre-offer / post-offer のどちらとして扱うかを判別するフラグ。
// ws.onmessage 内で発生した例外を pre-offer / post-offer で分岐させるために使う。
// Promise コールバック内 (ws.onmessage の外) で定義しないと毎呼び出しでリセットされる。
```

`ws.onmessage` 内例外の pre/post-offer 判別という実態を直接表現する。`ws.onclose` 経由の reject や `createSignalingMessage` 失敗時の素 reject では `settled` を更新しないことと整合する。

### 変更対象ファイル

| ファイル      | 内容                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| `src/base.ts` | `signalingTerminate()` で `ws.onmessage` / `ws.onerror` を解除。`settled` コメントを修正。 |
| `CHANGES.md`  | `## develop` の既存 `[FIX]` 群末尾、`### misc` より前に追記。                              |

## 完了条件

### コード変更

- [ ] `signalingTerminate()` (`src/base.ts`) で案 A を採用し、`ws.onmessage = null; ws.onerror = null;` を追加し、`ws.onclose` を `writeWebSocketTimelineLog("onclose", ...)` だけのクロージャに置き換える
- [ ] コメント `settled` を「`ws.onmessage` 内例外を pre-offer / post-offer のどちらとして扱うかを判別するフラグ」に修正する
- [ ] `abendPeerConnectionState()` / `abend()` / `disconnect()` の既存実装と整合する形にする (handler 解除パターン)

### 検証

- [ ] ローカルで `vp test` および `vp e2e-test` が通る (本修正は正常系の経路を変えないため非回帰確認のみ)
- [ ] 本 issue 専用テストは追加しない (`ws.onmessage` は `signaling()` 内ローカルクロージャで外部から差し替え不可能、CLAUDE.md「モックやスタブは絶対に利用しないこと」規約により単体検証不能)

### 変更履歴

- [ ] `CHANGES.md` `## develop` の既存 `[FIX]` 群末尾、`### misc` より前に追記する

  ```
  - [FIX] signalingTerminate() で ws.onmessage / ws.onerror が解除されず pre-offer reject 後に queue 済み message が漏れていたのを修正する
    - @voluntas
  ```

## スコープ外

- `disconnect()` の handler 解除パターン: 既に対称的に処理されており、変更不要
- `shutdown()` の WebSocket handler 解除: Sora からの正常終了時に呼ばれ、WebSocket は既に close 状態を前提としているため対象外
- `signalingTerminate()` 内の DataChannel 解除 (`src/base.ts`): 本 issue の対象外
- `pc.onicecandidate = null` の維持 (issue 0009 の対応): 変更しない
- `ws.send` 失敗系の handling (issue 0007 / 0034): 別 issue

## マージ順

issue 0008 (High、`signaling()` の `ws.onmessage` 例外で `connect()` が固まる修正) のフォローアップ。issue 0008 マージ後に対応する。0007 / 0034 と独立しており、マージ順の制約は緩い。
