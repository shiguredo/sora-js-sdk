# 切断系 5 経路で `pc.onicecandidate` が解除されず Trickle ICE 由来の unhandled rejection を起こす

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-10
- Model: Opus 4.7
- Branch: feature/fix-onicecandidate-not-cleared

行番号は 2026-06-10 時点の `src/base.ts` (2696 行)。実装着手時は grep で再確認すること (本 issue 全体)。テスト方針 (PR レビューチェックリスト) は行番号でなく前行内容をアンカーとして書く。

## 目的

切断系メソッド `disconnect()` (`src/base.ts:1058-1119`)、`abend()` (`:720-819`)、`abendPeerConnectionState()` (`:609-663`)、`shutdown()` (`:672-712`) の 4 経路は pc の `ondatachannel` / `oniceconnectionstatechange` / `onicegatheringstatechange` / `onconnectionstatechange` の 4 ハンドラを null 化するが `onicecandidate` を残す。`signalingTerminate()` (`:586-602`) は pc ハンドラを一切 null 化しない。

切断処理の最中・完了後にローカル PeerConnection が non-null な Trickle ICE candidate を発火すると、`onicecandidate` ハンドラ (`:1551` で設定、async) が `await this.sendSignalingMessage(message)` (`:1568`) を呼ぶ (null candidate (`:1557-1558`) は `resolve()` のみで実害なし)。`sendSignalingMessage` (`:2334-2355`) は readyState チェックなしで送信し、DataChannel 経路 (`:2342` / `:2344`) なら CLOSING の `RTCDataChannel.send`、WebSocket 経路 (`this.ws !== null` 時、`:2352`) なら CLOSING/CLOSED の `this.ws.send` が `InvalidStateError` を同期 throw する。

`onicecandidate` ハンドラは async で戻り Promise を返すが、HTML Living Standard の event handler invocation アルゴリズム (§8.1.5.2) は `icecandidate` のような戻り値非使用 event type に対して handler の戻り値を破棄する。よってハンドラ内で同期 throw された例外は (a) ハンドラ内 try/catch がない、(b) 戻り Promise が破棄される、(c) `unhandledrejection` イベントが event loop へ漏れる、という順で外部監視 (Sentry 等) にノイズを送る。

5 経路すべてで `this.pc.onicecandidate = null` を設定して発火源を断つ。

## 優先度根拠

High と評価する根拠 (現状 High 評価は 0040 + 後続 issue が未マージである間限定。0040 + 後続 issue マージ後は Medium に下げて棚卸しする):

- **0034 で塞げない compress=true 経路への一次防衛**:
  - 0034 は `sendSignalingMessage` の compress=false 経路と WebSocket 経路にしか try/catch + readyState ガードを入れない (0034 設計方針)
  - compress=true の DataChannel 経路は 0040 (`Sora.getCapabilities()` 機能検出設計、polish 未完了) 完了後に立てる別 issue (本 polish 時点で番号未付与) でカバーされる予定で、それまで残る
  - `signalingSwitched === true` 後に Trickle ICE が DataChannel signaling 経路 + `signalingOfferMessageDataChannels.signaling?.compress === true` で発火した場合、0034 マージ後も `compressedMessage.send` が CLOSING の DataChannel で同期 throw → unhandled rejection になりうる。本 issue はこの経路の発火源を止める一次防衛
- **実装コストが極小**: 5 経路に 1 行追加するだけで回帰リスクが最小
- **`signalingTerminate` 経由でも実害発生経路を含む**: 後述の `signalingTerminate` セクション参照。connect 時のエラー経路でも `onicecandidate` 設定後に到達しうる

## 現状

`pc.onicecandidate` は `:1551` の `onIceCandidate()` 内 1 箇所のみで設定され、他に上書きする関数は無く、`src/base.ts` 全体で `this.pc.onicecandidate = null` はどこにも存在しない。

4 ハンドラ null 化ブロックは `disconnect()` `:1066-1071` / `abend()` `:723-728` / `abendPeerConnectionState()` `:612-617` / `shutdown()` `:675-680` にあるが、いずれも `onicecandidate` を含まない。`signalingTerminate()` は `if (this.pc) { this.pc.close(); }` (`:598-600`) のみで pc ハンドラ null 化を行わない。

`skipIceCandidateEvent: true` 指定時は `multiStream` 内 (`publisher.ts:94` / `subscriber.ts:78` / `messaging.ts:45`) で `onIceCandidate()` 自体が skip され `pc.onicecandidate` も設定されない (デフォルトは false、`src/base.ts:275`)。本 issue の修正はデフォルト (`skipIceCandidateEvent === false`) のケースで意味を持ち、`true` 指定時は no-op として安全。

## 設計方針

