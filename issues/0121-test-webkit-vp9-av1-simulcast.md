# WebKit で VP9 / AV1 の simulcast を検証する E2E テストを追加する

- Created: 2026-10-26
- Completed: {YYYY-MM-DD}
- Branch: feature/test-webkit-vp9-av1-simulcast
- Polished: 2026-10-26
- Reporter: @miosakuma

## 目的

Playwright の WebKit 26.6 では、VP9 / AV1 の simulcast のレイヤーが 1 本しか送出されない。Sora のドキュメントでも Safari 26.0 は VP9 / AV1 のサイマルキャスト未対応とされている。この制約を E2E テストで記録し、将来 WebKit が VP9 / AV1 の simulcast に対応したときに気づけるようにする。

## 現状

Playwright 1.63.0 同梱の WebKit 26.6 (macOS 27.0.1) で確認した結果は次のとおり。

- `simulcast_sendonly_webkit` で `simulcast_encodings` を指定せずに接続した場合
  - VP8 / H264 / H265: outbound-rtp が 3 本 (r0 / r1 / r2)
  - VP9 / AV1: outbound-rtp が 1 本 (r0) のみ
- `simulcast_sendonly_webkit` の `#video-codec-type` には VP9 / AV1 の選択肢がある
- Sora のドキュメント「サイマルキャスト機能」の「VP9 と AV1 でのサイマルキャスト」では、Safari 26.0 は VP9 / AV1 のサイマルキャスト未対応とされている (2026-10 時点。 <https://sora-doc.shiguredo.jp/SIMULCAST.html>)
- `e2e-tests/tests/webkit.test.ts` には VP9 / AV1 の simulcast のテストが無い
  - `WebKit`: `sendrecv_webkit` を使った sendrecv。コーデックは `未指定` / VP8 / VP9 / H264 / H265 からランダム
  - `WebKit Authz simulcast_encodings ScaleResolutionDownTo`: VP8 を明示した simulcast のテスト
  - 上記の各テストは `shouldSkipWebKitTest` で WebKit 以外のプロジェクトを skip している。`e2e-test.yml` は Chromium / Google Chrome でもこのファイルを実行する

## 設計方針

- `e2e-tests/tests/webkit.test.ts` に VP9 / AV1 の simulcast の `test.fail` テストを追加する
  - `simulcast_sendonly_webkit` を使い、それぞれ VP9 / AV1 を明示する
  - テスト名は `WebKit VP9 simulcast` / `WebKit AV1 simulcast` のようにコーデックを特定できる名前にする
  - `simulcast_encodings` は指定しない (Sora の既定 encodings は r0 / r1 / r2 の 3 層とも active)
  - 既存テストと同様に `test.skip(shouldSkipWebKitTest(test.info().project.name), "WebKit かつ macOS でのみテストを行う")` で WebKit 以外のプロジェクトを skip する。`e2e-test.yml` は Chromium / Google Chrome でも `webkit.test.ts` を実行するため、skip しないと Chromium では 3 レイヤー送出により `test.fail` が unexpected pass になり suite が fail する
  - `findVideoCodecStats` で codec stats が `video/VP9` / `video/AV1` であることを assert する。指定したコーデックが使われていることをテスト内で確認する
  - `findOutboundRtpStatsByRid` で r0 / r1 / r2 の outbound-rtp を取得し、それぞれ存在することと `bytesSent` / `packetsSent` が 0 より大きいことを assert する
  - 接続後に既存テストと同様に十分待ってから `#get-stats` を押す (例: 3000 ms)。待たずに取得すると `bytesSent` / `packetsSent` が 0 のまま失敗し、WebKit が対応しても `test.fail` が解消されない可能性がある
  - 現状は 1 レイヤーしか送出されないため fail し、`test.fail` として suite は pass する。WebKit が対応したら pass し、suite が fail して検知できる
- `e2e-test-webkit.yml` は `e2e-tests/tests/webkit.test.ts` を実行するため、追加したテストは CI で実行される
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する。担当者行 (`- @miosakuma`) を 2 文字インデントで付ける

## 完了条件

- WebKit で VP9 / AV1 の simulcast の `test.fail` テストが追加され、期待どおり失敗して suite が pass する
  - codec stats が `video/VP9` / `video/AV1` であることを assert している
  - 接続後に十分待ってから stats を取得している
- 追加したテストは WebKit プロジェクトでのみ実行され、他のプロジェクトでは `test.skip` される
- 既存の WebKit テスト (`WebKit`, `WebKit Authz simulcast_encodings ScaleResolutionDownTo`) が退行なく動作する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを担当者行付きで追記する

## 関連 issue

- closed 0118: WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っていた。VP9 では simulcast のレイヤーが 1 本になることを 0118 の調査で確認した。AV1 も 1 本になることを本 issue の現状で確認した
- open 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト (未実装)。0116 で追加予定の Firefox テストと同様に、コーデックごとにテストを分ける構成にする
- open 0122: WebKit で AV1 の非 simulcast (sendrecv) を検証する E2E テスト。本 issue の AV1 simulcast テストとは独立
