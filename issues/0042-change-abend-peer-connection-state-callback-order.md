# `abendPeerConnectionState()` の発火順を `timeline` → `callback` に揃える

- Priority: Low
- Created: 2026-06-09
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/change-abend-peer-connection-state-callback-order
- Polished: {YYYY-MM-DD}

## 目的

`abendPeerConnectionState()` (`src/base.ts:609-663`) のみ `callbacks.disconnect` → `writeSoraTimelineLog` の順 (callback → timeline) で発火しており、他 3 系統 (`abend` / `shutdown` / `disconnect`) の `timeline → callback` 順と逆。4 系統の発火順を `timeline → callback` に揃える観測可能挙動の変更。

## 優先度根拠

Low。発火順を依存するアプリは稀。4 系統の一貫性を確保するための変更であり、観測上 callback と timeline の到達順が `abendPeerConnectionState` 経由のときだけ変わる。0030 (`runShutdownOnce` 4 系統冪等化リファクタ) の前提として 4 系統の発火順を揃えておく必要があり、本変更を **0030 着手前** にマージしておくことで 0030 を純粋なリファクタリングに保てる (リファクタリングなのに観測可能挙動が変わる、を避ける)。

## 現状

`src/base.ts:660-662`:

```ts
const event = this.soraCloseEvent("abend", title);
this.callbacks.disconnect(event);
this.writeSoraTimelineLog("disconnect-abend", event);
```

他 3 系統との順序対比 (`writeSoraTimelineLog` → `callbacks.disconnect`):

- `shutdown()` (`:707-711`): `writeSoraTimelineLog("disconnect-normal", event)` → `callbacks.disconnect(event)`
- `disconnect()` (`:1108-1112`): `writeSoraTimelineLog("disconnect-abend"/"disconnect-normal", event)` → `callbacks.disconnect(event)`
- `abend()` normal 分岐 (`:812-813`): `writeSoraTimelineLog("disconnect-normal", event)` → `callbacks.disconnect(event)`
- `abend()` abend 分岐 (`:817-818`): `writeSoraTimelineLog("disconnect-abend", event)` → `callbacks.disconnect(...)` (0041 で同 event 共有に修正後も順序は timeline → callback)

`abendPeerConnectionState()` のみが逆順。

## 設計方針

`:661` と `:662` の 2 行を入れ替える:

```ts
const event = this.soraCloseEvent("abend", title);
this.writeSoraTimelineLog("disconnect-abend", event);
this.callbacks.disconnect(event);
```

他の挙動変更は行わない:

- event 種別 (`abend`, title) は変更しない
- handler 剥がし / cleanup / `initializeConnection` の順序や内容は変更しない
- `ws.close()` 直呼び / `pc.close()` 直呼び (他 3 系統が `maybeClosePeerConnection` 経由なのに対し本メソッドは直呼び) は本 issue では触らない (0030 のスコープ外節を踏襲)

## 変更対象ファイル

| ファイル      | 内容                                               |
| ------------- | -------------------------------------------------- |
| `src/base.ts` | `:661-662` の 2 行を入れ替え (timeline → callback) |
| `CHANGES.md`  | `## develop` 直下に `[CHANGE]` を追記              |

E2E fixture / 新規 E2E は本 issue では追加しない。`abendPeerConnectionState()` は ICE 状態異常 (`:1691` / `:1698` / `:1714`) 経由でしか呼ばれず、Playwright から `pc.iceConnectionState` (readonly) を強制発火できないため決定的再現が困難。回帰検出はコードレビュー (`:661` の `writeSoraTimelineLog` が `:662` の `callbacks.disconnect` の前にあること) で担保する。

## テスト方針

- **コードレビュー担保 (主担保):** `:661` が `writeSoraTimelineLog`、`:662` が `callbacks.disconnect` の順になっていることをレビューで確認する
- **既存 E2E への回帰がないこと:** `pnpm e2e-test` が現状通り pass する

## 完了条件

- `src/base.ts:661-662` の発火順が `writeSoraTimelineLog` → `callbacks.disconnect` (timeline → callback) になる
- 他 3 系統 (`abend` / `shutdown` / `disconnect`) と発火順が統一される
- handler 剥がし / cleanup / `initializeConnection` 等、発火順以外の挙動は変わらない
- ローカルで `pnpm test` および `pnpm e2e-test` が通ること
- CHANGES.md `## develop` に次を追記する:

  ```
  - [CHANGE] abendPeerConnectionState() の発火順を他 3 系統と揃え timeline → callback の順にする
    - @voluntas
  ```

## マージ順

- 依存: なし (0021 / 0009 / 0031 / 0041 への依存なし)
- 0030 (`runShutdownOnce` 4 系統冪等化リファクタ) より**先**にマージする想定。0030 は本 issue で 4 系統の発火順が既に揃っていることを前提に、`runShutdownOnce` 経由で素直に統合できる
