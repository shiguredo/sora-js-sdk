# Chrome の authz_simulcast_encodings テストで scaleResolutionDownTo の解像度反映を確認する

- Created: 2026-10-23
- Completed: {YYYY-MM-DD}
- Branch: feature/test-chrome-scale-resolution-down-to
- Polished: 2026-10-26
- Reporter: @miosakuma

## 目的

Chromium / Google Chrome / Google Chrome Beta の E2E で、authz の `simulcast_encodings` に指定した `scaleResolutionDownTo` が実際に送出解像度へ反映されることを `frameWidth` / `frameHeight` で確認する。Chrome は `scaleResolutionDownTo` に対応しているため、WebKit の `test.fail` テストと対になる pass テストとして、Chrome 系の回帰を検知できる状態にする。

0118 で WebKit の `simulcast_encodings` と解像度の assert を正した内容を Chrome 側にも取り込む。0116 で追加予定の Firefox テストとも、`simulcast_encodings` の形式と assert 方針を揃える。

## 現状

- `e2e-tests/tests/authz_simulcast_encodings.test.ts` は `e2e-tests/simulcast_sendonly/` を使い、`#simulcast-encodings` に次の値を指定している
  - `[{active: true, rid: "r0", scalabilityMode: "L1T1"}, {active: false, rid: "r1"}, {active: false, rid: "r2"}]`
- `scaleResolutionDownTo` は指定しておらず、outbound-rtp の `frameWidth` / `frameHeight` も assert していない (bytes / packets / scalabilityMode のみ)
- `e2e-tests/simulcast_sendonly/` の `getUserMedia` は 960x540 を要求している。縮小先が 960x540 のままだと、縮小結果を確認できない
- Chrome は `scaleResolutionDownTo` に対応している (Chrome 131 以降) が、このリポジトリの E2E でその効果を確認するテストは無い

## 設計方針

- 0118 は closed 済みで、0118 の WebKit テストは幅を完全一致で assert し、高さはエンコーダのアラインメントで変動するため assert していない。本 issue では幅を完全一致で assert し、高さは範囲で assert する
- `e2e-tests/tests/authz_simulcast_encodings.test.ts` の `simulcast_encodings` を webkit.test.ts と同じ形式にする
  - `scaleResolutionDownTo: {"maxHeight": 540, "maxWidth": 960}` を active な r0 に指定する
  - r1 / r2 は `{active: false, rid: "r1"}` / `{active: false, rid: "r2"}` のままにする。`scaleResolutionDownTo` は active な encodings にだけ指定すればよい (0118 の Chromium 実行で確認済み)
  - `scalabilityMode: "L1T1"` は既存どおり指定する。`scaleResolutionDownTo` を指定する場合は `scaleResolutionDownBy` は不要 (指定しても `scaleResolutionDownTo` が優先される)
- ソース解像度を縮小先より大きくするため、`e2e-tests/simulcast_sendonly/main.ts` の `getUserMedia` 制約を 1280x720 に変更する
  - `simulcast_sendonly` は `simulcast_rid.test.ts` でも使うため、変更後に `simulcast_rid.test.ts` が退行なく pass し、`authz_simulcast_encodings.test.ts` が pass することを確認する
  - `simulcast.test.ts` は `e2e-tests/simulcast/` を使う別 fixture だが、Chrome 系の退行確認として実行する
- outbound-rtp の `frameWidth` / `frameHeight` を assert し、`scaleResolutionDownTo` の縮小結果を確認する
  - `frameWidth` は `scaleResolutionDownTo` の `maxWidth` である 960 と完全一致で確認する
  - `frameHeight` はエンコーダのアラインメントで 540 からずれるため、528 以上 544 以下で確認する (0118 の Chromium 実行では 225 -> 224、450 -> 448 と 16 の倍数に丸められた)
  - r0 の `bytesSent` / `packetsSent` / `scalabilityMode` の assertion は維持する。r1 / r2 は `active: false` のため `bytesSent` / `packetsSent` の assertion を維持する
- `authz_simulcast_encodings.test.ts` は `scaleResolutionDownTo` が Chrome 131 / Edge 131 以降でしか利用できないため、Chrome 系のプロジェクトでのみ実行する
  - `playwright.config.ts` の全プロジェクト実行時に WebKit で失敗しないよう、WebKit / Firefox では `test.skip` する
  - `e2e-test.yml` の matrix は Chromium / Google Chrome / Google Chrome Beta のみで、WebKit は `e2e-test-webkit.yml` で `webkit.test.ts` だけを実行するため、CI では Chrome 系だけが実行される
- Chromium / Google Chrome / Google Chrome Beta の e2e-test matrix で pass することを確認する
- 実行後に Sora が返す offer の `encodings` に指定した `scaleResolutionDownTo` が含まれることを確認する。Sora のログを参照できる場合は `INVALID-AUTHZ-VALUE` が出ないことも確認する

## 完了条件

- `e2e-tests/tests/authz_simulcast_encodings.test.ts` で `scaleResolutionDownTo` を指定している
- ソース解像度が縮小先より大きい
- outbound-rtp の `frameWidth` / `frameHeight` を assert している (幅は 960、高さは 528 以上 544 以下)
- Chromium / Google Chrome / Google Chrome Beta で pass する
- WebKit / Firefox では `test.skip` する
- 既存の Chrome 系 E2E テストが退行なく pass する
- Sora が返す offer の `encodings` に指定した `scaleResolutionDownTo` が含まれる。Sora のログを参照できる場合は `INVALID-AUTHZ-VALUE` が出ない
- `vp check` / `vp test run` が pass する
- `CHANGES.md` の `## develop` の `### misc` に `[ADD]` のテスト追加エントリを担当者行付きで追記する

## 関連 issue

- closed 0118: WebKit の `simulcast_encodings` テスト修正。本 issue は 0118 の後続で、0118 で決めた encodings と assert を Chrome 側に取り込む
- open 0116: Firefox のコーデックと simulcast encodings の E2E テスト。`firefox.test.ts` は 0116 で追加される予定で、`scaleResolutionDownTo` は Firefox 未対応のため `test.fail` にする予定
