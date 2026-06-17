# `abendPeerConnectionState()` だけ `callback → timeline` 順で発火しているのを他 3 系統と揃える

- Priority: Low
- Created: 2026-06-09
- Completed: 2026-06-16
- Model: Opus 4.7
- Branch: feature/change-abend-peer-connection-state-callback-order
- Polished: 2026-06-16

## 目的

`abendPeerConnectionState()` (`src/base.ts:644-699`) のみ `callbacks.disconnect` (`:697`) → `writeSoraTimelineLog` (`:698`) の順で発火しており、他 3 系統 (`abend` / `shutdown` / `disconnect`) の `timeline → callback` 順と逆。4 系統の発火順を `timeline → callback` に揃える観測可能挙動の変更。

行番号は 2026-06-16 時点の `src/base.ts` 基準 (現 HEAD で 0041 / 0031 / 0009 マージ後)。実装着手時は `grep -nE 'writeSoraTimelineLog|callbacks\.disconnect|abendPeerConnectionState' src/base.ts` で再確認すること。

## 優先度根拠

Low。発火順を依存するアプリは稀で、観測されるのは callback と timeline の到達順が `abendPeerConnectionState` 経由のときだけ変わる程度の差異 (event の値・参照同一性はいずれも変わらない)。実害も小さい。

0030 (Medium、`runShutdownOnce` 4 系統冪等化リファクタ) のクリティカルパス上にあり、0030 のスコープを「観測可能挙動を変えない純粋なリファクタ」に保つ役割を果たす。マージ順の詳細は「マージ順」セクションを参照。

## 利用者影響

`[CHANGE]` 分類の根拠。影響を受けるパターン:

- `callbacks.disconnect` ハンドラから timeline の最終要素を参照しているアプリ。これまでは `abendPeerConnectionState` 経由のときだけ `disconnect-abend` timeline が `disconnect` 発火後に書かれていたため、`disconnect` ハンドラ内から timeline を見ても直近の `disconnect-abend` エントリは含まれなかった。本変更後は他 3 系統と同様 timeline が先に書かれてから callback が発火するため、ハンドラ内から timeline 末尾が見える。

通常のアプリは 4 系統で順序を区別していない (むしろ揃った方が一貫する) ため影響は実質ゼロだが、ハンドラ内で timeline を読むコードがあれば観測値が変わる。後方互換のない変更として `[CHANGE]` で扱う。

## 現状

`src/base.ts:696-698` (`abendPeerConnectionState()` 末尾の発火部):

```ts
const event = this.soraCloseEvent("abend", title);
this.callbacks.disconnect(event);
this.writeSoraTimelineLog("disconnect-abend", event);
```

4 系統全体の順序対比 (`abendPeerConnectionState` のみが逆順):

| メソッド                   | event 生成行 | timeline 発火行   | callback 発火行 | 順序                                    |
| -------------------------- | ------------ | ----------------- | --------------- | --------------------------------------- |
| `abendPeerConnectionState` | `:696`       | `:698`            | `:697`          | callback → timeline (本 issue で揃える) |
| `shutdown`                 | `:744`       | `:745`            | `:748`          | timeline → callback                     |
| `abend` normal 分岐        | `:853`       | `:854`            | `:855`          | timeline → callback                     |
| `abend` abend 分岐         | `:858`       | `:859`            | `:860`          | timeline → callback                     |
| `disconnect`               | `:1154` ほか | `:1160` / `:1162` | `:1164`         | timeline → callback                     |

`abendPeerConnectionState()` の呼び出し元は ICE 接続状態異常 (`:1830` `ICE-CONNECTION-STATE-FAILED`、`:1836` `ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT`) と PeerConnection 接続状態異常 (`:1852` `CONNECTION-STATE-FAILED`) の 3 経路。いずれも `pc.iceConnectionState` / `pc.connectionState` の状態変化 callback から起動される。

## 設計方針

`:697` と `:698` の 2 行を入れ替える。`event` 生成 (`:696`) は触らない:

```diff
 const event = this.soraCloseEvent("abend", title);
-this.callbacks.disconnect(event);
-this.writeSoraTimelineLog("disconnect-abend", event);
+this.writeSoraTimelineLog("disconnect-abend", event);
+this.callbacks.disconnect(event);
```

`:645-695` (handler 剥がし、DataChannel close、`ws.close()`、`pc.close()`、`initializeConnection`) は変更しない。`:696` の `event` 1 インスタンスが `:697` (timeline) と `:698` (callback) で共有される現状の参照同一性も維持する。

### スコープ外 (本 issue では触らない)

