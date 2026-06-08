# `generateCertificate` 失敗時に fallback がなく接続不可になる

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-08
- Model: Opus 4.7
- Branch: feature/fix-generate-certificate-fallback

## 目的

`connectPeerConnection` (`src/base.ts:1343-1387`) で `window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" })` (`src/base.ts:1346-1349`) を try/catch なしで `await` している。ECDSA 系暗号が制限された環境 (FIPS モード Chromium、企業 PC のセキュリティポリシー等) で `NotSupportedError` / `OperationError` が返ると `connectPeerConnection` の Promise が reject し、`multiStream` も reject して `connect()` が失敗する。証明書生成に失敗してもブラウザデフォルトの証明書で接続を継続できるようフォールバックする。

合わせて `src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` による型汚染を、WebCrypto 標準型 `EcKeyGenParams` を使う形に置き換える。

## 優先度根拠

High。ただし救済できる対象は「`generateCertificate` のみが特異的に失敗し、`new RTCPeerConnection` 自体はブラウザデフォルト証明書で成立する環境」である。完全な FIPS モードでは `new RTCPeerConnection` の DTLS 内部 ECDSA 鍵生成も失敗しうるため本 fix では救えない (後述「限界」)。それでも、証明書生成のみ失敗する環境で「`connect()` が一切成立しない → アプリ全体が機能停止」という最悪の症状を「ブラウザデフォルト証明書で接続継続」に緩和できる効果は大きく、影響したユーザーは現状完全に詰むため High とする。

## 現状

### 問題のコード

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

`generateCertificate` の戻り値 `Promise<RTCCertificate>` は WebCrypto の制約で reject しうる。続く `new window.RTCPeerConnection(config, this.constraints)` (`src/base.ts:1355`、第 2 引数の goog オプションは `@ts-expect-error` 付き) は本 issue では変更しない。

`src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` は、`generateCertificate(keygenAlgorithm: AlgorithmIdentifier)` の引数型 `AlgorithmIdentifier = Algorithm | string` の `Algorithm` が `{ name: string }` のみを持つため、`{ name, namedCurve }` オブジェクトリテラルの余剰プロパティチェックで `namedCurve` が弾かれるのを回避するための拡張である。この拡張は `Algorithm` 型 (WebCrypto 全 API で共有) に `namedCurve` を注入するため、他コードや依存ライブラリの WebCrypto 利用に型の歪みを持ち込む。

## 設計方針

### フォールバック

`generateCertificate` を try/catch で囲み、失敗時は `config.certificates` を設定せずブラウザデフォルトの証明書生成にフォールバックする。`config` のスプレッド順序 `{ certificates: [certificate], ...config }` は現行のまま変更しない (`message.config` が `certificates` を持つ場合はそちらが優先される既存挙動。Sora の offer config に `certificates` は通常含まれない)。

```ts
let config = { ...message.config };
if (window.RTCPeerConnection.generateCertificate !== undefined) {
  try {
    const keygenAlgorithm: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
    const certificate = await window.RTCPeerConnection.generateCertificate(keygenAlgorithm);
    config = { certificates: [certificate], ...config };
  } catch (e) {
    this.trace("GENERATE-CERTIFICATE-FAILED", String(e));
    this.writePeerConnectionTimelineLog("generate-certificate-failed", { reason: String(e) });
  }
}
```

ログの `String(e)` は、`generateCertificate` の reject 値が `DOMException` 等 非 `Error` でもありうるため `(e as Error).message` ではなく `String(e)` を用いる。trace title が大文字ハイフン、timeline eventType が小文字ハイフンなのは既存の命名慣習に合わせたもの。

**限界:** FIPS 環境で `new RTCPeerConnection(config)` 自体も ECDSA 内部利用で失敗しうる。本 issue は `generateCertificate` 失敗時のフォールバックのみで、`RTCPeerConnection` 構築自体の失敗は救えない。

### 型汚染の除去

`src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` を削除し、引数を型注釈付きローカル変数 `const keygenAlgorithm: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" }` に切り出して渡す。`EcKeyGenParams` は `lib.dom.d.ts` 標準で `interface EcKeyGenParams extends Algorithm { namedCurve: NamedCurve }` と定義され import 不要。

**inline の `generateCertificate({...} satisfies EcKeyGenParams)` は使わない。** `satisfies` の結果型はオブジェクトリテラルの fresh な型のまま保たれるため、引数型 `AlgorithmIdentifier` (= `Algorithm | string`、`Algorithm` は `{ name: string }` のみ) に対して余剰プロパティチェックが再度走り、`namedCurve` が `TS2353` で弾かれる (tsc 6.0.3 で確認)。型注釈付き変数に切り出すとリテラルの freshness が消え、`EcKeyGenParams extends Algorithm` ゆえ `AlgorithmIdentifier` に代入可能となりグローバル拡張なしで型が通る。型注釈は `name` / `namedCurve` のプロパティ名タイポも検出する (`NamedCurve` は `string` エイリアスのためカーブ名文字列のタイポは検出不可)。

`src/` 配下で `namedCurve` を使うのは `src/base.ts:82, 1348` の 2 箇所のみ (grep 済み) なので、削除の影響は本 issue の編集範囲に閉じる。`declare global` は `src/base.ts` 内のみで公開 API に export されておらず、SDK 利用者の型には影響しない。

## 完了条件

- `connectPeerConnection` で `generateCertificate` 呼び出しを try/catch で囲み、catch 時は `config.certificates` を設定せずに `new RTCPeerConnection(config, this.constraints)` に進む。`this.trace("GENERATE-CERTIFICATE-FAILED", String(e))` と `writePeerConnectionTimelineLog("generate-certificate-failed", { reason: String(e) })` でログを残す
- `src/base.ts:80-84` の `declare global { interface Algorithm { namedCurve: string; } }` を削除する
- `generateCertificate` の引数を型注釈付きローカル変数 `const keygenAlgorithm: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" }` に切り出して渡す (`EcKeyGenParams` は import 不要。inline の `satisfies` 形は TS2353 で落ちるため使わない)
- `Algorithm` グローバル拡張削除後に型エラーが出ないことを `pnpm typecheck` (`tsc --noEmit`) で確認する
- ローカルで `pnpm test` および既存 `pnpm e2e-test` が通ること
- 検証は FIPS モード Chromium での再現が難しいため、`window.RTCPeerConnection.generateCertificate` を一時的にエラー throw に差し替えて `connect()` が成立することを DevTools console で確認する手順を PR 説明に記載する (try/catch の到達性はコードレビューで担保)
- CHANGES.md `## develop` に次を追記する (FIX は既存 FIX 群の後ろ、型汚染除去は `### misc` に [UPDATE] として記載)

  ```
  - [FIX] generateCertificate が失敗した環境 (FIPS モード等) でも接続できるようにフォールバックする
    - @voluntas
  ```

  ```
  ### misc

  - [UPDATE] Algorithm 型のグローバル拡張を削除し generateCertificate の引数型を EcKeyGenParams に置き換える
    - @voluntas
  ```
