# Firefox のコーデックと simulcast encodings を確認する E2E テストを追加する

- Created: 2026-10-21
- Branch: feature/test-firefox-codec-simulcast
- Polished: 2026-10-21

## 目的

Firefox で simulcast が実際に動作することを E2E で確認できるようにする。

0115 で Firefox を simulcast 利用可能と判定するようになっても、Sora との接続で r0 / r1 / r2 の送出や simulcast encodings が期待どおり動作するとは限らない。判定エラーが出ないことだけでなく、実際に simulcast が確立して送出・受信できること、Firefox で利用できるビデオコーデック、simulcast encodings の挙動を継続的に確認する。Firefox / Sora / SDK の実装が変わったときにテストで検知できるようにする。

WebKit の `e2e-tests/tests/webkit.test.ts` と同等の位置づけで、Firefox 用の E2E テストを追加する。

## 現状

- `playwright.config.ts` の Firefox プロジェクトはコメントアウトされており、`.github/workflows/e2e-test.yml` の matrix にも Firefox がない。Firefox runner の基盤整備も本 issue で行う
- Firefox 用の E2E テストと fixture は存在しない
- WebKit は `e2e-tests/tests/webkit.test.ts` で sendrecv と simulcast encodings を確認している。ただしビデオコーデックは毎回ランダムに選択するため、どのコーデックを検証したかが実行ごとに変わり、変化の検知には弱い
- 0115 で Firefox の simulcast 利用可否判定は通るようになる予定だが、実際に Sora と simulcast が確立するかは未検証。`setSenderParameters()` の encodings 制約など、判定以外の要因で失敗する可能性がある (pending 0014)
- `e2e-tests/src/fake.ts` の `getFakeMedia()` は Firefox / WebKit 向けに用意されており、実カメラ / マイクなしで送受信できる
- Firefox で利用できるコーデックは OS や Firefox のバージョンに依存し、リポジトリ内に Firefox 用の期待値はない

## 設計方針

### runner と CI (基盤整備)

Firefox E2E の基盤整備も本 issue で行う。0045 はこの基盤を利用する。

- `playwright.config.ts` の `projects` 配列でコメントアウトされている Firefox プロジェクトを有効化する。プロジェクト名はコメントアウトされている `firefox` をそのまま使い、workflow の `--project` と `shouldSkipFirefoxTest()` の判定も `firefox` に揃える
- `e2e-tests/tests/helper.ts` に `shouldSkipFirefoxTest(projectName: string): boolean` を追加する。`projectName !== "firefox"` または `process.platform !== "darwin"` のとき true を返し、WebKit と同様に macOS 以外では skip する。Linux / Windows を追加する場合は OS 条件を更新する
- `vp exec playwright install firefox` で Firefox バイナリを取得できるようにする
- 通常の `e2e-test` matrix には Firefox を追加しない。既存テストの多くは Chromium の fake device フラグ前提で、Firefox では動かないため
- WebKit と同様の専用 workflow `e2e-test-firefox.yml` を追加し、`e2e-tests/tests/firefox.test.ts` のみを `--project="firefox"` で実行する
- 実行 OS は H264 / H265 の対応が OS 依存であることを踏まえて決める。まず WebKit と同じ self-hosted macOS (Apple-M2-Pro) で確認し、必要なら GitHub-hosted macOS や Linux / Windows を追加する

### fixture とテスト

- `e2e-tests/sendrecv_firefox/` と `e2e-tests/simulcast_sendonly_firefox/` を追加する。どちらも `getFakeMedia()` を使い、`e2e-tests/vite.config.ts` の `rolldownOptions.input` に追加する
- `sendrecv_firefox` の `#video-codec-type` には VP8 / VP9 / AV1 / H264 / H265 の選択肢を用意する (既存の `sendrecv_webkit` には AV1 がないため追加する)
- `simulcast_sendonly_firefox` は `simulcast_sendonly_webkit` と同様に `#simulcast-encodings` の入力を持ち、`generateAccessToken()` の private claims `simulcast_encodings` に渡す
- 受信側は既存の `e2e-tests/simulcast_recvonly/` を流用する
- `e2e-tests/tests/firefox.test.ts` を追加する

