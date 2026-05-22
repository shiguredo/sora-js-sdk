# `processOfferSdp` の Firefox 用 `m=... 0 ...` → `m=... 9 ...` 書き換えが粗く RFC 3264 の意味を破壊する

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-process-offer-sdp-port-zero

## 目的

`processOfferSdp` (`src/base.ts:1489-1502`) は Firefox 用に `^m=(audio|video) 0 ` を `m=$kind 9 ` に正規表現で機械的に書き換えている。コメント (`src/base.ts:1493-1497`) によると「Sora が同じ mid 再利用時に未使用 transceiver 解放のため port=0 を指定した SDP を送ってくる」「Firefox 109.0 ではこれを正常に処理できず `onremovetrack` が発行されない」ワークアラウンド。

`m=<media> 0` は RFC 3264 §5.1 で「offerer がこの m-section を rejected として扱う」意味の宣言であり、本来「使われない」表明そのもの。現状の書き換えは Sora が「transceiver 解放のために port=0 を送る」前提に依存しており、Sora が将来「セッション全体拒否」や「特定 m-section の rejected 状態」で port=0 を送るケースに遭遇すると、その意味を破壊して 9 にすり替え、Firefox は意味のある拒否表明だった m-section に answer を返してしまい BUNDLE / mid 整合性が壊れる可能性がある。

合わせて、現状の正規表現は `audio` / `video` の 2 つしかカバーしておらず、Sora が `m=application` (DataChannel 用) や `m=text` を将来 port=0 で送るケースには無防備。

## 優先度根拠

Medium。Sora の現行仕様では port=0 を「transceiver 解放」のみで使う想定とされており (`src/base.ts:1493-1494` のコメント)、本来 RFC 3264 が定める「rejected」意味で port=0 を送るケースは現時点で確認されていない。Firefox 109.0 で再現確認済みの問題への対症療法として書かれた現コードは「動いてはいる」状態。実害は本番観測ログなし。

ただし次の経路で将来的に破綻する可能性が残る:

- Sora がセッション拒否や m-section 拒否で port=0 を返す仕様拡張
- Firefox 側の `onremovetrack` 発行問題が修正された後のバージョン (Firefox 110+ で挙動変化があるか未確認)
- `audio` / `video` 以外の m-section (`application` 等) を Firefox が port=0 で受け取った場合の挙動 (現状の正規表現では取りこぼし)

defensive な堅牢化として、書き換え対象を「Sora が transceiver 解放のために送っている port=0」に限定するか、Firefox 側の修正バージョン以降では書き換え自体を廃止する判断を行う。

## 現状

