# WebKit で AV1 の非 simulcast (sendrecv) を検証する E2E テストを追加する

- Created: 2026-10-26
- Completed: {YYYY-MM-DD}
- Branch: feature/test-webkit-av1-sendrecv
- Polished: {YYYY-MM-DD}
- Reporter: @miosakuma

## 目的

WebKit (Safari) は AV1 の送出自体は動作する。AV1 の非 simulcast の送受信を E2E テストで検証する。動作するのであればテストを追加しない理由はない。

## 現状

- Playwright 1.63.0 同梱の WebKit 26.6 (macOS 27.0.1) では、AV1 を選択した接続が成功し、outbound-rtp の `codecId` は `video/AV1`、SDP の video コーデックも AV1 になる
  - `RTCRtpSender.getCapabilities("video")` に `video/AV1` が含まれており、AV1 が有効なビルドになっている
- `e2e-tests/sendrecv_webkit` のコーデック選択肢に AV1 が無い
- `e2e-tests/sendonly` は `getUserMedia` を使うため、ヘッドレスの WebKit では利用しない
- WebKit の AV1 の非 simulcast の送受信を検証するテストは無い
- リリース版 Safari で AV1 を有効にするには開発者向け機能フラグが必要という情報があるが、CI で使う Playwright 同梱の WebKit では AV1 が有効

## 設計方針

- `e2e-tests/sendrecv_webkit` のコーデック選択肢に AV1 を追加する
- `e2e-tests/tests/webkit.test.ts` に AV1 の sendrecv テストを追加する
  - `sendrecv_webkit` は fake media を使うため、ヘッドレスの WebKit でも動作する
  - AV1 を選択して sendrecv し、codec stats が `video/AV1` であること、送受信のフレーム数や bytes が 0 より大きいことを assert する
  - このテストは pass する想定
- `e2e-test-webkit.yml` は `e2e-tests/tests/webkit.test.ts` を実行するため、追加したテストは CI で実行される
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する

## 完了条件

- `e2e-tests/sendrecv_webkit` で AV1 を選択できる
- WebKit で AV1 の非 simulcast のテストが追加され、pass する
- 既存の WebKit テスト (`WebKit`, `WebKit Authz simulcast_encodings ScaleResolutionDownTo`) が退行なく動作する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する

## 関連 issue

- 0121: WebKit で VP9 / AV1 の simulcast を検証する E2E テストを追加する
- closed 0118: WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っていた。AV1 の送出は動作することを 0118 の調査で確認した
- closed 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト。コーデックごとのテスト構成を参考にする