### コーデックの確認

- VP8 / VP9 / AV1 / H264 / H265 を対象に、コーデックごとのテストを分ける。`sendrecv_firefox` の `#video-codec-type` で各コーデックを明示的に選択する
- Firefox で動くコーデックは codec stats と outbound / inbound RTP の bytes / packets を assert する
- 動かないコーデックは `test.fail` にし、Firefox 側の対応が変わったときに suite が fail して気づけるようにする
- ランダム選択は使わない。実行ごとに検証対象が変わらず、失敗原因を特定できるようにする
- 初回実装時に実 Firefox で実行し、各コーデックの成否を確認して期待値を確定する

### simulcast の実動作と encodings の確認

- 0115 のマージ後に、`simulcast_sendonly_firefox` で `simulcast: true` を指定して接続する。0115 が未マージの間は `createSignalingMessage()` が `Simulcast can not be used with this browser` を throw するため、simulcast の実動作テストは実行できない
- 全 rid が active のケースを確認する
  - connection-id が取得でき、接続が確立している
  - r0 / r1 / r2 の outbound-rtp が存在し、bytesSent / packetsSent が増えている
  - `simulcast_recvonly` を同じチャンネルに r1 で接続し、r1 の映像が受信できることを確認する
- `active: false` のケースを別テストで確認する
  - 接続前に `simulcast_encodings` で r2 を `active: false` にして接続する
  - r2 の outbound-rtp は存在するが、bytesSent が 0 で packetsSent が 2 以下であることを確認する
  - r0 / r1 の outbound-rtp は bytesSent / packetsSent が増えていることを確認する
- simulcast encodings の `active` は outbound-rtp の `active` と bytesSent / packetsSent で確認する。`scaleResolutionDownTo` / `scaleResolutionDownBy` は `RTCOutboundRtpStreamStats` に直接含まれないため、outbound-rtp の `frameWidth` / `frameHeight` で縮小結果を確認する。`scalabilityMode` は outbound-rtp の `scalabilityMode` で確認する
- `scaleResolutionDownTo` / `scaleResolutionDownBy` を確認する場合は、fake media のソース解像度を縮小先より大きくする (例: 1280x720 のソースを 960x540 に縮小する)。ソースと縮小先が同じ解像度では縮小結果を確認できない
- 現時点で Firefox が未対応の項目は `test.fail` にし、対応したら suite が fail して気づけるようにする
- 実接続で追加の不具合 (例: `setSenderParameters()` の encodings 制約) が見つかった場合は本 issue に混ぜず、別 issue として切り出す。本 issue では該当テストを `test.fail` にして suite で検知できる状態にし、別 issue の修正後に `test.fail` を外す

## 完了条件

- `e2e-tests/sendrecv_firefox/` と `e2e-tests/simulcast_sendonly_firefox/` が追加され、`e2e-tests/vite.config.ts` に登録されている
- `playwright.config.ts` の Firefox プロジェクトが有効化されている
- `e2e-tests/tests/helper.ts` に `shouldSkipFirefoxTest()` が追加されている
- `e2e-tests/tests/firefox.test.ts` が追加され、`firefox` プロジェクトで実行できる
- 0115 のマージ後、Firefox と Sora で simulcast が確立し、sendonly 側から r0 / r1 / r2 が送出され、recvonly 側で受信できることを E2E で確認できる。追加の不具合が見つかった場合は、その不具合を別 issue に切り出し、本 issue では該当テストを `test.fail` にして suite で検知できる状態にする
- コーデックごとの期待値と simulcast encodings の期待値が実 Firefox で確認され、テストに反映されている
- `test.fail` を使った項目が、実装が変わったときに suite を fail させて検知できる状態になっている
- `.github/workflows/e2e-test-firefox.yml` で Firefox テストが self-hosted macOS 上で安定して実行できる
- 既存の Chromium / Chrome / WebKit のテストが退行なく pass する
- `vp run build` / `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追記する。E2E テスト基盤の追加は機能に直接影響しないため `### misc` に置き、担当者行 (`- @ユーザー名`) を 2 文字インデントで付ける

