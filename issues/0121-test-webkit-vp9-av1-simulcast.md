# WebKit で VP9 / AV1 の simulcast を検証する E2E テストを追加する

- Created: 2026-10-26
- Completed: {YYYY-MM-DD}
- Branch: feature/test-webkit-vp9-av1-simulcast
- Polished: {YYYY-MM-DD}
- Reporter: @miosakuma

## 目的

WebKit (Safari) は VP9 / AV1 では simulcast のレイヤーが 1 本しか送出されない。この制約を E2E テストで記録し、将来 WebKit が VP9 / AV1 の simulcast に対応したときに気づけるようにする。

## 現状

Playwright 1.63.0 同梱の WebKit 26.6 (macOS 27.0.1) で確認した結果は次のとおり。

- `simulcast_sendonly_webkit` で `simulcast_encodings` を指定せずに接続した場合
  - VP8 / H264 / H265: outbound-rtp が 3 本 (r0 / r1 / r2)
  - VP9 / AV1: outbound-rtp が 1 本 (r0) のみ
- Sora のドキュメントでは Safari 26.0 は VP9 / AV1 のサイマルキャスト未対応とされている
- `e2e-tests/tests/webkit.test.ts` には VP9 / AV1 の simulcast のテストが無い
  - `WebKit`: `sendrecv_webkit` を使った sendrecv。コーデックは `未指定` / VP8 / VP9 / H264 / H265 からランダム
  - `WebKit Authz simulcast_encodings ScaleResolutionDownTo`: VP8 を明示した simulcast のテスト

## 設計方針

- `e2e-tests/tests/webkit.test.ts` に VP9 / AV1 の simulcast の `test.fail` テストを追加する
  - `simulcast_sendonly_webkit` を使い、それぞれ VP9 / AV1 を明示する
  - `simulcast_encodings` は指定しない (Sora の既定 encodings)
  - r0 / r1 / r2 の outbound-rtp が存在し、`bytesSent` / `packetsSent` が 0 より大きいことを assert する
  - 現状は 1 レイヤーしか送出されないため fail し、`test.fail` として suite は pass する。WebKit が対応したら pass し、suite が fail して検知できる
- `e2e-test-webkit.yml` は `e2e-tests/tests/webkit.test.ts` を実行するため、追加したテストは CI で実行される
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する

## 完了条件

- WebKit で VP9 / AV1 の simulcast の `test.fail` テストが追加され、期待どおり失敗して suite が pass する
- 既存の WebKit テスト (`WebKit`, `WebKit Authz simulcast_encodings ScaleResolutionDownTo`) が退行なく動作する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する

## 関連 issue

- closed 0118: WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っていた。VP9 / AV1 では simulcast のレイヤーが 1 本になることは 0118 の調査で判明した
- closed 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト。同様のコーデックごとのテスト構成を参考にする
