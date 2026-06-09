# `Sora.getCapabilities()` API の設計

- Priority: Medium
- Created: 2026-06-09
- Model: Opus 4.7
- Branch: feature/design-get-capabilities-api
- Polished:

## 目的

SDK 利用者がブラウザの機能対応状況を起動時に判定できるよう、Capability 公開 API を設計する。

最初のユースケースは「`compress: true` の DataChannel シグナリングが使えるか」。現状 `src/utils.ts:505-515` の `compressMessage` / `decompressMessage` は `CompressionStream("deflate")` / `DecompressionStream("deflate")` を使うが、これらが `globalThis` に存在しないブラウザでは `compress: true` 経路で失敗する。失敗は `src/base.ts` の `abend` / `disconnectDataChannel` / `sendSignalingMessage` / `sendStatsMessage` / 公開 `sendMessage` 等の try/catch なし `await` で unhandled rejection になる。

対症療法的に各送信箇所で try/catch を入れる方針 (issue 0004 / 0034 の compress 部分) は誤りで、本来は **判定可能なものは判定する** (LBYL) べき。判定結果は SDK 内部で握りつぶさず `Sora.getCapabilities()` のような API で利用者に公開し、UI 出し分けや接続オプションの判断を利用者が行えるようにする。WebRTC の `RTCRtpSender.getCapabilities()` / `MediaDevices.getSupportedConstraints()` と同じ作法に揃える。

API は **将来 codec / simulcast などの他の機能判定も追加できる汎用形** で設計する。本 issue のスコープは **API 設計のみ**。実装と既存箇所の組み込みは別 issue で行う。

## 優先度根拠

Medium。issue 0004 / 0034 の方針転換の前提となる設計であり、後続の実装 issue が本 issue 完了を待つ。実害は出ていないが、設計を確定させないと後続が動かせない。

## 現状

### 既存 API (`src/sora.ts`)

- `Sora` のデフォルトエクスポートは object で、`connection()` / `version()` / `helpers` の 3 つの公開メンバを持つ
- `SoraConnection` クラスが `sendrecv` / `sendonly` / `recvonly` / `messaging` のファクトリ
- capability 公開系の API は存在しない

### 圧縮機能の利用箇所 (最初のユースケース)

- 圧縮実装: `src/utils.ts:505-515` の `compressMessage` / `decompressMessage`
- 呼び出し: `src/base.ts` 内 (`compressMessage` は 7 箇所、`decompressMessage` は 1 箇所)。すべて `signalingOfferMessageDataChannels.*.compress === true` 分岐内
- 利用者から見ると、現状は接続後に compress 経路で初めて失敗が顕在化する

## 設計方針

本 issue では以下を決める。

### 決めること

1. **API の形と置き場所**
   - 案 A: `Sora.getCapabilities()` を default export object に追加 (static 相当)
   - 案 B: `SoraConnection.getCapabilities()` インスタンスメソッド
   - 案 C: 独立した named export

2. **戻り値の型**
   - object を返す前提として、プロパティ命名:
     - 案 a: 機能単位 (`dataChannelSignalingCompress: boolean`)
     - 案 b: 機能の組 (`compression: { deflate: boolean }`)
   - 将来 codec / simulcast / video codec などの判定を追加できる拡張性を確保

3. **判定対象 (最初のユースケース)**
   - `CompressionStream("deflate")` と `DecompressionStream("deflate")` 両方を見るか、片方で代表させるか
   - 他アルゴリズム (`"gzip"` 等) を対象に含めるか

4. **同期 / 非同期**
   - 機能検出は同期で十分か確認 (`CompressionStream` 系は同期判定可能だが、将来 codec 判定で非同期 API を使う可能性)

5. **TypeScript 型公開**
   - 戻り値型を `SoraCapabilities` 等として named export するか

6. **`getCapabilities()` 結果と SDK 内部挙動の関係**
   - 本 issue は判定結果の公開のみ
   - SDK 内部が `compress: true` 経路で実際にどう振る舞うか (起動時拒否 / 接続時拒否 / 例外 throw) は別 issue で決める

### 推奨たたき台

- API: `Sora.getCapabilities()` (案 A)
- 戻り値: 機能単位プロパティの object (案 a)
- 命名:

  ```ts
  Sora.getCapabilities(): {
    dataChannelSignalingCompress: boolean
  }
  ```

- 判定: `CompressionStream` と `DecompressionStream` 両方が `globalThis` に存在
- 同期戻り、戻り値型は `SoraCapabilities` として named export

## 完了条件

- 「決めること」1-6 すべてに対する決定方針が本 issue に記載されている
- API 名・戻り値型・判定対象・同期/非同期が確定している
- 後続の実装 issue を起こせる状態 (本 issue を参照すれば実装に着手できる)

## 関連 issue

- **0004 (close 予定)**: `abend()` の compress 失敗を局所 try/catch する案。本 issue の機能検出方針へ転換するため close
- **0034**: `compressMessage` 関連の水平展開。本 issue 完了後、compress 部分を削除し `ws.send` / `DataChannel.send` の同期例外と readyState ガードのみに絞り込むリスコープが必要
