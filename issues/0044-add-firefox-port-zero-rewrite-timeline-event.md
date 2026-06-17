# `processOfferSdp` の Firefox 用 port=0 書き換え発火を timeline event で観測する

- Priority: Medium
- Created: 2026-06-11
- Polished: 2026-06-11
- Model: Opus 4.7
- Branch: feature/add-firefox-port-zero-rewrite-timeline-event

## 目的

`src/base.ts` の `processOfferSdp` には Firefox 向けの defensive workaround があり、Sora が transceiver 解放のために送る offer SDP の `m=(audio|video) 0` を `m=$kind 9` に一括置換している。この書き換えが「実際にいつ・どのくらい踏まれているか」がランタイムから観測できないため、本 issue では書き換えが発生した瞬間に timeline event を発行する観測装置を追加する。

## 優先度根拠

Medium。挙動修正ではなく観測装置の追加で実装は小さい。本 issue の観測値が後続の関連 issue 0015 (mid 限定化を実装するか / workaround 自体を撤去するか / 現状維持か) の意思決定の入力となる。加えて、将来 Sora 側仕様の変化により書き換えが暴発する事象が起きた際に timeline から即座に検知できる常時監視装置として機能する。

## 現状

### 該当箇所

`src/base.ts` の `processOfferSdp` (`src/base.ts:1555-1568`): `isFirefox()` (`src/utils.ts:119`) が真のとき、正規表現 `^m=(audio|video) 0 /gmu` で port=0 の audio/video m 行を一括して port=9 に置換する。書き換えが発生したかどうかをランタイム側に伝える手段はない。

本メソッドは `setRemoteDescription` (`src/base.ts:1460` 付近) から呼ばれ、`setRemoteDescription` は以下の経路で呼ばれる:

- 初回 offer 経路: `signalingOnMessageTypeOffer` (`src/base.ts:1976`) は SDP に触れず `setRemoteDescription` も呼ばない。実際の `setRemoteDescription` 呼び出しは、resolve された offer message を受け取った各サブクラス (`ConnectionPublisher.connect` (`src/publisher.ts`) / `ConnectionSubscriber.connect` (`src/subscriber.ts`) / `ConnectionMessaging.connect` (`src/messaging.ts`)) で行われる
- re-offer 経路: `signalingOnMessageTypeReOffer` (`src/base.ts:2060` 付近)
- update 経路: `signalingOnMessageTypeUpdate` (`src/base.ts:2047` 付近、`@deprecated`)
- simulcast 経路: `simulcast` 有効かつ role が `sendrecv` / `sendonly` のとき、`createAnswer` 内 (`src/base.ts:1497-1531`) で transceiver 検索結果が非 `undefined` の場合のみ、再度 `setRemoteDescription(message)` を呼ぶ。**この経路により同一 `message.sdp` に対し `processOfferSdp` が最大 2 回呼ばれる**

### timeline log の既存仕組み

`writePeerConnectionTimelineLog(eventType, data)` (`src/base.ts:1929` 付近) を呼ぶと、`peerconnection` カテゴリの timeline event として `this.callbacks.timeline(event)` 経由で配信される。他の `peerconnection` カテゴリ event と同一経路。`data` は `createTimelineEvent` (`src/utils.ts:468`) の中で `structuredClone` でコピーされる (循環参照等で失敗した場合は元参照を fallback)。

## 設計方針

### 純粋関数として `src/utils.ts` に切り出す

`processOfferSdp` は `private` メソッドかつテスト環境 (jsdom) では `RTCPeerConnection` を持たないため直接ユニットテストが書けない。CLAUDE.md の「モックやスタブは絶対に利用しないこと」と整合させるため、書き換え判定 + 書き換え後 SDP + 集計結果を返す純粋関数を `src/utils.ts` に切り出す。関数自体はブラウザ非依存にし、Firefox 限定の発動制御は呼び出し側 (`processOfferSdp` orchestrator) の責務とする。

本関数 (`rewriteOfferSdpPortZero`) の責務は「port=0 の audio/video m 行を一括で port=9 に書き換える」観測用の純粋関数であり、関連 issue 0015 が予定する mid 限定書き換えとは責務が異なる。0015 着手時は本関数を残したまま 0015 側で別関数を追加し、`processOfferSdp` orchestrator 側で呼び分ける / 置き換える形となる想定 (詳細は 0015 で決定)。