## 関連 issue

- pending 0045: `firefox-port-zero-rewrite` のテスト。Firefox E2E の基盤整備は本 issue が行い、0045 はその基盤を利用する
- closed 0115: Firefox の simulcast 利用可否判定の修正。本 issue の simulcast 実動作テストは 0115 のマージ後に有効化する。0115 が未マージの間は `createSignalingMessage()` が `Simulcast can not be used with this browser` を throw するため、simulcast のテストは実行できない。判定が通るだけでは実動作は保証されないため、本 issue で実動作を確認する
- pending 0014: `setSenderParameters()` の encodings 制約。実接続で顕在化した場合は別途対応する
- 0015 / 0044: `processOfferSdp` の port=0 ワークアラウンドと観測。本 issue とは別スコープ

## 解決方法

Firefox E2E の基盤整備と `firefox.test.ts` を追加した。

- `playwright.config.ts` の `projects` 配列に `firefox` プロジェクトを追加した
- `e2e-tests/tests/helper.ts` に `shouldSkipFirefoxTest()` を追加した。`projectName !== "firefox"` または macOS 以外では skip する
- `e2e-tests/sendrecv_firefox/` と `e2e-tests/simulcast_sendonly_firefox/` を追加し、`e2e-tests/vite.config.ts` の `rolldownOptions.input` に登録した
  - `sendrecv_firefox` の `#video-codec-type` には VP8 / VP9 / AV1 / H264 / H265 の選択肢を用意した
  - `simulcast_sendonly_firefox` は 960x540 の fake media を使い、`scaleResolutionDownBy` / `scaleResolutionDownTo` による縮小結果を `frameWidth` で確認できるようにした
- `e2e-tests/tests/firefox.test.ts` に以下のテストを追加した
  - コーデック別の sendrecv テスト (VP8 / VP9 / AV1 / H264 / H265)。codec 統計、outbound / inbound RTP の codecId から引いたコーデック、bytes / packets を確認する
  - simulcast の全 rid active の送出と r1 の recvonly 受信を確認するテスト
  - simulcast の r2 を `active: false` にしたときのテスト
  - `scaleResolutionDownBy` が outbound-rtp の `frameWidth` に反映されることを確認するテスト
  - `scaleResolutionDownTo` が outbound-rtp の `frameWidth` に反映されることを確認する `test.fail` テスト
  - `scalabilityMode` が outbound-rtp に反映されることを確認する `test.fail` テスト