`pc.close()` または `maybeClosePeerConnection()` 呼び出しより前に `pc.onicecandidate = null` を追加する。既存 4 ハンドラ null 化ブロックは「切断後にハンドラを発火させない」共通目的の集約であり、同じ目的の `onicecandidate = null` を同ブロックに追加する (別の場所で個別管理しない)。

### 4 経路 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown`)

既存の 4 ハンドラ null 化ブロック (`if (this.pc) { ... }`) の **末尾** (`this.pc.onconnectionstatechange = null;` の直後) に `this.pc.onicecandidate = null;` を追加する:

```ts
if (this.pc) {
  this.pc.ondatachannel = null;
  this.pc.oniceconnectionstatechange = null;
  this.pc.onicegatheringstatechange = null;
  this.pc.onconnectionstatechange = null;
  this.pc.onicecandidate = null;
}
```

挿入位置を末尾とする根拠: (1) 既存 4 ハンドラは sync で内部 await を持たず順序による副作用はない、(2) 0030 マージ後の `clearPeerConnectionHandlers` (0030 設計方針) が末尾配置を前提とするため、ここで位置を確定しておくと 0030 マージ時の diff が最小になる。

これら 4 経路のうち `disconnect()` / `shutdown()` / `abend()` は `maybeClosePeerConnection()` 経由で閉じ (`disconnect()` `:1095` / `:1098`、`shutdown()` `:704`、`abend()` `:808`)、`abendPeerConnectionState()` のみ `pc.close()` を直接呼ぶ (`:657`)。いずれも null 化ブロックの直後から閉じ呼び出しまでに数十行の隔たりがあり、十分先行する。

### `signalingTerminate`

既存の `if (this.pc) { this.pc.close(); }` ブロック (`:598-600`) 内、`close()` の **前** に `this.pc.onicecandidate = null;` を追加する:

```ts
if (this.pc) {
  this.pc.onicecandidate = null;
  this.pc.close();
}
```

`close()` の前に置く根拠: W3C webrtc-pc 仕様の `close()` 手順は新規 operation の中断であり、close 同期チャンク以前に networking task source へ queue 済みの `icecandidate` イベントは依然として event loop により dispatch されうる (close 後 dispatch を仕様文面は禁止していない)。null 化を `close()` より前に置けば「close 同期チャンク以降 〜 null 化までの間に dispatch される icecandidate」のレースを完全に消せる。後ろに置くと close と null 化の間に dispatch が割り込んで `sendSignalingMessage` が呼ばれる窓が残る。

`signalingTerminate` は connect 中の以下 4 経路から呼ばれ、いずれも `onIceCandidate()` (`publisher.ts:95` / `subscriber.ts:79` / `messaging.ts:46`) が `onicecandidate` を設定した後に到達しうる:

- `signaling()` の `ws.onclose` (`:1275-1284`、`signalingTerminate()` 呼び出しは `:1282`)
- `monitorSignalingWebSocketEvent` の `ws.onclose` (`:1614-1623`、呼び出しは `:1621`)
- `monitorSignalingWebSocketEvent` の `ws.onerror` (`:1624-1629`、呼び出しは `:1627`)
- `setConnectionTimeout` の timeout コールバック (`:1730` の setTimeout、呼び出しは `:1743`)

`signaling()` の `ws.onclose` 経路は防御寄り。`monitorSignalingWebSocketEvent` の `setInterval` は `Promise.race` 開始と同時に走り、`this.ws = ws` (`:1343`) 後の最初の 100ms tick で `ws.onclose` を `:1614` で上書きする。`pc.onicecandidate` は `signaling()` resolve 後の `onIceCandidate()` 呼び出し時に設定されるため、`signaling()` 由来の `ws.onclose` が `pc.onicecandidate` 設定済の状態で発火しうるのは「`signaling()` resolve から `onIceCandidate()` 完了までが 100ms 未満で、その間に setInterval 初回 tick が走らない」という稀なケースに限られる。残り 3 経路は実害寄り (`onIceCandidate()` 後 〜 `Promise.race` resolve 前に `monitorSignalingWebSocketEvent` の上書き済 `ws.onclose` / `onerror` または `setConnectionTimeout` の timeout が走り、`signalingTerminate()` に到達しうる)。

## スコープ外

- `signalingTerminate` への他 4 ハンドラ (`ondatachannel` / `oniceconnectionstatechange` / `onicegatheringstatechange` / `onconnectionstatechange`) 追加: 他 4 ハンドラはいずれも sync で `sendSignalingMessage` を呼ばないため、close 後の発火でも throw せず unhandled rejection を起こさない。本 issue が塞ぎたい実害には該当しない。0030 でも `signalingTerminate` を `clearPeerConnectionHandlers` 統合の対象外と明示している (0030 line 229)
- `sendSignalingMessage` の readyState チェック欠落 (= send 側の防御): issue 0034 で扱う
- ハンドラ null 化の共通化 (`clearPeerConnectionHandlers` ヘルパ抽出): 0030 のリファクタで扱う

