# WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っている

- Created: 2026-10-23
- Completed: 2026-10-23
- Branch: feature/fix-webkit-simulcast-encodings-test
- Polished: 2026-10-23
- Reporter: @miosakuma

## 目的

WebKit の E2E テストが Sora の authz スキーマに違反した `simulcast_encodings` を渡しており、Sora がその値を破棄して既定値で動作している。そのためテスト名が意図する「WebKit で scaleResolutionDownTo が反映されないこと」を検証できておらず、実行のたびに Sora のログへ `INVALID-AUTHZ-VALUE` の警告が出る。テストの前提と期待値を正しくして、意味のある検証と警告の解消を行う。

## 現状

`e2e-tests/tests/webkit.test.ts` の `test.fail("WebKit Authz simulcast_encodings ScaleResolutionDownTo")` が、`e2e-tests/simulcast_sendonly_webkit` の `#simulcast-encodings` に次の値を入れて接続している。

- `scaleResolutionDownTo: { width: 960, height: 540 }` を r0 / r1 にだけ指定している
- r2 は `{ active: false, rid: "r2" }` のみ

この値には次の問題がある。

- Sora の authz の `simulcast_encodings` で `scaleResolutionDownTo` は `{"maxHeight": 540, "maxWidth": 960}` の形式で指定する。`width` / `height` は不正なため、Sora は `simulcast_encodings` の値全体を `INVALID-AUTHZ-VALUE` として破棄し、既定の encodings (L1T1、`scaleResolutionDownBy` 4 / 2 / 1) に置き換える
- `scaleResolutionDownTo` は Chrome 131 / Edge 131 以降でのみ利用でき、Chrome では active な全 encodings に指定しないと `setParameters` が `If a resolution is specified on any encoding then it must be specified on all encodings` で失敗する。r2 は `active: false` のため r0 / r1 にだけ指定しても Chrome の検証は通るが、現状は r0 / r1 の形式が `width` / `height` で不正なため、Sora の authz で値全体が破棄される
- テストの assertion は `bytesSent` / `packetsSent` だけで、`frameWidth` / `frameHeight` を確認していない。名前が示す scaleResolutionDownTo の反映を検証できていない
- `e2e-tests/simulcast_sendonly_webkit` の fake media は 960x540 で、`scaleResolutionDownTo` の指定値 960x540 と同じ解像度のため、仮に形式を直しても WebKit が scaleResolutionDownTo を無視した結果と区別できない
- `test.fail` のため、上記の理由で失敗しても suite は pass し、値が不正であることに気づけない

Sora 2027.1.0-canary.5 の authz で上記の警告が出ることは確認済み。正しい形式で指定すれば Chromium では scaleResolutionDownTo が outbound-rtp の解像度に反映されることも確認済み。r2 は `active: false` のため、outbound-rtp の `frameWidth` / `frameHeight` は確認対象にしない。

Sora の authz スキーマと対応ブラウザの記述は Sora のドキュメント「映像のエンコーディングパラメーターのカスタマイズ」に基づく (2026-10 時点。スキーマは変更され得る)。

## 設計方針

- `simulcast_encodings` の `scaleResolutionDownTo` は `{"maxHeight": 225, "maxWidth": 400}` のような形式にする
- `scaleResolutionDownTo` は active な r0 / r1 に指定し、r2 は `{ active: false, rid: "r2" }` のままにする。Chrome の検証は active な encodings のみを対象とするため、r2 への指定は不要
- `e2e-tests/simulcast_sendonly_webkit` の fake media (960x540) より小さい縮小先を指定する
  - r0 = `{"maxHeight": 225, "maxWidth": 400}`、r1 = `{"maxHeight": 450, "maxWidth": 800}`
  - WebKit が scaleResolutionDownTo を無視する場合、Playwright の WebKit では独自の既定スケーリングで r0 = 240x135、r1 = 480x270 になる
  - scaleResolutionDownTo が反映される場合、r0 = 400x225、r1 = 800x450 になる (高さはエンコーダのアラインメントで 224 / 448 になることがある)
- r0 / r1 の assertion に outbound-rtp の `frameWidth` を追加し、scaleResolutionDownTo の反映を確認する。r2 は `active: false` のため、`bytesSent` / `packetsSent` の assertion を維持する
- Safari の simulcast は VP8 / H264 / H265 で動作し、VP9 ではレイヤーが 1 本しか送出されないため、テストでは VP8 を明示する
- WebKit が未対応の間は `test.fail` を維持し、対応したら suite が失敗して気づける状態にする
- Chromium で同じ条件の scaleResolutionDownTo が r0 / r1 に反映されることを確認し、期待値の妥当性を検証する
- 実行後に Sora のログへ `INVALID-AUTHZ-VALUE` が出ないことを確認する

