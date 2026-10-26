# WebKit で AV1 の非 simulcast (sendrecv) を検証する E2E テストを追加する

- Created: 2026-10-26
- Completed: {YYYY-MM-DD}
- Branch: feature/test-webkit-av1-sendrecv
- Polished: 2026-10-26
- Reporter: @miosakuma

## 目的

Playwright 同梱の WebKit 26.6 では AV1 の送出自体が動作する。AV1 の非 simulcast の送受信を E2E テストで検証する。動作するのであればテストを追加しない理由はない。

## 現状

- Playwright 1.63.0 同梱の WebKit 26.6 (macOS 27.0.1) では、AV1 を選択した接続が成功し、outbound-rtp の `codecId` が参照する codec stats の `mimeType` は `video/AV1`、SDP の video コーデックも AV1 になる
  - `RTCRtpSender.getCapabilities("video")` に `video/AV1` が含まれており、AV1 が有効なビルドになっている
- `e2e-tests/sendrecv_webkit` のコーデック選択肢に AV1 が無い
- `e2e-tests/tests/webkit.test.ts` の `WebKit` テストはコーデックをランダムに選択するため、AV1 を追加しても AV1 が選ばれるかは実行ごとに変わり、AV1 の送受信を確実には検証できない
- `e2e-tests/sendonly` は `getUserMedia` を使うため、ヘッドレスの WebKit では利用しない
- WebKit の AV1 の非 simulcast の送受信を検証するテストは無い
- リリース版 Safari で AV1 を有効にするには開発者向け機能フラグが必要という情報があるが、CI で使う Playwright 同梱の WebKit では AV1 が有効

## 設計方針

- `e2e-tests/sendrecv_webkit` のコーデック選択肢に AV1 を追加する
- `e2e-tests/tests/webkit.test.ts` に AV1 の sendrecv テストを追加する
  - テスト名は `WebKit AV1 sendrecv` のように AV1 と sendrecv を特定できる名前にする
  - 既存テストと同様に `test.skip(shouldSkipWebKitTest(test.info().project.name), "WebKit かつ macOS でのみテストを行う")` で WebKit 以外のプロジェクトを skip する。`e2e-test.yml` は Chromium / Google Chrome でも `webkit.test.ts` を実行するため、skip しないと WebKit 以外でも実行される
  - `sendrecv_webkit` は fake media を使うため、ヘッドレスの WebKit でも動作する
  - sendrecv1 / sendrecv2 の両方で AV1 を選択する。片方だけ AV1 にすると、受信側のコーデックが AV1 にならない
  - 接続後に `#connection-id:not(:empty)` を待ち、既存の `WebKit` テストと同様に十分待ってから `#get-stats` を押す (例: 5000 ms)。待たずに取得すると `bytesSent` / `packetsSent` / `bytesReceived` / `packetsReceived` が 0 のまま失敗し得る
  - 両方のページで codec stats が `video/AV1` であること、outbound-rtp の `bytesSent` / `packetsSent` と inbound-rtp の `bytesReceived` / `packetsReceived` が 0 より大きいことを assert する。フレーム数は既存テストと同様に必須にしない
  - このテストは pass する想定
- `e2e-test-webkit.yml` は `e2e-tests/tests/webkit.test.ts` を実行するため、追加したテストは CI で実行される
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する。担当者行 (`- @miosakuma`) を 2 文字インデントで付ける

## 完了条件

- `e2e-tests/sendrecv_webkit` で AV1 を選択できる
- WebKit で AV1 の非 simulcast のテストが追加され、pass する
  - sendrecv1 / sendrecv2 の両方で AV1 を選択している
  - 両方のページで codec stats が `video/AV1` であること、outbound-rtp の `bytesSent` / `packetsSent` と inbound-rtp の `bytesReceived` / `packetsReceived` が 0 より大きいことを assert している
- 追加したテストは WebKit プロジェクトでのみ実行され、他のプロジェクトでは `test.skip` される
- 既存の WebKit テスト (`WebKit`, `WebKit Authz simulcast_encodings ScaleResolutionDownTo`) が退行なく動作する
  - `sendrecv_webkit` に AV1 を追加すると `WebKit` テストのランダム選択に AV1 が含まれるため、AV1 が選ばれた場合も pass することを確認する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを担当者行付きで追記する

## 関連 issue

- open 0121: WebKit で VP9 / AV1 の simulcast を検証する E2E テストを追加する
- closed 0118: WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っていた。VP9 では simulcast のレイヤーが 1 本になることを 0118 の調査で確認した。AV1 の送出が動作することは本 issue の現状で確認した
- open 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト (未実装)。コーデックごとのテスト構成を参考にする