## 0034 との関係

0034 マージ後の compress=false / WebSocket 経路は `readyState !== "open"` で silent skip され unhandled rejection もログも出ないが、`onicecandidate` は close 後も dispatch され続け **無駄な microtask 起動** (`await sendSignalingMessage` の async entry まで毎回入って return) が残る。本 issue がこの無駄な microtask も解消する。

## 変更対象ファイル

| ファイル      | 内容                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/base.ts` | 5 経路 (`disconnect` / `abend` / `abendPeerConnectionState` / `shutdown` / `signalingTerminate`) に `this.pc.onicecandidate = null;` を 1 行追加 |
| `CHANGES.md`  | `## develop` の既存 `[FIX]` 群末尾 (`### misc` より前) に FIX エントリを追記                                                                     |

## 完了条件

- `disconnect()` / `abend()` / `abendPeerConnectionState()` / `shutdown()` / `signalingTerminate()` の 5 経路に `this.pc.onicecandidate = null;` を追加する (4 経路は既存 null 化ブロック末尾、`signalingTerminate` は `pc.close()` の前)
- ローカルで `pnpm test` および `pnpm e2e-test` が通ること
- 本 issue 専用の単体テスト / E2E は追加しない (理由は「テスト方針」参照)
- CHANGES.md `## develop` 直下の既存 `[FIX]` 群末尾 (`### misc` より前) に次を追記する (担当者行は 2 文字インデント)

  ```
  - [FIX] 切断系メソッド 5 経路で pc.onicecandidate を解除して Trickle ICE 由来の unhandled rejection を防ぐ
    - @voluntas
  ```

## テスト方針

- **単体テスト / E2E は追加しない**: モック禁止 (CLAUDE.md 規約) のため `RTCPeerConnection` を生成する単体テストは書けない。E2E も `connect()` resolve 時点 (`iceConnectionState === "connected"`) で host candidate はほぼ出尽くしているが srflx / relay の遅延発火や mDNS の遅延解決に依存し、発火タイミングが非決定的のため決定論的に踏めない。`window.addEventListener("unhandledrejection", ...)` フックも緑で回帰を保証しないため不採用
- **回帰の主担保はコードレビュー**: PR diff で次の 5 行が含まれることを `onconnectionstatechange = null;` および `pc.close()` を前行アンカーとして確認する (行番号は変動するので使わない):
  - `disconnect()` の 4 ハンドラ null 化ブロック内、`this.pc.onconnectionstatechange = null;` の直後に `this.pc.onicecandidate = null;`
  - `abend()` の同位置に `this.pc.onicecandidate = null;`
  - `abendPeerConnectionState()` の同位置に `this.pc.onicecandidate = null;`
  - `shutdown()` の同位置に `this.pc.onicecandidate = null;`
  - `signalingTerminate()` の `if (this.pc) { this.pc.close(); }` ブロック内、`this.pc.close()` の **前** に `this.pc.onicecandidate = null;` (本経路は 4 ハンドラ null 化ブロックを持たない設計のため、`pc.close()` を前行アンカーとする)
- **0030 マージ後の引き継ぎ**: 0030 で 4 経路分の `pc.onicecandidate = null` は `clearPeerConnectionHandlers()` に集約される。以後の回帰検出は `clearPeerConnectionHandlers()` 内に 5 ハンドラ全 null 化が揃っていることを確認する形に切り替わる (0030 のコードレビュー責務に統合)。`signalingTerminate()` 内の `pc.onicecandidate = null` は 0030 でも touch しない経路 (0030 line 229) なので、独立に存続を確認する

## マージ順

- **マージ済 (前提)**: 0021 (`ConnectError` constructor、`a293569f`)、0001 / 0002 / 0003 / 0005 / 0006 / 0011 (`issues/closed/`)
- **本 issue 自体は他 issue と独立に実装可能** (`ConnectError` も `clearPeerConnectionHandlers` も使わない 5 行追加。共通化は 0030 で扱う)
- **本 issue の後続 (順序自由、本 issue とは独立に着手可能)**: 0008 / 0007 / 0034
- **0030 への前進**: 0030 は 0009 / 0031 / 0042 / 0041 の 4 件すべてを必須先行依存に指定 (0030 line 13-20 の先行マージ前提 + line 373 の必須先行依存表)。本 issue マージ後さらに 0031 / 0042 / 0041 をマージしてから 0030 に進む
