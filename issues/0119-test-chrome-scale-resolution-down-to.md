# Chrome の authz_simulcast_encodings テストで scaleResolutionDownTo の解像度反映を確認する

- Created: 2026-10-23
- Completed: {YYYY-MM-DD}
- Branch: feature/test-chrome-scale-resolution-down-to
- Polished: {YYYY-MM-DD}
- Reporter: @miosakuma

## 目的

Chromium / Google Chrome の E2E で、authz の `simulcast_encodings` に指定した `scaleResolutionDownTo` が実際に送出解像度へ反映されることを `frameWidth` / `frameHeight` で確認する。Chrome は `scaleResolutionDownTo` に対応しているため、WebKit / Firefox のテスト (`test.fail`) と対になる pass テストとして、Chrome 系の回帰を検知できる状態にする。

0118 で WebKit の `simulcast_encodings` と解像度の assert を正すため、その内容を Chrome 側にも取り込む。

## 現状

- `e2e-tests/tests/authz_simulcast_encodings.test.ts` は `e2e-tests/simulcast_sendonly/` を使い、`#simulcast-encodings` に次の値を指定している
  - `[{active: true, rid: "r0", scalabilityMode: "L1T1"}, {active: false, rid: "r1"}, {active: false, rid: "r2"}]`
- `scaleResolutionDownTo` は指定しておらず、outbound-rtp の `frameWidth` / `frameHeight` も assert していない (bytes / packets / scalabilityMode のみ)
- `e2e-tests/simulcast_sendonly/` の `getUserMedia` は 960x540 を要求している。縮小先が 960x540 のままだと、縮小結果を確認できない
- Chrome は `scaleResolutionDownTo` に対応している (Chrome 131 以降) が、このリポジトリの E2E でその効果を確認するテストは無い

## 設計方針

- 0118 の対応後に着手する。0118 で決定した `simulcast_encodings` の形式と assert 方針を Chrome 側に揃える
- `e2e-tests/tests/authz_simulcast_encodings.test.ts` の `simulcast_encodings` を webkit.test.ts / firefox.test.ts と同じ形にする
  - `scaleResolutionDownTo: {"maxWidth": 960, "maxHeight": 540}` を active な encodings に指定する
  - `active: false` の encoding は指定しなくてよい。Chrome の setParameters の制約は active な encodings のみに適用される (active: false の rid に `scaleResolutionDownTo` を指定しなくても接続できることを確認済み)
  - `scalabilityMode` を指定する場合は `scaleResolutionDownBy` も併記する
- ソース解像度を縮小先より大きくする (例: 1280x720 のソースを 960x540 に縮小する)
  - `e2e-tests/simulcast_sendonly/` の `getUserMedia` 制約を 1280x720 に変更するか、専用の fixture を追加する
  - 既存の `simulcast.test.ts` / `simulcast_rid.test.ts` は解像度を固定値で assert していないが、変更後に退行がないことを確認する
- outbound-rtp の `frameWidth` / `frameHeight` を assert し、`scaleResolutionDownTo` の縮小結果を確認する (WebKit / Firefox と同じ観点)
- assert は 0118 で決めた方針 (固定値の完全一致ではなく範囲や関係性を含む) に揃える。アスペクト比の維持やエンコーダのアラインメントで数 px ずれることがあるため
- Chromium / Google Chrome / Google Chrome Beta の e2e-test matrix で pass することを確認する
- 実行後に Sora のログへ `INVALID-AUTHZ-VALUE` が出ないことを確認する

## 完了条件

- `e2e-tests/tests/authz_simulcast_encodings.test.ts` で `scaleResolutionDownTo` を指定している
- ソース解像度が縮小先より大きい
- outbound-rtp の `frameWidth` / `frameHeight` を assert している
- Chromium / Google Chrome / Google Chrome Beta で pass する
- 既存の Chrome 系 E2E テストが退行なく pass する
- Sora のログに `INVALID-AUTHZ-VALUE` が出ない
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` にテスト追加のエントリを追記する

## 関連 issue

- open 0118: WebKit の `simulcast_encodings` テスト修正。本 issue は 0118 の後続で、0118 で決めた encodings と assert を Chrome 側に取り込む
- closed 0116: Firefox のコーデックと simulcast encodings の E2E テスト。`firefox.test.ts` の `scaleResolutionDownTo` は Firefox 未対応のため `test.fail`
