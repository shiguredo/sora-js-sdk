# WebKit で scaleResolutionDownBy を検証する E2E テストを追加する

- Created: 2026-10-26
- Completed: {YYYY-MM-DD}
- Branch: feature/test-webkit-scale-resolution-downby
- Polished: {YYYY-MM-DD}
- Reporter: @miosakuma

## 目的

WebKit (Safari) の `scaleResolutionDownBy` による解像度制御を E2E で検証する。WebKit は `scaleResolutionDownBy` に対応しているが、現状の WebKit のテストには `scaleResolutionDownBy` の検証が無い。

## 現状

- `e2e-tests/tests/webkit.test.ts` のテストは次の 2 本のみで、`scaleResolutionDownBy` のテストは無い
  - `WebKit`: `sendrecv_webkit` を使った sendrecv。コーデックはランダム
  - `WebKit Authz simulcast_encodings ScaleResolutionDownTo`: VP8 を明示した `scaleResolutionDownTo` のテスト (`test.fail`)
- WebKit の IDL には `scaleResolutionDownBy` が定義されている
- Playwright 1.63.0 同梱の WebKit 26.6 (macOS 27.0.1) で、Sora の既定 encodings (`scaleResolutionDownBy` 4 / 2 / 1) の場合に 960x540 のソースから r0 = 240x135、r1 = 480x270、r2 = 960x540 が送出されることを確認済み

## 設計方針

- `e2e-tests/simulcast_sendonly_webkit` (fake media、ソース 960x540) を使う
  - 1280x720 は使わない。E2E テストの負荷を抑えるため
- `simulcast_encodings` は全 rid active にし、`scaleResolutionDownBy` を 4 / 2 / 1 にする
  - `scalabilityMode: "L1T1"` も Sora の authz スキーマに合わせて指定する
- VP8 を明示する (WebKit は VP9 / AV1 では simulcast のレイヤーが 1 本になるため)
- `video_bit_rate` は 1500 を明示する (WebKit で r0 / r1 / r2 が送出されることを確認済み)
- r0 / r1 / r2 の outbound-rtp について、`frameWidth` のみを assert する
  - r0 = 240、r1 = 480、r2 = 960
  - `frameHeight` はエンコーダのアラインメントで変動するため確認しない
  - `bytesSent` / `packetsSent` が 0 より大きいことも確認する
- このテストは pass する想定 (`test.fail` にしない)
- `e2e-test-webkit.yml` は `e2e-tests/tests/webkit.test.ts` を実行するため、追加したテストは CI で実行される
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する

## 完了条件

- WebKit で `scaleResolutionDownBy` のテストが追加され、pass する
- 既存の WebKit テスト (`WebKit`, `WebKit Authz simulcast_encodings ScaleResolutionDownTo`) が退行なく動作する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する

## 関連 issue

- 0121: WebKit で VP9 / AV1 の simulcast を検証する E2E テストを追加する
- 0122: WebKit で AV1 の非 simulcast (sendrecv) を検証する E2E テストを追加する
- closed 0118: WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っていた
- closed 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト。Firefox には `scaleResolutionDownBy` のテストがある
