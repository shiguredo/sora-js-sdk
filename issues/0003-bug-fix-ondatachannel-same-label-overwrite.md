# `onDataChannel` で同名 label の DC を無条件に上書きし旧 DC のハンドラから誤って abend / disconnect が発火する

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-ondatachannel-same-label-overwrite

## 目的

`onDataChannel` (`src/base.ts:2116-2294`) が `this.soraDataChannels[dataChannel.label]` に新しい DC を無条件代入する (`src/base.ts:2121`)。既存 DC のハンドラ解除と close を行わないため、同一 `RTCPeerConnection` 上で同名 label の **別インスタンス** の `RTCDataChannel` が `ondatachannel` された場合、旧 DC オブジェクトに残った `onerror` / `onclose` / `onmessage` から遅延 dispatch され、`abend()` / `disconnect()` / 二重 re-offer 処理が走りうる。代入前に旧 DC のハンドラを null 化し close する。

## 優先度根拠

Medium。発火条件は「re-offer または `type update` (`src/base.ts:1944-1949`, deprecated だがコード上は生存) による SDP 再ネゴの結果、ブラウザが同名 label で **新しい DC インスタンス** を `ondatachannel` する」ことに依存する。Sora / ブラウザ双方の挙動依存で、リポジトリ内に再現手順・テストは無い。実害（誤 `disconnect` / `abend`）は大きいが、再現未確定のため Medium とする。再現が取れた時点で High 見直しを検討する。

redirect 経路 (`signalingOnMessageTypeRedirect` `src/base.ts:2064-2077`) では connect 中に完結し `soraDataChannels` 未生成のため本問題は発生しない。`type: switched` (`ignore_disconnectWebSocket: true`) 後の re-offer では同一 PC を維持するため **issue 対象になりうる** (0001 の WS ハンドラ漏れとは別問題)。

**注意:** 通常の re-offer では既存 negotiated DC が同一オブジェクトのまま維持され、2 回目 `ondatachannel` は **出ない** ことが多い。本 issue は論理上の防御ギャップであり、Sora 実運用で確定したバグではない。

## 現状

`src/base.ts:2121`

```ts
this.soraDataChannels[dataChannel.label] = dataChannel;
```

既存 channel があっても close せず、ハンドラを null 化せず代入で上書きする。代入は **ハンドラ登録 (2127-2293 行) より先** なので、上書き直後 map は新 DC、旧 DC は orphan になる。

主な副作用 (全 label 共通。signaling / notify / push / stats / rpc / `#...` ユーザ DC):

- `onerror` (`src/base.ts:2151-2158`) → `abend()` → `callbacks.disconnect`
- `onclose` (`src/base.ts:2144-2149`) → `disconnect()` → `callbacks.disconnect`
- `onmessage` (signaling label 等) → `signalingOnMessageTypeReOffer` / `signalingOnMessageTypeClose` 等

旧 DC インスタンスは map から外れるがハンドラは生きたまま。`onmessage = null` は dispatch 時に最新値を参照するため、null 化後の追送 MessageEvent は遮断できる (`close()` 前に null 化する)。

**本 fix では止まらない経路:**

- 旧 `onclose` / `onmessage` が **既に in-flight** (`await this.disconnect()` 実行中) の場合 → 0002 / 0030
- re-offer で旧 DC が先に close され、新 DC の `ondatachannel` より前に `onclose` → `disconnect()` が走る順序 → 本 fix (上書き直前 stale 処理) では救えない別クラッシュ経路

re-offer 入口: WebSocket (`src/base.ts:1283-1285`) と DataChannel signaling (`src/base.ts:2176-2177`)。いずれも `signalingOnMessageTypeReOffer` (`src/base.ts:1957-1962`) は同一 `this.pc` を使い回し、`soraDataChannels` をクリアしない。`SignalingReOfferMessage` は `sdp` のみ (`src/types.ts:169-172`) で `data_channels` 更新は無いため、初回 offer の `signalingOfferMessageDataChannels` を使い回す。