- `ws.close()` 直呼び (`:688`) / `pc.close()` 直呼び (`:693`)。他 3 系統では `pc` が `maybeClosePeerConnection` 経由、`ws` が `disconnect` / `abend` で `disconnectWebSocket` 経由、`shutdown` は ws を触らない、という非対称があるが、これを揃えるリファクタは 0030 でも除外しており別 issue 扱い

## 変更対象ファイル

| ファイル      | 内容                                                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/base.ts` | `:697-698` の 2 行を入れ替え (timeline → callback)。`event` 生成 (`:696`) は触らない                                                                              |
| `CHANGES.md`  | `## develop` 配下、`[CHANGE]` 群末尾 (現 `:21` の `removeAudioTrack` / `removeVideoTrack` の担当者行の直後、`:22` の `[UPDATE] pnpm 11 系に上げる` の直前) に追記 |

## テスト方針

`abendPeerConnectionState()` は `pc.iceConnectionState` / `pc.connectionState` (readonly) を Playwright から決定的に変化させる手段がないため新規 E2E は追加しない。4 系統発火順の網羅テストは 0030 で集約する。

### 主担保 (コードレビュー)

- 修正後の `:696-698` が `event` 生成 → `writeSoraTimelineLog` → `callbacks.disconnect` の順になっていること
- `:696` で生成した `event` が `:697` (timeline) と `:698` (callback) の両方に同一インスタンスとして渡っていること (closed/0041 と同じ参照同一性の維持)
- 他 3 系統 (`shutdown` `:744-748` / `abend` normal `:853-855` / `abend` abend `:858-860` / `disconnect` `:1158-1164`) と発火順が `writeSoraTimelineLog` → `callbacks.disconnect` で揃っていること
- `:645-695` (handler 剥がし、DataChannel close、`ws.close()`、`pc.close()`、`initializeConnection`) は変更されていないこと

### 機械的確認

`grep -nE 'writeSoraTimelineLog\("disconnect-abend"|callbacks\.disconnect' src/base.ts | head -2` の上 2 件 (= `abendPeerConnectionState` 末尾の 2 行) が `writeSoraTimelineLog` → `callbacks.disconnect` の順 (timeline 行が callback 行より先) であること。

### 回帰確認

- ローカルで `pnpm test` (`vp test run`、vitest) が現状通り pass する
- ローカルで `pnpm e2e-test` (`vp build && playwright test --project='chromium'`) が現状通り pass する

## 完了条件

- `src/base.ts:697-698` の発火順が `writeSoraTimelineLog` → `callbacks.disconnect` になる
- ローカルで `pnpm test` および `pnpm e2e-test` が通ること
- `CHANGES.md` `## develop` 配下、`[CHANGE]` 群末尾 (`:21` の `- @voluntas` の直後、`:22` の `- [UPDATE] pnpm 11 系に上げる` の直前) に次を追記する:

  ```
  - [CHANGE] `abendPeerConnectionState()` の発火順を他 3 系統と揃え timeline → callback の順にする
    - @voluntas
  ```

## マージ順

- 上流依存: なし
- 下流: 0030 (`runShutdownOnce` 4 系統冪等化リファクタ) — 本 issue を先にマージする (0030 は 4 系統の発火順が `timeline → callback` で揃っていることを前提に純粋なリファクタとして実装する)
- 0021 / 0009 / 0031 / 0041 (closed) とは触る箇所が異なり順序自由
- 2026.1.0 リリース (issue 0059) のブロッカー候補。0030 を 2026.1.0 に含めるなら本 issue も先行マージが必須

## 解決方法

- `src/base.ts:697-698` の 2 行を入れ替え、`abendPeerConnectionState()` の発火順を他 3 系統 (`shutdown` / `abend` / `disconnect`) と揃えて `writeSoraTimelineLog` → `callbacks.disconnect` の順にした。`event` 生成 (`:696`) はそのまま、参照同一性も維持。
- `:645-695` (handler 剥がし、DataChannel close、`ws.close()`、`pc.close()`、`initializeConnection`) は変更なし。
- `CHANGES.md` `## develop` 配下、`[CHANGE]` 群末尾 (`removeAudioTrack` / `removeVideoTrack` 担当者行の直後、`[UPDATE] pnpm 11 系に上げる` の直前) に `[CHANGE]` エントリを 1 件追加した。
- `pnpm test` (108 件 pass) / `pnpm typecheck` / `pnpm lint` をローカルで通過。`grep -nE 'writeSoraTimelineLog\("disconnect-abend"|callbacks\.disconnect' src/base.ts | head -2` の結果が `:697 writeSoraTimelineLog → :698 callbacks.disconnect` で issue の機械的確認も満たした。
