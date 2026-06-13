# `abend()` の abend 分岐で `soraCloseEvent` を 2 回生成して timeline と callback で別インスタンスになっている

- Priority: Medium
- Created: 2026-06-09
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/fix-abend-disconnect-event-duplicate
- Polished: 2026-06-13

## 目的

`abend()` (`src/base.ts:757-861`) の abend 分岐終端で `this.soraCloseEvent("abend", title, params)` を 2 回呼んでおり、`writeSoraTimelineLog` と `callbacks.disconnect` に **別インスタンスの `SoraCloseEvent`** が渡る。`TimelineEvent.data` と `callbacks.disconnect` 引数を `===` で照合するアプリ / テストで誤検知を起こす。`:860` を `:858` で生成済みの `event` を渡す形に直す 1 行修正。

## 優先度根拠

Medium。値ベースの挙動 (`type` / `code` / `reason` / `title` / `params`) は同一のため実害が観測されにくいが、参照同一性に依存する経路 (アプリ側で event を `===` 比較する等) では取り違える。normal 分岐 (`:848-856`) / `shutdown()` (`:744-748`) は元から event を 1 個共有しており、abend 分岐だけが他経路と一貫しない構造になっている。

## 現状

`src/base.ts:848-860` の abend 系統終端:

```ts
if (
  title === "WEBSOCKET-ONCLOSE" &&
  params &&
  (params["code"] === 1000 || params["code"] === 1005)
) {
  const event = this.soraCloseEvent("normal", "DISCONNECT", params);
  this.writeSoraTimelineLog("disconnect-normal", event);
  this.callbacks.disconnect(event);
  return;
}
const event = this.soraCloseEvent("abend", title, params);
this.writeSoraTimelineLog("disconnect-abend", event);
this.callbacks.disconnect(this.soraCloseEvent("abend", title, params));
```

- normal 分岐 (`:848-856`) は `:853` で生成した `event` を `:854` の timeline と `:855` の callback で共有する
- abend 分岐 (`:858-860`) だけ `:860` で `soraCloseEvent` を再呼び出ししており、`callbacks.disconnect` に渡る `SoraCloseEvent` は `:858` の `event` とは **別インスタンス**
- `soraCloseEvent` (`src/base.ts:2555-2583`) は呼ばれるたびに `new` で返すため、2 回呼べば別オブジェクトになる
- `writeSoraTimelineLog` 経由で `callbacks.timeline` に流れる値は `createTimelineEvent` (`src/utils.ts:591-615`) で別の `Event` ラッパとして生成され、`event.data = structuredClone(data)` を試みる。`Event` 派生は `structuredClone` 不能 (`DataCloneError`) のため catch (`:602-604`) で `event.data = data` として元 event の参照をそのまま保持する。normal 分岐では `timelineEvent.data === event` が成立するが、abend 分岐では `:858` の `event` と `:860` の引数が別インスタンスのためこれが崩れる

### 影響範囲

- normal 分岐 (`:848-856`) は元から 1 個共有のため影響なし
- abend 分岐 (`:858-860`) のみ影響
- `abend()` 関数自体に到達するのは `grep -nE 'this\.abend\(' src/base.ts` で 3 件:
  - WebSocket `onclose` で `event.code !== 1000` の経路 (`:1795`、`abend("WEBSOCKET-ONCLOSE", { code, reason })`)。`event.code === 1000` は `monitorWebSocketEvent` (`:1789`) が `shutdown()` 側に振り分けるため `abend()` 関数自体に到達しない
  - WebSocket `onerror` (`:1803`、`abend("WEBSOCKET-ONERROR")`)
  - DataChannel `onerror` (`:2332`、`abend("DATA-CHANNEL-ONERROR", { params: { label } })`)
- このうち `:858-860` の abend 分岐に進むのは「WebSocket `onclose` のうち `code` が `1000` でも `1005` でもないもの」「WebSocket `onerror`」「DataChannel `onerror`」の 3 ケース (`code === 1000` は `monitorWebSocketEvent` (`:1789`) で `shutdown()` 側に振り分けられて `abend()` 自体に来ず、`code === 1005` は `abend()` 内 normal 分岐条件 `:849-851` で吸収される)