`src/base.ts:1489-1502`

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
    sdp = sdp.replaceAll(/^m=(audio|video) 0 /gm, (_match, kind: string) => `m=${kind} 9 `);
  }

  return sdp;
}
```

`isFirefox()` は `src/utils.ts` で `navigator.userAgent` を見て判定する。`processOfferSdp` は `signalingOnMessageTypeOffer` から呼ばれる (`src/base.ts:1401`)。Firefox 109.0 のバグ自体は Mozilla Bugzilla で報告例があるが、その後の Firefox バージョンで修正されたかは本 issue 着手時点で未確認。

書き換え後の port `9` は IANA 上 `discard` プロトコル用で、SDP では「実 port は別経路 (ICE candidate) で決定する placeholder」として慣習的に使われる。BUNDLE 経由ですべての m-section が同じ DTLS/SRTP transport を共有する場合、`m=` 行の port 値自体はあまり意味を持たないが、`m=... 0 ...` を出す offerer の意図 (= rejected 表明) を破壊するのは spec 違反。

## 完了条件

- まず Firefox の最新安定版 (執筆時点 Firefox 138 系) で同じ問題が再現するかを実機で確認する。再現しない場合は `isFirefox()` 全体を `isFirefox() && (Firefox バージョン < N)` に絞るか、書き換えそのものを削除する
- Firefox 最新版でも再現する場合は、書き換え対象を「Sora が transceiver 解放のために送る port=0」に限定する。SDP を行単位でパースし、`a=mid:<value>` を持ちかつ前回処理した offer の同じ mid が `m=<kind> <port>` で `port > 0` を持っていた m-section だけを書き換える。前回 offer の mid -> port マップを SDK インスタンスのフィールドとして保持する
- 正規表現の `(audio|video)` を `[\\w-]+` または `(audio|video|application|text)` に拡張する判断を行う。本 issue では「現状の `audio|video` 2 つで Sora が送る m-section をカバーしている」前提を確認した上で、Sora の SDP 仕様拡張に備えて `(audio|video|application)` まで拡張する
- 検証は `e2e-tests/sendrecv_webkit/` ではなく Firefox 専用の E2E が必要。`e2e-tests/` 配下に Firefox 用テスト機構が存在するかを確認し、ない場合は Playwright の Firefox runner で `track の add / remove → 再ネゴ → offer の m-section に port=0 が含まれることを確認 → SDK の processOfferSdp 通過後に port 値が変わっていることを確認」する手動検証手順を `e2e-tests/firefox_renegotiation/README.md` (新規) に残す
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] Firefox 向けの processOfferSdp の port=0 書き換えを mid 再利用ケースに限定して RFC 3264 の rejected 表明を保護する
    - @voluntas
  ```
- 本 issue は SDK 内の他 issue とのマージ衝突はない (`processOfferSdp` は他の修正範囲と独立)。`signalingOnMessageTypeOffer` (`src/base.ts:1876-1910`) で `this.mids.audio` / `this.mids.video` が保存されるため、前回 mid マップとして `this.mids` を流用するか、新規フィールドを追加するかを実装者が判断する

## 解決方法

実装方針は次の 3 段階で進める。

### 第 1 段階: Firefox 最新版で再現確認

Firefox 138 系で Sora との simulcast 接続 + track 追加 / 削除を行い、`processOfferSdp` 通過前後の SDP を比較する。`onremovetrack` イベントが port=0 のままで発行されるかを確認する。再現しなければ `isFirefox()` ガードを Firefox バージョン判定付きに変更する。

### 第 2 段階: 再現する場合の限定書き換え

`src/base.ts:1489-1502` を次の通り書き換える。前回 offer の m-section ごとの port 値を `this.previousOfferMidPorts: Record<string, number>` フィールドで保持し、port=0 で来た m-section のうち「前回 port>0 だった mid に対応するもの」だけを書き換える。

```ts
private previousOfferMidPorts: Record<string, number> = {};

private processOfferSdp(offerSdp: string): string {
  let sdp = offerSdp;
  if (isFirefox()) {
    const lines = sdp.split(/\r\n|\n/);
    const newLines: string[] = [];
    let currentMSectionIndex = -1;
    let currentMid: string | null = null;
    const mSectionPorts: { line: string; index: number; mid: string | null; kind: string; port: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mMatch = /^m=(audio|video|application) (\d+) /.exec(line);
      if (mMatch !== null) {
        currentMSectionIndex++;
        currentMid = null;
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
          currentMid = midMatch[1];
          mSectionPorts[currentMSectionIndex].mid = currentMid;
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
        // Sora が同じ mid を再利用するときの port=0 のみ書き換える
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

`m=application` は `audio|video` 範囲外なので書き換えない (DataChannel 用 m-section)。前回 offer で port>0 だった mid が今回 port=0 になっているケースだけが書き換え対象。

### 第 3 段階: Firefox バージョン判定での廃止

Firefox 138 系以降で再現しないことを確認できた場合、`isFirefox()` を `isFirefox() && firefoxVersion() < 138` のように限定する。`firefoxVersion()` は `src/utils.ts` に追加する。`isFirefox()` 単体での書き換えは廃止し、第 2 段階の実装も将来削除する道筋を CHANGES.md / コメントで残す。

第 1 段階の再現確認結果次第で第 2 段階のみか第 3 段階のみかを決める。本 issue では第 1 段階の確認をまず行い、結果をこの issue ファイルに追記してから第 2 段階または第 3 段階のコード変更に進む。