同型の正しいパターン: `forceCloseDataChannels` (`src/base.ts:911-921`) — `onerror` / `onclose` / `onmessage` null 化 → `close()`。共通化リファクタは本 issue スコープ外 (issue 0030 は abend / shutdown 等の **並列 shutdown 冪等化** であり、DC ハンドラ解除パターンの共通化は含まない)。

## 設計方針

`src/base.ts:2121` の代入直前に stale DC を処理する。順序は `forceCloseDataChannels` と同型: `onerror` / `onclose` / `onmessage` null 化 → timeline ログ → `close()` → map 代入。`onopen` / `onbufferedamountlow` は abend / disconnect を呼ばないため null 化対象外 (遅延 `onopen` で timeline が汚れる可能性は許容)。

```ts
const existing = this.soraDataChannels[dataChannel.label];
if (existing && existing !== dataChannel) {
  existing.onerror = null;
  existing.onclose = null;
  existing.onmessage = null;
  this.writeDataChannelTimelineLog("close-stale-data-channel", existing);
  if (existing.readyState !== "closed" && existing.readyState !== "closing") {
    existing.close();
  }
}
this.soraDataChannels[dataChannel.label] = dataChannel;
```

| 項目       | `forceCloseDataChannels` | 本 fix (stale close)       |
| ---------- | ------------------------ | -------------------------- |
| timeline   | 無                       | `close-stale-data-channel` |
| readyState | 未チェック               | closed / closing スキップ  |
| 対象       | 全 DC                    | 同名 1 本                  |

`existing === dataChannel` は self-close 防止。`writeDataChannelTimelineLog` は `close()` 前 (`RTCDataChannel.id` 等が close 後に null になりうるため)。`signalingOfferMessageDataChannels[label]` は本 issue では触らない。

0002 との関係: 本 issue は **orphan された旧 DC からの後続 dispatch** を遮断する。0002 未完了でも本 issue は独立に修正可能だが、**0003 単体 close では in-flight / 並列 `disconnect()` は残る**。

`signalingTerminate()` (`src/base.ts:582-588`) のハンドラ未解除は同族だが別 issue (本 issue スコープ外)。

## 完了条件

**§着手前を満たさない限り §実装に進まない。**

### 着手前（必須）

実機 Sora で re-offer / `type update` 経路により同名 label の `ondatachannel` が **2 回目** 発火する条件を探索する。調査候補: `dataChannelSignaling: true` + `ignoreDisconnectWebSocket: true` (`e2e-tests/data_channel_signaling_only/`)、RPC simulcast RID 切替 (`e2e-tests/tests/rpc.test.ts`)、spotlight 切替系 E2E。**signaling 以外の label も観測対象に含める。**

観測指標:

- timeline / trace で **同一 `label` の `ondatachannel` が 2 回** 出るか
- 2 回目の `RTCDataChannel` が **別オブジェクト** (`existing !== dataChannel`) か
- 誤 `disconnect-normal` / `disconnect-abend` が **旧 DC の `onclose` / `onerror` タイムスタンプ後** に出るか

再現できなければ SDK 修正前に `issues/pending/` へ移動し、試した Sora バージョン・機能設定・SDP / timeline ログを issue 末尾に追記する (その場合 CHANGES 追記・Completed は付けない)。

### 実装 (再現確認後のみ)

- 上記設計方針どおり `onDataChannel` (`src/base.ts:2116-`) に stale DC 処理を追加する
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること

### 検証 (再現が取れた場合のみ close)

- 再現手順を `e2e-tests/data_channel_signaling_only/README.md` (新規) に残す。記載項目: Sora バージョン、channel / 機能設定、期待 timeline イベント (`close-stale-data-channel`、誤 `disconnect-normal` / `disconnect-abend` の見分け)
- PR 説明に修正前後の `callbacks.disconnect` 誤発火有無を timeline ログで示す
- CHANGES.md `## develop` に次を追記する

  ```
  - [FIX] onDataChannel で同名 label の DataChannel を上書きする際に旧 DC のハンドラを解除し close するようにする
    - @voluntas
  ```

**検証の限界:** 再現不能のまま merge しても CI は green のまま fix の有効性は未検証。pending 分岐は必須ゲートとして機能させる。
