# typedoc の @example を充実させる

- Priority: Medium
- Created: 2026-06-23
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/update-typedoc-examples
- Polished: {YYYY-MM-DD}

## 目的

`src/sora.ts` / `src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` / `src/base.ts` の JSDoc に書かれている `@example` を、利用シナリオが伝わる粒度に揃えて充実させる。`on()` のイベント kind 別の典型例や、`sendMessage` のように現状 `@example` が書かれていない公開メソッドにも例を追加する。コードフェンスの言語指定を ` ```typescript ` に統一する。

## 優先度根拠

Medium。0063 (typedoc 生成物の GitHub Pages デプロイ) のマージ後、API ドキュメントは `https://shiguredo.github.io/sora-js-sdk/` で配信される一般利用者向けの主導線になる。`@example` は typedoc 出力でメソッドカードに直接表示されるため、利用者の初手の理解度に直結する。一方で SDK 本体の挙動には影響せず緊急性は無いため High ではなく Medium。0063 マージ後の早い段階で着手したい。

## 現状

### typedoc 設定と公開対象

- `/Users/voluntas/shiguredo/sora-js-sdk/typedoc.json` の `entryPoints` は `./src/sora.ts`、`excludePrivate: true` / `excludeProtected: true`。`@public` の有無に関係なく、クラスの `public` メソッドは出力される
- 出力対象になる公開クラス: `SoraConnection` (`src/sora.ts`)、`ConnectionPublisher` (`src/publisher.ts`)、`ConnectionSubscriber` (`src/subscriber.ts`)、`ConnectionMessaging` (`src/messaging.ts`)、`ConnectionBase` (`src/base.ts`)

### 既存 `@example` の状況

`grep -rn "@example" src/` で確認した合計 17 箇所の `@example` がある。

- `src/sora.ts:95 / 131 / 159 / 195 / 251`: `SoraConnection` の各 `sendrecv` / `sendonly` / `recvonly` / `messaging` メソッドと `Sora.connection`。いずれも 1 〜 2 行
- `src/publisher.ts:10`: `ConnectionPublisher.connect`。`getUserMedia` → `connect` の 3 行
- `src/subscriber.ts:10`: `ConnectionSubscriber.connect`。2 行
- `src/messaging.ts:12`: `ConnectionMessaging.connect`。2 行
- `src/base.ts:345 / 369 / 400 / 459 / 490 / 548 / 582 / 1093`: `on` / `stopAudioTrack` (@deprecated) / `removeAudioTrack` / `stopVideoTrack` (@deprecated) / `removeVideoTrack` / `replaceAudioTrack` / `replaceVideoTrack` / `disconnect`
- `src/base.ts:2694`: `rpc`。1 行

### 言語指定の混在

- ` ```typescript ` 指定: `src/sora.ts` (5 箇所)、`src/publisher.ts`、`src/subscriber.ts`、`src/messaging.ts`、`src/base.ts:2694` (`rpc`)
- 無印 ` ``` `: `src/base.ts` の `on` / `stopAudioTrack` / `removeAudioTrack` / `stopVideoTrack` / `removeVideoTrack` / `replaceAudioTrack` / `replaceVideoTrack` / `disconnect` (8 箇所)

### `@example` が無い、または不足している公開メソッド

- `src/base.ts` の `sendMessage` (`:2604`) は `@public` JSDoc も `@example` も無いが、`public` メソッドとして typedoc に出力される。利用者が DataChannel メッセージング (`Sora.connection(...).messaging(...)`) を扱う際の中核 API でありながら、ドキュメント側に呼び出し例が無い
- `src/base.ts` の `on` (`:358`) の `@example` は `track` イベント 1 例だけ。`Callbacks` (`src/types.ts:432`) で定義されている 13 種の kind (`disconnect` / `push` / `track` / `removetrack` / `notify` / `switched` / `connected` / `log` / `timeout` / `timeline` / `signaling` / `message` / `datachannel`) のうち、複数の典型 kind に触れる例が欲しい
- `src/base.ts` の `disconnect` (`:1100`) と `rpc` (`:2706`) の `@example` は 1 行のみで、エラー時の挙動や前段の準備 (`connect()` 済みであること、`open` 状態の DataChannel が必要であること等) が読み取れない

## 設計方針

### 言語指定の統一

`src/base.ts` の `@example` ブロックのコードフェンスを ` ```typescript ` に揃える。typedoc はコードフェンスの言語指定からシンタックスハイライトを行うため、生成物の見た目が `src/sora.ts` 側と揃う。

### スニペットの粒度

- 各 `@example` は「`Sora.connection(...)` → role 選択 → 必要なら `on()` でコールバック設定 → `connect()`」までの一貫したシーケンスが追える粒度を基本とする
- メソッドカードに直接出る都合上、長すぎるとノイズになる。 1 メソッドあたり 5 〜 15 行を目安にする
- `await` / `async` を省略しない。`async` 関数内での実行を前提にすることを明示するため、`async function main() { ... }` 形式は避け、`await` を直接書くトップレベル風スニペットに統一する (利用者が試すときの摩擦を下げる)
- シグナリング URL は `wss://sora.example.com/signaling` などの実在しないドメインで統一する。`192.0.2.x` (TEST-NET-1) はそのまま残してよい

