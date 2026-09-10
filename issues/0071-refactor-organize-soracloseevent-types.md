# SoraCloseEvent 周辺の型情報を整理する

- Priority: Medium
- Created: 2026-09-10
- Completed: {YYYY-MM-DD}
- Branch: feature/refactor-organize-soracloseevent-types
- Polished: {YYYY-MM-DD}

## 目的

`disconnect` コールバックで渡る `SoraCloseEvent` (`src/types.ts`) の型情報を整理する。現状は `title` が `string` のままで、異常切断の `SoraAbendTitle` しか型が無い。正常切断の title (`"DISCONNECT"` / `"SHUTDOWN"`) と `params` の形が型に現れておらず、SDK 内部ではシグナリングの `reason` とイベントの `title` が同じ `title` という名前で混在している。これらを型で表現し、利用者と実装者の双方が値を取り違えないようにする。

## 優先度根拠

Medium。利用者向けの観測値は `disconnect()` の DataChannel 切断エラー (code 4999) 時の `event.title` のみが変わり、それ以外は型定義と内部引数名の整理に留まる。早急な修正が必要なバグではないが、`params` の実キーや title の値域が型に出ていないことで、切断周りの実装変更のたびに型安全性が効かない状態が続いているため、リリース前ではなくても優先的に整理しておく。

## 現状

### `SoraCloseEvent.title` が `string`

`SoraCloseEvent.title` は `string` で、異常切断の `SoraAbendTitle` は定義済みだが正常切断の title の型が無い。`src/base.ts` の `soraCloseEvent()` に渡る title は次のとおり。

- `"DISCONNECT"`: `soraCloseEvent("normal", ...)` を呼ぶ `disconnect()` の各正常経路、および `abend()` の `WEBSOCKET-ONCLOSE` で close code が 1000 / 1005 の場合
- `"SHUTDOWN"`: `shutdown()` の正常終了経路 (シグナリングの `type: disconnect` 受信、WebSocket onclose の close code 1000)
- `SoraAbendTitle`: `abend()` / `abendPeerConnectionState()` の各異常経路

### シグナリングの `reason` とイベントの `title` の混在

`src/base.ts` の `disconnectWebSocket` は `title: SoraAbendTitle | "NO-ERROR"` を取る。この引数は `type: disconnect` メッセージの `reason` に使う値であり、`SoraCloseEvent.title` とは別物だが名前が `title` で紛らわしい。また正常切断を表す番兵 `"NO-ERROR"` が異常切断の title の union に混ざっている。

なお GitHub 上で起票された元 issue が指す `disconnectDataChannel(title: SoraAbendTitle | "NO-ERROR")` は、現行コードでは `disconnectDataChannel()` が引数を持たず、同種の混在は `disconnectWebSocket` に移っている。本 issue では現行コードに合わせて `disconnectWebSocket` を対象にする。

### abend title にエラーメッセージが入る経路

`disconnect()` の `signalingSwitched === true` 経路で `disconnectDataChannel()` が `code: 4999` を返したとき、`soraCloseEvent("abend", result.reason, ...)` として `result.reason` をそのまま `title` に渡している。`result.reason` は `DisconnectWaitTimeoutError` / `DisconnectInternalError` / `DisconnectDataChannelError` の `message` (`"DISCONNECT-WAIT-TIMEOUT-ERROR"` / `"DISCONNECT-INTERNAL-ERROR"` / `"DISCONNECT-DATA-CHANNEL-ERROR"`) で、`SoraAbendTitle` の値ではない。原因の文字列は `event.reason` にも入っている。

### `params` が `Record<string, unknown>`

`SoraCloseEvent.params` と `SoraCloseEventInitDict.params` は `Record<string, unknown>`。実際に値が入るのは `abend("DATA-CHANNEL-ONERROR", { params: { label: channel.label } })` の `{ label: string }` のみで、実キーが型に現れていない。

## 設計方針

### 型定義 (`src/types.ts`)

