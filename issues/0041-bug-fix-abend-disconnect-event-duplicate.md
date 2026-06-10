# `abend()` で `callbacks.disconnect` に新規生成した SoraCloseEvent を渡しており timeline event と参照が一致しない

- Priority: Medium
- Created: 2026-06-09
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/fix-abend-disconnect-event-duplicate
- Polished: {YYYY-MM-DD}

## 目的

`abend()` (`src/base.ts:720-819`) の終端で `writeSoraTimelineLog` と `callbacks.disconnect` に**別インスタンスの `SoraCloseEvent`** が渡されている。timeline と callback で event の参照同一性が失われ、構造が同一であっても event を参照比較するアプリ / テストで誤検知を起こす。1 行修正で `:816` の `event` 変数を共有させる。

## 優先度根拠

Medium。`soraCloseEvent("abend", title, params)` は同じ引数で 2 回生成されているため、`type` / `code` / `reason` / `title` の値は同一になる。アプリが値で判定している限り実害は出ない。ただし「timeline / callback で同じ event 1 個」という暗黙の契約は壊れており、後続の issue 0030 (4 系統冪等化リファクタ) の `runShutdownOnce` 共通化でも前提となる構造的バグ。0030 を待たず先行修正可能。

## 現状

`src/base.ts:810-819` の abend 系統終端:

```ts
if (title === "WEBSOCKET-ONCLOSE" && params && (params.code === 1000 || params.code === 1005)) {
  const event = this.soraCloseEvent("normal", "DISCONNECT", params);
  this.writeSoraTimelineLog("disconnect-normal", event);
  this.callbacks.disconnect(event);
  return;
}
const event = this.soraCloseEvent("abend", title, params);
this.writeSoraTimelineLog("disconnect-abend", event);
this.callbacks.disconnect(this.soraCloseEvent("abend", title, params));
```

- normal 分岐 (`:810-814`) は `event` を timeline / callback で共有しており参照同一性が成立する
- **abend 分岐 (`:816-818`) だけ**、`:817` の timeline には `:816` の `event` を渡し、`:818` の callback には新規生成した別インスタンスを渡している
- `soraCloseEvent` (`src/base.ts:2380` 周辺) は `SoraCloseEvent` constructor を呼ぶため、2 回呼び出しで別オブジェクトを返す
- `createTimelineEvent` (`src/utils.ts:458-476`) は Event 派生に対する `structuredClone` で `DataCloneError` を投げ、catch (`:468-470`) で `data` 参照をそのまま timeline event の `data` に格納する。Chromium / Firefox の現行実装ではこの経路を通るため、参照同一性のあるはずの timeline と callback で実際には別インスタンスになる

### 影響範囲

- normal 分岐 (`code === 1000 || 1005`) は影響なし
- abend 分岐 (それ以外) のみ影響

### 再現条件

`abend()` が abend 分岐に入る経路すべて。具体的には:

- DataChannel `onerror` (`src/base.ts:2188` 付近) 経由
- WebSocket 異常 close (`code !== 1000 && code !== 1005`) 経由

## 設計方針

`:818` を `:817` と同じ `event` 変数を渡す形に修正する 1 行修正:

```ts
const event = this.soraCloseEvent("abend", title, params);
this.writeSoraTimelineLog("disconnect-abend", event);
this.callbacks.disconnect(event);
```

normal 分岐 (`:810-814`) と同じ構造に揃える。観測可能挙動の変化は「timeline event と callback event の参照同一性が成立するようになる」のみで、`event` の構造 (`type` / `code` / `reason` / `title`) は変わらない。

## 変更対象ファイル

| ファイル      | 内容                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| `src/base.ts` | `:818` の 1 行を修正                                                         |
| `CHANGES.md`  | `## develop` 直下の既存 `[FIX]` 群末尾 (`### misc` より前) に `[FIX]` を追記 |

E2E fixture / 新規 E2E は本 issue では追加しない。abend を E2E で決定的に発火させる手段が限られる (DataChannel `onerror` の `dispatchEvent` はブラウザ実装依存) ため、回帰検出の主担保はコードレビュー (`:817` と `:818` が同じ `event` 変数を参照していること) とする。

## テスト方針

- **コードレビュー担保 (主担保):** `:816` で宣言した `event` 変数を `:817` の timeline と `:818` の callback で共有していることをレビューで確認する
- **既存 E2E への回帰がないこと:** `pnpm e2e-test` が現状通り pass する

## 完了条件

- `src/base.ts:818` が `this.callbacks.disconnect(event);` に修正される
- `:816` で生成した `event` が timeline (`:817`) と callback (`:818`) の両方に渡る
- ローカルで `pnpm test` および `pnpm e2e-test` が通ること
- CHANGES.md `## develop` 直下の既存 `[FIX]` 群末尾 (`### misc` より前) に次を追記する:

  ```
  - [FIX] abend() の callbacks.disconnect に新規生成した SoraCloseEvent を渡しており timeline event と参照同一性が失われていたのを修正する
    - @voluntas
  ```

## マージ順

- 依存: なし (0021 の `ConnectError` constructor には依存しない)
- 0030 (`runShutdownOnce` 4 系統冪等化リファクタ) より**先**にマージする想定。0030 は本 issue で 818 行が修正済みであることを前提に `work()` 戻り値で event を timeline / callback に共有する設計に進む
