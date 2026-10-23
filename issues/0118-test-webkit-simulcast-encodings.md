# WebKit の simulcast_encodings テストが Sora の authz スキーマに違反した値を使っている

- Created: 2026-10-23
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-webkit-simulcast-encodings-test
- Polished: {YYYY-MM-DD}
- Reporter: @miosakuma

## 目的

WebKit の E2E テストが Sora の authz スキーマに違反した `simulcast_encodings` を渡しており、Sora がその値を破棄して既定値で動作している。そのためテスト名が意図する「WebKit で scaleResolutionDownTo が反映されないこと」を検証できておらず、実行のたびに Sora のログへ `INVALID-AUTHZ-VALUE` の警告が出る。テストの前提と期待値を正しくして、意味のある検証と警告の解消を行う。

## 現状

`e2e-tests/tests/webkit.test.ts` の `test.fail("WebKit Authz simulcast_encodings ScaleResolutionDownTo")` が、`e2e-tests/simulcast_sendonly_webkit` の `#simulcast-encodings` に次の値を入れて接続している。

- `scaleResolutionDownTo: { width: 960, height: 540 }` を r0 / r1 にだけ指定している
- r2 は `{ active: false, rid: "r2" }` のみ

この値には次の問題がある。

- Sora の authz の `simulcast_encodings` で `scaleResolutionDownTo` は `{"maxWidth": 960, "maxHeight": 540}` の形式で指定する。`width` / `height` は不正なため、Sora は `simulcast_encodings` の値全体を `INVALID-AUTHZ-VALUE` として破棄し、既定の encodings (L1T1、`scaleResolutionDownBy` 4 / 2 / 1) に置き換える
- `scaleResolutionDownTo` は Chrome 131 / Edge 131 以降でのみ利用でき、Chrome では全 encodings に指定しないと `setParameters` が `If a resolution is specified on any encoding then it must be specified on all encodings` で失敗する。r0 / r1 にだけ指定しているため、例え形式を直しても Chrome では接続できない
- テストの assertion は `bytesSent` / `packetsSent` だけで、`frameWidth` / `frameHeight` を確認していない。名前が示す scaleResolutionDownTo の反映を検証できていない
- `e2e-tests/simulcast_sendonly_webkit` の fake media は 960x540 で、`scaleResolutionDownTo` の指定値 960x540 と同じ解像度のため、仮に形式を直しても WebKit が scaleResolutionDownTo を無視した結果と区別できない
- `test.fail` のため、上記の理由で失敗しても suite は pass し、値が不正であることに気づけない

Sora 2027.1.0-canary.5 の authz で上記の警告が出ることは確認済み。正しい形式と全 encodings への指定を行えば、Chromium では r0 / r1 / r2 の outbound-rtp が 960x540 になることも確認済み。

## 設計方針

- `simulcast_encodings` の `scaleResolutionDownTo` は `{"maxWidth": 960, "maxHeight": 540}` の形式にする
- `active: false` の rid も含めた全 encodings に `scaleResolutionDownTo` を指定する
- `e2e-tests/simulcast_sendonly_webkit` の fake media のソース解像度を縮小先より大きくする (例: 1280x720 のソースを 960x540 に縮小する)
  - WebKit が scaleResolutionDownTo を無視する場合、outbound-rtp の `frameWidth` / `frameHeight` は 1280x720 のままになる
  - scaleResolutionDownTo が反映される場合、960x540 になる
- assertion に outbound-rtp の `frameWidth` / `frameHeight` を追加し、scaleResolutionDownTo の反映を確認する
- WebKit が未対応の間は `test.fail` を維持し、対応したら suite が失敗して気づける状態にする
- Chromium で同じ条件の scaleResolutionDownTo が 960x540 に反映されることを確認し、期待値の妥当性を検証する
- 実行後に Sora のログへ `INVALID-AUTHZ-VALUE` が出ないことを確認する

## 完了条件

- `e2e-tests/tests/webkit.test.ts` の `simulcast_encodings` が Sora の authz スキーマに準拠している
- `e2e-tests/simulcast_sendonly_webkit` の fake media のソース解像度が `scaleResolutionDownTo` の縮小先より大きい
- outbound-rtp の `frameWidth` / `frameHeight` で scaleResolutionDownTo の反映を確認している
- WebKit で `webkit.test.ts` が期待どおりの失敗 (`test.fail`) として動作し、他の WebKit テストが退行なく pass する
- Sora のログに `INVALID-AUTHZ-VALUE` が出ない
- Chromium で同じ条件の scaleResolutionDownTo が `frameWidth` / `frameHeight` に反映されることを確認する
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` にテスト修正のエントリを追記する

## 関連 issue

- closed 0116: Firefox のコーデックと simulcast encodings を確認する E2E テスト。本 issue は 0116 の調査中に、既存の WebKit テストが Sora の authz スキーマに違反した値を使っていることを見つけたもの
- pending 0045: `firefox-port-zero-rewrite` のテスト。WebKit のテスト修正とは独立
