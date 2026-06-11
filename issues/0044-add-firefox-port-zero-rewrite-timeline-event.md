# `processOfferSdp` の Firefox 用 port=0 書き換え発火を timeline event で観測する

- Priority: Medium
- Created: 2026-06-11
- Polished:
- Model: Opus 4.7
- Branch: feature/add-firefox-port-zero-rewrite-timeline-event

## 目的

`src/base.ts:1555-1568` の `processOfferSdp` には Firefox 向けの defensive workaround があり、Sora が transceiver 解放のために送る offer SDP の `m=(audio|video) 0` を `m=$kind 9` に一括置換している。現状はこの書き換えが「実際にいつ・どのくらい踏まれているか」がランタイムから観測できず、本番運用でのデバッグや将来の workaround 要否判断の根拠を欠いている。

書き換えが実際に発生したときだけ timeline event を発行し、sora-devtools などの timeline 受け側で可視化できるようにする。

## 優先度根拠

Medium。挙動修正ではなく観測装置の追加で実装も小さいが、(1) Firefox workaround の発火実態を本番計測できるようにすることで運用上の判断材料が定量化される、(2) 将来 Sora 側仕様の変化により書き換えが暴発する事象が起きた際に timeline から即座に検知できる、(3) 既存 timeline log (`set-remote-description` / `onicecandidate` 等) と整合的な形で sora-devtools 利用者に観測手段を提供できる、という効用がある。

## 現状

### 該当箇所

`src/base.ts:1555-1568` の `processOfferSdp`:

```ts
private processOfferSdp(offerSdp: string): string {
  let sdp = offerSdp;
  if (isFirefox()) {
    // 同じ mid が採用される際にはもう使用されない transceiver を解放するために
    // port に 0 が指定された SDP が送られてくる。
    // ただし Firefox (バージョン 109.0 で確認) はこれを正常に処理できず、
    // port で 0 が指定された場合には onremovetrack イベントが発行されないので、
    // ワークアラウンドとしてここで SDP の置換を行っている。
    sdp = sdp.replaceAll(/^m=(audio|video) 0 /gmu, (_match, kind: string) => `m=${kind} 9 `);
  }
  return sdp;
}
```

`isFirefox()` の判定後、port=0 の audio/video m 行が含まれていれば 9 に置換する。置換が発生したかどうかをランタイム側に伝える手段がない。

### timeline log の既存仕組み

`writePeerConnectionTimelineLog(eventType, data)` (`src/base.ts:1929`) が定義済み。`peerconnection` カテゴリの timeline event として `this.callbacks.timeline(event)` 経由で配信される。`set-remote-description` / `create-answer` / `onicecandidate` 等の既存 event と同一経路。

## 設計方針

`processOfferSdp` 内で書き換え対象の m 行を一度 `matchAll` で集計し、件数が 1 件以上のときだけ書き換えと timeline event 発行を行う。

実装イメージ:

```ts
private processOfferSdp(offerSdp: string): string {
  let sdp = offerSdp;
  if (isFirefox()) {
    const matches = [...sdp.matchAll(/^m=(audio|video) 0 /gmu)];
    if (matches.length > 0) {
      sdp = sdp.replaceAll(
        /^m=(audio|video) 0 /gmu,
        (_match, kind: string) => `m=${kind} 9 `,
      );
      this.writePeerConnectionTimelineLog("firefox-port-zero-rewrite", {
        count: matches.length,
        kinds: matches.map((m) => m[1]),
      });
    }
  }
  return sdp;
}
```

- eventType 名 (`firefox-port-zero-rewrite` は提案) は polish 時に確定する。既存 eventType (`set-remote-description` 等のケバブケース) と整合させる
- data には書き換え件数 `count` と書き換えた m 行の種別 `kinds` (例: `["video"]` / `["audio", "video"]`) を含め、受け側 (sora-devtools 等) で分類しやすくする
- 書き換えが 0 件のとき timeline event は発行しない (timeline ノイズを増やさない)
- `isFirefox()` 内に閉じるため Firefox 以外への影響はない
- 書き換えロジック (正規表現と置換後の port=9) は既存と完全に同じ。挙動変更ではなく観測のみの追加

### スコープ外

- 書き換えロジック本体の変更 (mid 限定化、`a=inactive` との対応、RFC 3264 の rejected 表明保護など)
- timeline event の受け側 (sora-devtools 等) の改修。timeline event を出すまでが本 issue の範囲
- Firefox 以外のブラウザ向けの処理追加

## 完了条件

- `processOfferSdp` 内で port=0 書き換えが実際に発生したときのみ `writePeerConnectionTimelineLog` で event を発行する。0 件のときは発行しない
- event の `data` に `count` (number) と `kinds` (string[]) を含める
- `tests/` 配下に以下のユニットテストを追加 (モック・スタブ禁止規約に従い、`callbacks.timeline` への引数を記録する受け側を素の関数として用意して観測する):
  - Firefox 環境で port=0 の audio/video m 行を含む SDP を渡すと `firefox-port-zero-rewrite` の timeline event が発行され、`count` と `kinds` が正しい
  - 複数の m 行が port=0 のとき、`count` と `kinds` が件数分入る
  - port=0 の m 行が無い SDP では timeline event が発行されない
  - Firefox 以外の環境では timeline event が発行されない
- 既存テストが通る (`pnpm test`)
- 手動検証手順 (multistream で publisher を切断 → subscriber 側で `m=video 0` を含む re-offer / update 受信 → timeline に `firefox-port-zero-rewrite` が出ることを確認) を PR 説明に記載する
- CHANGES.md `## develop` に以下のように追記:
  ```
  - [ADD] Firefox 向け processOfferSdp の port=0 書き換えが発火したことを timeline event firefox-port-zero-rewrite として記録する
    - @voluntas
  ```
