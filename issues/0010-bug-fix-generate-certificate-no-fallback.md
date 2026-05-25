# `generateCertificate` 失敗時に fallback がなく接続不可になる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-generate-certificate-fallback

## 目的

`connectPeerConnection` (`src/base.ts:1343-1387`) で `window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" })` (`src/base.ts:1346-1349`) を try/catch なしで `await` している。FIPS モードの Chromium、企業 PC のセキュリティポリシーで ECDSA 系暗号が制限されている環境などで `NotSupportedError` / `OperationError` が返ると `connectPeerConnection` の Promise が reject し、`multiStream` も reject して `connect()` が失敗する。WebRTC 仕様上 `RTCPeerConnection(config)` の `config.certificates` は省略可能 (省略時はブラウザが自前生成) なので、証明書生成に失敗した場合はフォールバックして `certificates` 無しで `RTCPeerConnection` を生成すれば接続を継続できる。

合わせて、`src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` で `Algorithm` 型全体を汚染しているのを、WebCrypto 標準の `EcKeyGenParams` 型を使う形に置き換える。

## 優先度根拠

High。FIPS モード Chromium 利用者 (米国政府系・金融・医療系企業環境などで FIPS 140-2/140-3 準拠が要求される) では本問題で SDK 接続自体が成立せず、アプリ全体が機能停止する。発生頻度はユーザー環境依存だが、影響したユーザーは完全に詰む。

## 現状

### 状態遷移

```mermaid
flowchart TD
    A[connectPeerConnection] --> B{generateCertificate 利用可能?}
    B -->|No| E["new RTCPeerConnection(config)"]
    B -->|Yes| C[await generateCertificate]
    C -->|成功| D["config.certificates 設定"]
    C -->|失敗 throw 現行| F[connect() reject (バグ)]
    D --> E
    C -->|失敗 catch 修正後| E
```

`src/base.ts:1343-1351`

```ts
protected async connectPeerConnection(message: SignalingOfferMessage): Promise<void> {
  let config = { ...message.config };
  if (window.RTCPeerConnection.generateCertificate !== undefined) {
    const certificate = await window.RTCPeerConnection.generateCertificate({
      name: "ECDSA",
      namedCurve: "P-256",
    });
    config = { certificates: [certificate], ...config };
  }
```

`generateCertificate` の戻り値 `Promise<RTCCertificate>` は WebCrypto の制約で reject する経路を持つ。例えば Chromium の FIPS 互換ビルドでは ECDSA 鍵生成が拒否される。

`src/base.ts:80-84`

```ts
declare global {
  interface Algorithm {
    namedCurve: string;
  }
}
```

このグローバル拡張は `Algorithm` 型 (WebCrypto 全 API で共有) に `namedCurve: string` を必須プロパティとして注入する。本来 `namedCurve` を持つのは `EcKeyGenParams` / `EcKeyImportParams` / `EcKeyAlgorithm` などの EC 系サブ型のみで、`Algorithm` 自体には存在しない。プロジェクト内の他コードや依存ライブラリの WebCrypto 利用に型エラーを潜在的に持ち込む。WebCrypto 標準 (TypeScript の `lib.dom.d.ts` 標準) に `EcKeyGenParams` が定義済みなので、それを使えば globaltype 汚染は不要。

## 設計方針

`generateCertificate` 失敗時は `config.certificates` を設定せずブラウザデフォルトの証明書生成にフォールバックする (WebRTC 仕様上 `certificates` 省略は許容)。型汚染の `declare global { interface Algorithm }` は削除し、引数型を `EcKeyGenParams` (`satisfies`) で明示する。

`src/base.ts:1343-1351` の `if (window.RTCPeerConnection.generateCertificate !== undefined)` ブロックを次の通り書き換える。

```ts
let config = { ...message.config };
if (window.RTCPeerConnection.generateCertificate !== undefined) {
  try {
    const certificate = await window.RTCPeerConnection.generateCertificate({
      name: "ECDSA",
      namedCurve: "P-256",
    } satisfies EcKeyGenParams);
    config = { certificates: [certificate], ...config };
  } catch (e) {
    this.trace("GENERATE-CERTIFICATE-FAILED", String(e));
    this.writePeerConnectionTimelineLog("generate-certificate-failed", { reason: String(e) });
  }
```

**限界**: FIPS 環境で `new RTCPeerConnection(config)` 自体も ECDSA 内部利用で失敗しうる。本 issue は `generateCertificate` 失敗時のフォールバックのみ。

`src/base.ts:80-84` を削除する。

```ts
declare global {
  interface Algorithm {
    namedCurve: string;
  }
}
```

`generateCertificate` の引数で `satisfies EcKeyGenParams` を使う狙いは「`name` / `namedCurve` のプロパティ名タイポを TypeScript で検出する」「`Algorithm` グローバル拡張を削除しても `namedCurve` プロパティが許容される根拠を型で示す」の 2 点。`NamedCurve` は `lib.dom.d.ts` 上では `string` エイリアスのため、カーブ名文字列自体のタイポは検出できない。

## 完了条件

- `connectPeerConnection` (`src/base.ts:1343-1351`) で `generateCertificate` 呼び出しを try/catch で囲み、catch 時は `config.certificates` を設定せずに次の `new RTCPeerConnection(config, this.constraints)` に進む。`this.trace("GENERATE-CERTIFICATE-FAILED", String(e))` と `writePeerConnectionTimelineLog("generate-certificate-failed", { reason: String(e) })` でログを残す
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- `src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` を削除する
- `generateCertificate` の引数型を `EcKeyGenParams` に明示する (`{ name: "ECDSA", namedCurve: "P-256" } satisfies EcKeyGenParams`)。`EcKeyGenParams` は TypeScript の `lib.dom.d.ts` に標準定義済みなので import 不要
- 検証は FIPS モード Chromium での再現が難しいため、コードレビューで try/catch の到達性を担保する。手動検証手順を `e2e-tests/README.md` (既存) に「`window.RTCPeerConnection.generateCertificate` を一時的にエラー throw に差し替えて `connect()` が成立することを DevTools console で確認する手順」として追記する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] generateCertificate が失敗した環境 (FIPS モード等) でも接続できるようにフォールバックする
    - @voluntas
  ```
- `Algorithm` グローバル拡張削除に伴う型エラーが SDK の他コードで出ないことを `vp check` で確認する。事前調査として `src/` 配下を `grep namedCurve` した結果、`namedCurve` を使うのは `src/base.ts:82, 1348` の 2 箇所のみで、削除後の影響は本 issue の編集範囲に閉じる