```ts
// src/utils.ts
/**
 * offer SDP の port=0 の audio/video m 行を port=9 に書き換える純粋関数。
 *
 * Firefox 向け workaround の本体ロジックとして使うが、関数自体はブラウザ判定を含まない
 * (テスト容易性のため)。Firefox 以外で呼んでも安全に動作する。
 *
 * @param sdp 入力 offer SDP
 * @returns 書き換え後の SDP と、書き換えた m 行の種別 (出現順、重複あり)
 */
export function rewriteOfferSdpPortZero(sdp: string): {
  sdp: string;
  kinds: ("audio" | "video")[];
} {
  // 集計と書き換えを 1 回の走査で済ませる
  const kinds: ("audio" | "video")[] = [];
  const rewritten = sdp.replaceAll(/^m=(audio|video) 0 /gmu, (_match, kind: string) => {
    // 正規表現の capture group の都合上 audio / video 以外は来ないが、
    // 型システムで narrow するために明示比較する (型アサーション回避)
    if (kind === "audio" || kind === "video") {
      kinds.push(kind);
    }
    return `m=${kind} 9 `;
  });
  return { sdp: rewritten, kinds };
}
```

### Firefox メジャーバージョン抽出ユーティリティ

timeline event の `data` に Firefox メジャーバージョンを含めるため、`userAgent` 文字列からバージョンを抽出する純粋関数を `src/utils.ts` に追加する。0015 の意思決定 (現行サポート対象 Firefox 113+ で workaround が踏まれているか) の入力に必要となる。

本関数も `rewriteOfferSdpPortZero` と同じく **`userAgent` を引数で受け取る純粋関数** として切り出し、テスト時に `navigator.userAgent` を差し替えなくて済むようにする (CLAUDE.md のモック禁止規約と整合させるため)。呼び出し側 (`processOfferSdp` orchestrator) で `window.navigator.userAgent` を渡す。本ユーティリティは SDK 内部の workaround 観測用であり、利用者向け公開 API として露出させる用途は本 issue のスコープ外。

```ts
// src/utils.ts
/**
 * userAgent 文字列から Firefox のメジャーバージョンを抽出する純粋関数。
 * Firefox でないか抽出できなかった場合は null を返す。
 *
 * 正規表現は `Firefox\/(\d+)` で大文字始まり固定。実際の Firefox の userAgent は
 * `Mozilla/5.0 (...; rv:137.0) Gecko/20100101 Firefox/137.0` のように大文字 `Firefox/` で
 * 統一されているため小文字対応は不要。`u` フラグはリポジトリ全体の方針 (既存正規表現 `/gmu` 等)
 * に揃える。
 */
export function getFirefoxMajorVersion(userAgent: string): number | null {
  const match = userAgent.match(/Firefox\/(\d+)/u);
  return match === null ? null : Number.parseInt(match[1], 10);
}
```

### orchestrator (`processOfferSdp`) の振る舞い

`processOfferSdp` は次の責務に絞った薄い orchestrator にする。メソッドシグネチャは `private` を維持し、`setRemoteDescription` からの呼び出し関係も変更しない:

```ts
private processOfferSdp(offerSdp: string): string {
  // lint 対応で引数を変更したりしないようにしてる
  let sdp = offerSdp;
  if (isFirefox()) {
    // 同じ mid が採用される際にはもう使用されない transceiver を解放するために
    // port に 0 が指定された SDP が送られてくる。
    // ただし Firefox (バージョン 109.0 で確認) はこれを正常に処理できず、
    // port で 0 が指定された場合には onremovetrack イベントが発行されないので、
    // ワークアラウンドとしてここで SDP の置換を行っている。
    const result = rewriteOfferSdpPortZero(sdp);
    sdp = result.sdp;
    if (result.kinds.length > 0) {
      this.writePeerConnectionTimelineLog("firefox-port-zero-rewrite", {
        kinds: result.kinds,
        firefoxVersion: getFirefoxMajorVersion(window.navigator.userAgent),
      });
    }
  }
  return sdp;
}
```

ポイント:

- `kinds.length === 0` のときは event を発行しない (timeline ノイズを抑える。Firefox 環境での `processOfferSdp` 通過総回数を見たい場合は本 issue の対象外)
- 既存の lint 対応コメントと Firefox workaround の意図説明コメントを維持する
- `rewriteOfferSdpPortZero` が `kinds` のみ返すため、`data.count` を別途持たせず受け側で `data.kinds.length` を参照させる (情報の二重持ちを避ける)