- `e2e-tests/scripts/install-openh264.sh` を追加し、Firefox の H264 送受信に必要な OpenH264 (GMP) のプラグインを `.gmp` に導入するようにした
- `playwright.config.ts` の `firefox` プロジェクトで、H264 のハードウェアエンコーダと OpenH264 を有効にし、`MOZ_GMP_PATH` を設定するようにした
- `.github/workflows/e2e-test-firefox.yml` を追加し、self-hosted の macOS で `firefox.test.ts` のみを `--project="firefox"` で実行するようにした
  - テスト前に `e2e-tests/scripts/install-openh264.sh` を実行するようにした
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` エントリを追加した

### Firefox での確認結果

実装時に実 Firefox で Sora へ接続し、以下を確認した。期待値の確定は geckodriver 経由の Firefox 158.0.1 で行った。その後、macOS 27 の実機で Full Disk Access を付与して Playwright の Firefox 155.0 を起動し、OpenH264 を導入した状態で `firefox.test.ts` の 10 テストが pass することを確認した。CI (self-hosted macOS) の `e2e-test-firefox` でも 10 テストが pass している。

- VP8 / VP9 / AV1: codec 統計が取得でき、outbound / inbound RTP の bytes / packets が増える。テストは pass する
- H264: OpenH264 (GMP) のプラグインを `MOZ_GMP_PATH` で読み込ませることで送受信できる。`e2e-tests/scripts/install-openh264.sh` でテスト環境に導入し、`test.fail` を外した
- H265: ビデオの codec 統計が取得できず、送出も受信もされない。`test.fail` にした
- simulcast 全 rid active: r0 / r1 / r2 の outbound-rtp が存在し、bytesSent / packetsSent が増える。recvonly を r1 で接続すると 480x270 の映像を受信できる
  - r2 まで送出させるには `videoBitRate` を 5000 にしないと帯域配分が足りず r2 が送出されないため、テストでは 5000 を指定する
- r2 の `active: false`: r2 の outbound-rtp は存在するが bytesSent が 0、packetsSent は 1 になる。r0 / r1 は送出され続ける
- `scaleResolutionDownBy`: 960x540 のソースに対して r0 = 240x135、r1 = 480x270、r2 = 960x540 になり、`frameWidth` に反映される
- `scaleResolutionDownTo`: Firefox は `scaleResolutionDownTo` を適用せず、r0 / r1 がソース解像度の 960x540 のまま送出される。`test.fail` にした。Firefox が `scaleResolutionDownTo` に対応すると `test.fail` が失敗して検知できる
- `scalabilityMode`: Firefox の outbound-rtp には `scalabilityMode` が含まれないため `test.fail` にした。Firefox が `scalabilityMode` を取得できるようになると `test.fail` が失敗して検知できる
- `setSenderParameters()` の encodings 制約 (pending 0014) は顕在化しなかった

### Sora の `simulcast_encodings` について

認証時に払い出す `simulcast_encodings` のスキーマは Sora のドキュメントに従う必要がある。`rid` / `active` / `scaleResolutionDownBy` / `maxBitrate` / `maxFramerate` / `scaleResolutionDownTo` / `scalabilityMode` などが指定できる。

- `scaleResolutionDownTo` は `{"maxWidth": 960, "maxHeight": 540}` の形式で指定する。`{"width": 960, "height": 540}` のように指定すると、Sora は `INVALID-AUTHZ-VALUE` として `simulcast_encodings` の値全体を破棄し、既定の encodings (L1T1、`scaleResolutionDownBy` 4 / 2 / 1) に置き換える
- `scaleResolutionDownTo` は Chrome 131 / Edge 131 以降でのみ利用できる。Chrome では `scaleResolutionDownTo` を active な encodings すべてに指定しないと `setParameters` が `If a resolution is specified on any encoding then it must be specified on all encodings` で失敗する (`active: false` の rid への指定は不要)
- `scalabilityMode` を指定する場合は `scaleResolutionDownBy` も併記する
- 本 issue では `scaleResolutionDownBy` で縮小結果を確認するテスト (pass) と、`scaleResolutionDownTo` を確認するテスト (`test.fail`) の両方を追加した

### 検証結果

- `vp run build` / `vp check` / `vp test run` / `vp exec tsc --noEmit -p e2e-tests/tsconfig.json` は pass した
- `e2e-tests/tests/firefox.test.ts` は `--project="firefox"` で 10 テストが登録されることを確認した
- macOS 27 の実機で Full Disk Access を付与して Playwright の Firefox 155.0 を起動し、OpenH264 を導入した状態で `firefox.test.ts` の 10 テストが pass することを確認した
- Chromium では `shouldSkipFirefoxTest()` により `firefox.test.ts` のテストがすべて skip される (10 skipped) ため、Chromium での配線確認は行っていない。配線は Playwright Firefox 155.0 と CI で確認した
- Chromium の `sendrecv.test.ts` と `simulcast_rid.test.ts` が pass し、既存テストへの退行がないことを確認した

## reopened の理由

マージ後の指示により、テスト環境に GMP プラグイン (OpenH264) を導入せず、H264 のテストを `test.fail` に戻すことになった。解決方法と検証記録を実装に合わせて修正するため reopened にする。