以下を追加し、`SoraCloseEvent` / `SoraCloseEventInitDict` に適用する。

```typescript
// 正常切断時の title
export type SoraNormalCloseEventTitle = "DISCONNECT" | "SHUTDOWN";

// disconnect callback に渡る SoraCloseEvent.title 全体
export type SoraCloseEventTitle = SoraNormalCloseEventTitle | SoraAbendTitle;

// SoraCloseEvent.params に入る値
export interface SoraCloseEventParams {
  label?: string;
}
```

- `SoraCloseEvent.title: SoraCloseEventTitle` (現状の `string` から変更)
- `SoraCloseEvent.params?: SoraCloseEventParams`
- `SoraCloseEventInitDict.params?: SoraCloseEventParams`

`SoraCloseEventTitle` / `SoraNormalCloseEventTitle` / `SoraCloseEventParams` は `src/sora.ts` の `export type` 群に追加し、利用者が title / params を判別できるようにする。

### イベント生成 (`src/base.ts` の `soraCloseEvent`)

`title` 引数を `string` から `SoraCloseEventTitle` に変更し、内部クラス `SoraCloseEvent` の `title` / `params` も上記の型に合わせる。

### シグナリング reason の分離 (`src/base.ts` の `disconnectWebSocket`)

引数名を `title` から `reason` に改名し、型を専用の型名 (`SoraDisconnectReason = SoraAbendTitle | "NO-ERROR"` など) にする。`"NO-ERROR"` がイベント title の union と混ざらないことを型名で示す。専用型は外部に公開する必要がないため `src/types.ts` に置くか `src/base.ts` のローカル型にするかは実装時に決める。

### code 4999 の abend title

`disconnect()` の `code: 4999` 経路は `title` を `"INTERNAL-ERROR"` に統一し、原因 (`result.reason`) は `event.reason` のみに残す。`"INTERNAL-ERROR"` は `SoraAbendTitle` に定義済みだが現状使用箇所が無い。サブ経路の判別は既存どおり `event.reason` で行うため、`e2e-tests/tests/disconnect_event_type.test.ts` (reason を検証している) への影響は無い。

## 完了条件

### コード変更

- [ ] `src/types.ts` に `SoraNormalCloseEventTitle` / `SoraCloseEventTitle` / `SoraCloseEventParams` を追加する
- [ ] `SoraCloseEvent.title` を `SoraCloseEventTitle`、`SoraCloseEvent.params` と `SoraCloseEventInitDict.params` を `SoraCloseEventParams` にする
- [ ] `src/sora.ts` から新規型を export する
- [ ] `src/base.ts` の `soraCloseEvent()` の `title` を `SoraCloseEventTitle` にする
- [ ] `src/base.ts` の `disconnectWebSocket()` の引数を `reason` に改名し、`"NO-ERROR"` をイベント title の union から分離する
- [ ] `disconnect()` の `code: 4999` 経路の `title` を `"INTERNAL-ERROR"` にし、原因を `event.reason` に残す

### 検証

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm lint` が通る
- [ ] `pnpm test` が通る
- [ ] `pnpm build` で `dist/sora.d.ts` に新規型が出力されることを確認する

### 変更履歴

- [ ] `CHANGES.md` の `## develop` に `[CHANGE]` として、`disconnect()` の DataChannel 切断エラー (code 4999) 時の `SoraCloseEvent.title` を `"INTERNAL-ERROR"` に変更し原因を `reason` に残す旨を追記する
- [ ] 型追加と内部引数名の変更は `### misc` の `[UPDATE]` として追記する

## 関連 issue

- **0031 (closed)**: `disconnect()` が DataChannel 切断エラー時の abend event を normal で上書きするのを修正した。その際、`result.reason` を `title` に渡す現状の実装と、統一はスコープ外とするコメントが入った
- **0022 (closed)**: `DisconnectWaitTimeoutError` などの `message` を `SoraCloseEvent.reason` に詰める前提を整えた