### `on()` の `@example` 拡張

`on()` のメソッドカード本体には現状の 1 例 (`track`) を踏襲した形を残しつつ、`Callbacks` の代表的な kind を網羅する例を追加する。`disconnect` / `notify` / `signaling` / `message` / `datachannel` あたりの典型ユースケースを 1 ブロックずつ並べる構成にする。複数の `@example` ブロックを並列に書ける typedoc 仕様を活用する。

### `sendMessage` の `@example` 追加

`sendMessage` は `connection.messaging("sora")` → `await messaging.connect()` → `messaging.sendMessage("#label", new Uint8Array([...]))` の流れが分かる例にする。`label` の規約 (`#` プレフィックス) と `message` が `Uint8Array` であることを例の中で示す。

### `disconnect` の `@example` 拡張

`connect()` → 任意の処理 → `disconnect()` の流れに加え、`on("disconnect", ...)` コールバックでの最終的な終了通知が来ることに触れる短い例にする。

### `rpc` の `@example` 拡張

`rpc` は現状の 1 行 (`await connection.rpc('2025.2.0/RequestSimulcastRid', { rid: 'r0' })`) をベースに、(1) 前提として `RPC DataChannel` が open であること、(2) レスポンス型が型引数で指定できること、(3) `notification: true` での片方向呼び出しの 3 例を `@example` ブロックとして分けて示す。`@throws` 相当の情報 (`RPC DataChannel is not available or not open`) は `@remarks` で補足する (本 issue は `@example` 中心だが、`rpc` だけ `@remarks` を最小限触る)。

### スコープ

- 対象は `@example` ブロックの新規追加・刷新と、コードフェンス言語指定の統一のみ
- `@deprecated` の `stopAudioTrack` / `stopVideoTrack` は、現行の `@example` を `removeAudioTrack` / `removeVideoTrack` への置き換えガイドとして最小限残す (深追いしない)
- API の挙動・シグネチャ・引数名・ファイル分割は変更しない
- `typedoc.json` / `TYPEDOC.md` は無編集 (それぞれ 0065 / 0064 の範囲)

## 完了条件

- 対象 5 ファイル (`src/sora.ts` / `src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` / `src/base.ts`) の `@example` が「設計方針」の粒度に揃っている
- 全 `@example` のコードフェンスが ` ```typescript ` に統一されている
- `sendMessage` に `@example` が追加されている
- `on()` の `@example` が `Callbacks` の複数 kind を網羅する形で拡張されている
- `disconnect` / `rpc` の `@example` がシーケンスとエラー前提を読み取れる形に拡張されている
- ローカルで `vp install --frozen-lockfile && vp run doc` を実行し、`apidoc/index.html` から各メソッドカードに展開された例が typedoc の HTML 上で崩れずに表示される
- typedoc のビルドが既存の警告数を増やさない

## 解決方法

### ファイル変更

- `src/base.ts` の `@example` ブロックを言語指定 `typescript` に揃え、`on` / `disconnect` / `sendMessage` / `rpc` の例を「設計方針」に沿って拡張する
- `src/sora.ts` / `src/publisher.ts` / `src/subscriber.ts` / `src/messaging.ts` の `@example` を「Sora.connection → role 選択 → on() でコールバック設定 → connect()」シーケンスに揃え、URL を `wss://sora.example.com/signaling` 系で統一する
- 既存の `192.0.2.100:5000` を使った例も残す場合は 1 箇所に集約し、混在させない

### 検証

- `vp install --frozen-lockfile` 後に `vp run doc` を実行し、`apidoc/` を再生成する
- `apidoc/classes/ConnectionBase.html` (typedoc が出力する名称に依る) 等から、各 `@example` がコードブロックとして崩れずに表示されること、`typescript` シンタックスハイライトが効いていることを目視確認する
- 0063 マージ後の `https://shiguredo.github.io/sora-js-sdk/` 配信物でも同様に確認する

### 変更履歴

- `CHANGES.md` の `## develop` セクションに `### misc` の `[UPDATE]` として 1 行追加する (具体的な文面は実装時にコミット内容に合わせて確定)

## スコープ外 (本 issue では実装しない)

- `TYPEDOC.md` の表紙刷新 (0064 で扱う)
- `typedoc.json` の `intentionallyNotExported` を `@internal` + `excludeInternal: true` に置き換える作業 (0065 で扱う)
- `@param` / `@returns` / `@remarks` 等、`@example` 以外の TSDoc タグの整理 (`rpc` の `@remarks` 最小修正を除く)
- API シグネチャや引数名の変更

## 関連 issue

- **0063 (open)**: typedoc 生成物の GitHub Pages デプロイ。本 issue の `@example` が一般利用者の目に触れるのは 0063 マージ後
- **0064 (open)**: TYPEDOC.md を API ドキュメントの表紙として刷新する。編集ファイルは重ならない
- **0065 (open)**: `typedoc.json` の `intentionallyNotExported` を `@internal` + `excludeInternal: true` に置き換える。編集ファイルは重ならない