### スコープ外 (本 issue では触らない)

- `abendPeerConnectionState` (`:644-699`) は `:696` で `event` を 1 個生成しており参照同一性は成立しているが、`:697` で callback、`:698` で timeline と発火順が他 3 系統 (`abend()` normal 分岐 / `shutdown()` / `disconnect()` の `:1160-1164`、いずれも timeline → callback の順) と逆になっている問題は **issue 0042** で扱う
- 4 系統 (`abend` / `shutdown` / `disconnect` / `abendPeerConnectionState`) を `runShutdownOnce` に集約するリファクタは **issue 0030** で扱う
- `abend()` 内の `compress === true` 分岐や handler 剥がし・cleanup 順序は本修正の対象外
- `params["code"] === 1000` 分岐の dead code 整理は 0030 のスコープ。本修正は abend 分岐の二重生成のみを潰し、normal 分岐 (`:848-856`) は触らない
- 行番号は 2026-06-13 時点の `src/base.ts`。実装着手時は `grep -n 'soraCloseEvent("abend"' src/base.ts` で 4 件ヒットすることを確認し、`private async abend(` 直下に含まれる連続 2 行 (`const event = ...` と `this.callbacks.disconnect(this.soraCloseEvent(...))`) を特定する。残り 2 件は `abendPeerConnectionState` と `disconnect()` 内で本 issue では touch しない

## 設計方針

`:860` の `this.soraCloseEvent("abend", title, params)` 再呼び出しを削除して `:858` で生成済みの `event` を渡す 1 行修正:

```diff
 const event = this.soraCloseEvent("abend", title, params);
 this.writeSoraTimelineLog("disconnect-abend", event);
-this.callbacks.disconnect(this.soraCloseEvent("abend", title, params));
+this.callbacks.disconnect(event);
```

normal 分岐 (`:853-855`) / `shutdown()` (`:744-748`) と同じ event 共有パターンに揃える。値ベースの挙動は変わらない。

## 変更対象ファイル

| ファイル      | 内容                                                                              |
| ------------- | --------------------------------------------------------------------------------- |
| `src/base.ts` | abend 分岐終端の `callbacks.disconnect` 引数を `event` に書き換える (現行 `:860`) |
| `CHANGES.md`  | `## develop` 配下の `### misc` 行の直前 (`[FIX]` 群末尾) に追記                   |

## テスト方針

abend を決定的に発火させる手段が限られ、CLAUDE.md「モックやスタブは絶対に利用しないこと」規約により `callbacks` を呼び出し記録用の関数で差し替えるテスト (モック / スタブ / スパイいずれの呼称でも) も採れないため、新規テストは追加しない。

- 修正後に `grep -n 'soraCloseEvent("abend"' src/base.ts` が **3 件** (`abendPeerConnectionState` 内の 1 件、`abend()` 内の 1 件、`disconnect()` 内の 1 件) になることをコードレビューで確認する (修正前 4 件から 1 件減ることが abend 分岐の再生成削除を機械的に裏付ける)
- `pnpm test` と `pnpm e2e-test` が現状通り pass する

## 完了条件

- 設計方針の diff の通り `:860` が `this.callbacks.disconnect(event);` に書き換わっている
- `grep -n 'soraCloseEvent("abend"' src/base.ts` のヒット数が修正前 4 件から修正後 3 件に減っている
- `pnpm test` と `pnpm e2e-test` が pass する
- CHANGES.md `## develop` 配下、`### misc` 行の直前 (`[FIX]` 群末尾エントリの直後) に次を追記する:

  ```
  - [FIX] abend() の abend 分岐で SoraCloseEvent を 2 回生成して timeline と callback に別インスタンスを渡していたのを 1 つのインスタンスを共有するように修正する
    - @voluntas
  ```

## マージ順

- 上流依存: なし
- 下流: 0030 (`runShutdownOnce` 4 系統冪等化リファクタ) — 本 issue を先にマージする
- 0042 (`abendPeerConnectionState` の callback / timeline 発火順修正) とは触る箇所が異なり順序自由