## 完了条件

- `e2e-tests/tests/webkit.test.ts` の `simulcast_encodings` が Sora の authz スキーマに準拠している
- `e2e-tests/simulcast_sendonly_webkit` の fake media のソース解像度が `scaleResolutionDownTo` の縮小先より大きい
- r0 / r1 の outbound-rtp の `frameWidth` で scaleResolutionDownTo の反映を確認している。r2 は `active: false` のまま `bytesSent` / `packetsSent` で確認する
- WebKit で `webkit.test.ts` が期待どおりの失敗 (`test.fail`) として動作し、他の WebKit テストが退行なく pass する
- Sora が返す offer の `encodings` に、指定した `scaleResolutionDownTo` がそのまま含まれる (Sora のログに `INVALID-AUTHZ-VALUE` が出ないことは Sora 側で確認する)
- Chromium で同じ条件の scaleResolutionDownTo が r0 / r1 の `frameWidth` に反映されることを確認する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` にテスト修正のエントリを追記する

## 関連 issue

- open 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト。本 issue は 0116 の調査中に、既存の WebKit テストが Sora の authz スキーマに違反した値を使っていることを見つけたもの
- pending 0045: `firefox-port-zero-rewrite` のテスト。WebKit のテスト修正とは独立

## 解決方法

`e2e-tests/tests/webkit.test.ts` の `WebKit Authz simulcast_encodings ScaleResolutionDownTo` テストを修正した。

- `e2e-tests/tests/webkit.test.ts` の `simulcast_encodings` を Sora の authz スキーマに合わせた
  - `scaleResolutionDownTo` を `{"maxHeight": 225, "maxWidth": 400}` (r0) と `{"maxHeight": 450, "maxWidth": 800}` (r1) に修正した
  - 960x540 のソースより小さい値にすることで、scaleResolutionDownTo の反映を frameWidth で検出できるようにした
  - active な r0 / r1 にだけ指定し、r2 は `{ active: false, rid: "r2" }` のままにした (Chrome の setParameters 制約は active な encodings のみが対象)
  - `scalabilityMode` の指定は残した。WebKit は `scalabilityMode` を IDL で公開していないため無視し、outbound-rtp では独自の既定値 (L1T3) を返す。コメントアウトされていた assertion は意味を持たないため削除した
- Safari の simulcast は VP8 / H264 / H265 で動作し、VP9 ではレイヤーが 1 本しか送出されず r0 / r1 の 2 レイヤーを確認できないため、テストで VP8 を明示するようにした
- r0 / r1 の outbound-rtp に `frameWidth` の assertion を追加した
  - 幅は scaleResolutionDownTo の maxWidth (400 / 800) と完全一致で確認する
  - 高さはアスペクト比の維持とエンコーダのアラインメントで 1 から 2 px 変動するため、assertion は幅のみにした
- `test.fail` は維持した。WebKit が scaleResolutionDownTo に対応したときに suite が失敗して気づける

### 検証結果

- WebKit で `webkit.test.ts` を実行し、sendrecv のテストは pass、`ScaleResolutionDownTo` のテストは期待どおりの失敗を含めて suite が pass することを確認した
  - Playwright の WebKit は scaleResolutionDownTo を適用せず、独自の既定スケーリングで r0 = 240x135、r1 = 480x270 を送出するため、400 / 800 の assertion で失敗する
  - WebKit で encodings 未指定の simulcast は VP8 / H264 / H265 では 3 レイヤー、VP9 では 1 レイヤー (r0) だけになることを確認した。テストでは VP8 を明示している。実 Safari での確認は未実施。Sora のドキュメントでは Safari 26.0 は VP9 / AV1 のサイマルキャスト未対応とされている
- Chromium で同じ `simulcast_encodings` を指定すると、outbound-rtp は r0 = 400x224、r1 = 800x448 になった。幅は maxWidth と一致し、高さは 16 の倍数へのアラインメントで 1 から 2 px 小さくなる
  - 高さはエンコーダのアラインメントで変動するため、assertion は幅のみにした
  - `videoBitRate` は 1500 でも r0 / r1 が送出された
- Sora が返した offer の `encodings` に `scaleResolutionDownTo` がそのまま含まれることを確認した。authz の値として受理されていると判断した。Sora のログ (`INVALID-AUTHZ-VALUE`) は Sora 側のログを参照できないため未確認
- 検証環境は macOS 27.0.1、Playwright 1.63.0 同梱の WebKit 26.6 / Chromium 153.0.8010.12、Sora 2027.1.0-canary.5
- `vp run build` / `vp check` / `vp test run` は pass した。E2E は `vp exec playwright test --project=WebKit e2e-tests/tests/webkit.test.ts` で実行した