### timeline event の仕様

| 項目                  | 確定値                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eventType             | `firefox-port-zero-rewrite`                                                                                                                                |
| logType               | `peerconnection` (既存 `writePeerConnectionTimelineLog` 経由)                                                                                              |
| `data.kinds`          | `("audio" \| "video")[]`。書き換えた m 行の種別を出現順に並べた配列 (重複あり)。例: `["audio", "video"]`。件数を取りたい受け側は `kinds.length` を参照する |
| `data.firefoxVersion` | `number \| null`。`navigator.userAgent` から抽出した Firefox メジャーバージョン (例: `137`)。抽出できない場合は `null`                                     |

- `data` の TypeScript 型は専用 type を切らず、`writePeerConnectionTimelineLog` 呼び出し位置で inline object として渡す (既存 event `set-remote-description` 等も inline で渡している)
- `data` の値はすべて primitive と primitive の配列で構成し、`structuredClone` でコピー可能
- event 名 `firefox-port-zero-rewrite` を採用する理由: 既存 timeline event 名のケバブケース慣習 (`set-remote-description` / `create-answer` / `onicecandidate` / `transceiver-sender-set-parameters` 等) と整合する。Firefox 限定の workaround であることを event 名から明示するため `firefox-` プレフィックスを付ける

### 同一 offer 多重発火の扱い

`### 該当箇所` で述べた simulcast 経路 (sendrecv / sendonly + simulcast 有効 + transceiver マッチ時) では、同一 offer に対し `processOfferSdp` が 2 回呼ばれる。2 回とも同じ port=0 を含む SDP が入力されるため、**同一 `kinds` / 同一 `firefoxVersion` の event が 2 回発行される**。本 issue では「呼ばれた回数だけ素直に発火する」方針を採り、SDK 側で重複抑止しない。

- 重複抑止のために追加状態 (直前 SDP の保持等) を持たせると、関連 issue 0015 が触る領域 (`previousOfferMidPorts` / `currentOfferMidPorts`) と重なってしまうため、観測装置のスコープを最小に保つ判断
- 観測値は「simulcast 経路の sendrecv/sendonly で transceiver マッチした場合は 1 offer = 2 件、マッチしなかった場合は 1 件、それ以外の経路では 1 offer = 1 件」と、ランタイム条件によりカウントが変動する粗い生値となる。0015 の意思決定 (workaround の発火頻度が問題になる水準か) を判断する用途であれば、傾向値として十分な粒度。1 offer 単位での精密集計が必要になった場合は本 issue のスコープ外で別 issue として扱う
- recvonly / messaging では simulcast 経路を通らないため多重発火しない

### スコープ外

- 書き換えロジック本体の変更 (mid 限定化、`a=inactive` との対応、RFC 3264 の rejected 表明保護など)。これらは関連 issue 0015 が扱う
- timeline event の受け側 (sora-devtools 等) の改修。timeline event を発行するまでが本 issue の範囲
- Firefox 以外のブラウザ向け workaround の観測 (例: answer SDP に stereo=1 を付与する `addStereoToFmtp` 呼び出し `src/base.ts:1541-1543`)。`options.forceStereoOutput` で制御され Chrome/Edge を想定した workaround だがブラウザ判定では発動しない点で本 issue の Firefox 限定 workaround とは性質が異なる。必要が生じたら別 issue で扱う
- `data` への追加フィールド (書き換え対象 mid、offer 全体の m-section 総数など)。`kinds` / `firefoxVersion` の 2 フィールドで確定し、本番計測の結果さらに必要と分かったら別 issue で拡張する
- `processOfferSdp` メソッドの jsdoc (`カスタムコーデック対応用に offer SDP を処理するメソッド` 等) の更新。書き換え本体が 0015 で変わる予定のため、本 issue では既存 jsdoc に手を入れない
- Firefox 環境での `processOfferSdp` 通過総回数 (= 分母) の観測。本 issue では「書き換えが発生した回数 (= 分子)」のみを観測する
- **自動テストの追加 (vitest 単体テスト / Playwright Firefox による E2E テスト / `playwright.config.ts` の Firefox runner 有効化 / CI workflow への Firefox 追加)。これらは関連 issue 0045 (pending) で扱う**。本 issue では手動検証のみで動作確認する

