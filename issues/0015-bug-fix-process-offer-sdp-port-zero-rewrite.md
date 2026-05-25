# `processOfferSdp` の Firefox 用 `m=... 0 ...` → `m=... 9 ...` 書き換えが粗く RFC 3264 の意味を破壊する

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-process-offer-sdp-port-zero

## 目的

`processOfferSdp` (`src/base.ts:1489-1502`) は Firefox 向けに `^m=(audio|video) 0 ` を `m=$kind 9 ` に機械置換している。`m=<media> 0` は RFC 3264 §5.1 の rejected 表明であり、現行コードは Sora の transceiver 解放用途以外の port=0 も書き換えてしまう。本 issue では書き換え対象を「同一 mid が前回 port>0 から port=0 に変わった audio/video m-section」に限定する。

## 優先度根拠

Medium。Sora 現行仕様では port=0 は transceiver 解放のみとされ (`src/base.ts:1493-1494` コメント)、本番観測ログなし。ただし RFC 3264 上の rejected 表明を破壊する潜在リスクがあり、defensive に限定する。

## 現状

### 状態遷移

```mermaid
flowchart TD
    A[processOfferSdp 入力] --> B{isFirefox?}
    B -->|No| Z[そのまま返却]
    B -->|Yes| C["/^m=(audio|video) 0 / 一括置換 (現行)"]
    C --> D[rejected 表明も port=9 に書き換え (バグ)]
    D --> Z

    E[修正後: mid 限定] --> F{port === 0 かつ<br/>previousPort > 0?}
    F -->|Yes audio/video| G[port 9 に書き換え]
    F -->|No| H[書き換えなし]
```

```ts
private processOfferSdp(offerSdp: string): string {
  let sdp = offerSdp;
  if (isFirefox()) {
    sdp = sdp.replaceAll(/^m=(audio|video) 0 /gm, (_match, kind: string) => `m=${kind} 9 `);
  }
  return sdp;
}
```

- `isFirefox()` — `src/utils.ts:119`
- 呼び出し元: `setRemoteDescription` (`src/base.ts:1401`) 経由
- `initializeConnection` (`src/base.ts:820-848`) に `previousOfferMidPorts` は未存在

## 設計方針

### 第 1 段階 (実装前必須): Firefox 再現確認

Firefox 最新安定版で、Sora transceiver 解放シナリオ (track remove → 再ネゴ → port=0 offer) において port=0 のまま `onremovetrack` 不発が再現するか手動確認する。結果を本 issue に追記してから第 2 / 第 3 段階を選択する。

### 第 2 段階: 再現する場合 — mid 限定書き換え

`src/base.ts` に `previousOfferMidPorts: Record<string, number> = {}` を追加。`processOfferSdp` で SDP を行単位パースし、各 m-section の `a=mid` と port を記録。次をすべて満たす m-section のみ `9` に書き換える:

- `port === 0`
- `previousOfferMidPorts[mid]` が存在し `> 0`
- `kind === "audio"` または `"video"`

書き換え後 `previousOfferMidPorts` を今回 offer の mid→port で更新。`initializeConnection` で `{}` にリセット。

```ts
private previousOfferMidPorts: Record<string, number> = {};

private processOfferSdp(offerSdp: string): string {
  let sdp = offerSdp;
  if (isFirefox()) {
    const lines = sdp.split(/\r\n|\n/);
    const newLines: string[] = [];
    let currentMSectionIndex = -1;
    const mSectionPorts: { line: string; index: number; mid: string | null; kind: string; port: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mMatch = /^m=(audio|video|application) (\d+) /.exec(line);
      if (mMatch !== null) {
        currentMSectionIndex++;
        mSectionPorts.push({
          line,
          index: i,
          mid: null,
          kind: mMatch[1],
          port: mMatch[2],
        });
      } else if (currentMSectionIndex >= 0) {
        const midMatch = /^a=mid:(.+)$/.exec(line);
        if (midMatch !== null) {
          mSectionPorts[currentMSectionIndex].mid = midMatch[1];
        }
      }
      newLines.push(line);
    }

    const nextOfferMidPorts: Record<string, number> = {};
    for (const section of mSectionPorts) {
      if (section.mid === null) {
        continue;
      }
      const port = Number.parseInt(section.port, 10);
      nextOfferMidPorts[section.mid] = port;
      const previousPort = this.previousOfferMidPorts[section.mid];
      if (
        port === 0 &&
        previousPort !== undefined &&
        previousPort > 0 &&
        (section.kind === "audio" || section.kind === "video")
      ) {
        newLines[section.index] = newLines[section.index].replace(
          /^m=(audio|video) 0 /,
          (_match, kind) => `m=${kind} 9 `,
        );
      }
    }
    this.previousOfferMidPorts = nextOfferMidPorts;
    sdp = newLines.join("\r\n");
  }
  return sdp;
}
```

`initializeConnection` に `this.previousOfferMidPorts = {}` を追加。

### 第 3 段階: 再現しない場合 — 書き換え縮小または削除

Firefox 109 系限定のバージョン判定 (`firefoxVersion()` を `src/utils.ts` に追加) に変更するか、書き換え自体を削除する。第 1 段階結果に基づき選択。

**変更対象:** `src/base.ts` の `processOfferSdp` / `initializeConnection`、必要時 `src/utils.ts`

**スコープ外:**

- `m=application` (DataChannel) の port=0 書き換え
- 初回 offer で port=0 の rejected 表明 (previous なし) の書き換え
- Sora 側 port=0 仕様変更
- Playwright Firefox 自動 E2E 追加 (リポジトリに Firefox runner 未整備)

## 完了条件

- 第 1 段階の Firefox 再現確認結果を issue に追記済み
- 再現する → 第 2 段階を実装 / 再現しない → 第 3 段階を実装
- 手動検証手順を `e2e-tests/firefox_renegotiation/README.md` (新規) に記載: track add/remove → 再ネゴ → port=0 offer → `processOfferSdp` 通過後の port 値 / `onremovetrack`
- ローカルで `pnpm test` が通ること
- CHANGES.md `## develop` に追記:

  ```
  - [FIX] Firefox 向けの processOfferSdp の port=0 書き換えを mid 再利用ケースに限定して RFC 3264 の rejected 表明を保護する
    - @voluntas
  ```

**マージ順:** 0013–0017 チェーンとは独立。単独マージ可。