## 完了条件

- `src/utils.ts` に純粋関数 `rewriteOfferSdpPortZero(sdp: string): { sdp: string; kinds: ("audio" | "video")[] }` を追加する。配置位置は `addStereoToFmtp` 関数定義の直前 (`addStereoToFmtp` を含む SDP 書き換え系 export の隣) とし、両者の private helper が交ざらないように `compressMessage` / `decompressMessage` 等の後ろに揃える
- `src/utils.ts` に純粋関数 `getFirefoxMajorVersion(userAgent: string): number | null` を追加する。配置位置は `isFirefox()` / `isChrome()` / `isSafari()` のブラウザ判定系の直後 (`src/utils.ts:121` 付近) に揃える
- `src/base.ts` の `processOfferSdp` を上記 §設計方針 の orchestrator イメージに従って書き換える。`processOfferSdp` メソッドは `private` のまま残し、`setRemoteDescription` からの呼び出し関係は変更しない。書き換えが発生したとき (`kinds.length > 0`) のみ `writePeerConnectionTimelineLog("firefox-port-zero-rewrite", { kinds, firefoxVersion })` を発行する
- 既存の lint 対応コメント (`// lint 対応で引数を変更したりしないようにしてる`) と Firefox workaround の意図を説明する既存コメントは維持する
- 既存テスト (`pnpm test` / 既存の Playwright プロジェクト) が退行なくそのまま通る
- CHANGES.md の `## develop` セクション本体 (`### misc` ではない) に、`shiguredo-changelog` 規約の種別順 (CHANGE → ADD → UPDATE → FIX) に従い、既存の `[CHANGE]` エントリ群の後・`[UPDATE]` エントリ群の前に以下を追記する。`### misc` ではなく本体に置く理由: 本変更は `callbacks.timeline` に新規 eventType を発行する SDK の公開挙動の追加であり、SDK 利用者の観測可能な機能追加に該当するため。担当者は実装者の GitHub ID に置き換えること:

  ```
  - [ADD] Firefox 向け processOfferSdp の port=0 書き換えが発火したことを timeline event firefox-port-zero-rewrite として記録する
    - @voluntas
  ```

- 手動検証手順を PR 説明に記載する。検証手順の参考案:
  - Firefox 最新安定版 (実施バージョンを PR に記録) で multistream connection を作る
  - publisher を切断して subscriber 側に `m=video 0` または `m=audio 0` を含む re-offer / update を発生させる
  - SDK 利用者側で `callbacks.timeline` をフックし、`event.type === "firefox-port-zero-rewrite"` のときに `event.data` (= `{ kinds, firefoxVersion }`) がログ出力されることを確認する。フック例:

    ```ts
    connection.on("timeline", (event) => {
      if (event.type === "firefox-port-zero-rewrite") {
        // 期待: { kinds: ("audio"|"video")[], firefoxVersion: number | null }
        console.log("[firefox-port-zero-rewrite]", event.data);
      }
    });
    ```

## マージ順

0044 → 0015 を推奨する。0044 で本番観測値を得てから 0015 の意思決定 (mid 限定化を実装するか / workaround 自体を撤去するか / 現状維持か) を行うため。ただし 0015 は再現確認ゲートを持っており 0044 がブロッカーではない。0015 が「再現せず pending 化」した場合でも、0044 の価値は「workaround 撤去判断のための長期観測」として残る。

## 関連 issue

- **0015 (`feature/fix-process-offer-sdp-port-zero`)**: 同じ `processOfferSdp` の port=0 書き換えを mid 限定化して RFC 3264 rejected 表明を保護するバグ修正。0044 は 0015 の意思決定を支援する観測装置の追加として独立した issue (1 issue 1 カテゴリ規約) で分離する
- **0045 (`feature/add-firefox-port-zero-rewrite-tests`、pending)**: 0044 で追加する `rewriteOfferSdpPortZero` / `getFirefoxMajorVersion` の単体テスト (vitest) と、`firefox-port-zero-rewrite` event 発火の Playwright Firefox による E2E テストを追加する。Playwright Firefox runner 整備 (`playwright.config.ts` のコメントアウト解除、CI workflow のマトリクス拡張) も本 issue ではなく 0045 で扱う。0044 マージ後の本番観測値が 0015 の意思決定にどの程度有用かを見極めてから、0045 の整備優先度を再検討する
