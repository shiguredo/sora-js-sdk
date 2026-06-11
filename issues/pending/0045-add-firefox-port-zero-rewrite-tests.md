# `firefox-port-zero-rewrite` timeline event のテスト (vitest 単体 + Playwright Firefox E2E) を追加する

- Priority: Low
- Created: 2026-06-11
- Polished:
- Model: Opus 4.7
- Branch: feature/add-firefox-port-zero-rewrite-tests

## 目的

issue 0044 で追加する `firefox-port-zero-rewrite` timeline event および補助関数の動作を検証する自動テストを追加する。具体的には、vitest による純粋関数の単体テストと、Playwright Firefox runner を整備したうえでの実 Firefox を用いた E2E テストを追加する。

0044 は SDK 本体実装 (`src/utils.ts` への純粋関数 2 つ追加、`src/base.ts` の `processOfferSdp` orchestrator 修正) のみを担当し、自動テストは本 issue に分離した。0044 は手動検証手順 (PR 説明に記載) で動作確認する方針。

## 優先度根拠

Low。0044 の SDK 本体実装は手動検証で動作確認できるため、自動テスト追加の緊急性は低い。0044 マージ後に本番運用での `firefox-port-zero-rewrite` 観測値が関連 issue 0015 の意思決定にどの程度有用かを見極めてから、テスト整備の優先度と方法を再検討する。

## 現状

`tests/utils.test.ts` は vitest + jsdom で純粋関数を直接テストするスタイルが既に確立している (例: `createSignalingMessage` のテスト)。一方で Playwright Firefox runner は `playwright.config.ts:91-94` 付近でコメントアウトされており、`.github/workflows/e2e-test.yml` の matrix にも Firefox エントリがない。0044 で追加する純粋関数 (`rewriteOfferSdpPortZero` / `getFirefoxMajorVersion`) とその orchestrator 修正に対する自動テストはまだ存在しない。

関連 issue 0015 でも「Playwright Firefox 自動 E2E (Firefox runner 未整備)」がスコープ外として明示されており、Firefox runner 整備自体を 0044 / 0015 から独立した本 issue として扱う。

## 設計方針

### 単体テスト (vitest + jsdom)

`tests/utils.test.ts` の既存スタイル (`test(...)` 直書き + コメント区切り、`describe` ブロック非導入) に揃え、0044 で追加された純粋関数を直接テストする。

`rewriteOfferSdpPortZero` のテスト項目:

- port=0 の audio m 行のみの SDP を渡すと、戻り値の該当行が port=9 に書き換わり、`kinds` が `["audio"]` になる
- port=0 の video m 行のみの SDP を渡すと、戻り値の該当行が port=9 に書き換わり、`kinds` が `["video"]` になる
- port=0 の audio / video m 行が複数混在する SDP を渡すと、`kinds` に出現順で全種別が並ぶ (重複ありを含む)
- port=0 の m 行がない SDP では、戻り値の `sdp` が入力と同一であり、`kinds` は空配列になる
- `m=application 0` を含む SDP では、戻り値の `sdp` が入力と同一であり、`kinds` は空配列になる
- `m=audio 9` / `m=video 9` (既に port=9) を含む SDP では、戻り値の `sdp` が入力と同一であり、`kinds` は空配列になる
- `m=audio 100` / `m=audio 10` のような「port が 0 で始まる複数桁数値」を含む SDP では書き換えず、`kinds` は空配列になる (正規表現が `0` 単独 + 後続空白で固定されていることの保証)
- `\n` 改行と `\r\n` 改行のどちらでも `^m=` がマッチして書き換わる

`getFirefoxMajorVersion` のテスト項目:

- 実 Firefox 形式の userAgent (`Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0` 等) を渡すとメジャーバージョン番号 (例: `137`) が返る
- `Firefox/137esr` (ESR 派生) でメジャーバージョン番号が返る
- Chrome / Safari / Edge 形式の userAgent を渡すと `null` が返る
- 空文字列を渡すと `null` が返る
- `Firefox/` (バージョン部空) や `Firefox/abc` (非数字) で `null` が返る

### E2E テスト (Playwright Firefox)

`firefox-port-zero-rewrite` event が実 Firefox で発火することを検証するため、Playwright Firefox runner を有効化し、専用 E2E テストを 1 本追加する。

- `playwright.config.ts` の `projects` 配列でコメントアウトされている `{ name: "firefox", use: { ...devices["Desktop Firefox"] } }` を有効化する
- `e2e-tests/tests/firefox_port_zero_rewrite.test.ts` を新規追加する。本テストは Firefox runner でのみ動作させ、それ以外のプロジェクトでは `test.skip` でスキップする
- 既存の WebKit テスト (`e2e-tests/tests/webkit.test.ts`) の skip パターン (`shouldSkipWebKitTest(test.info().project.name)`) に倣い、`e2e-tests/tests/helper.ts` に `shouldSkipFirefoxTest(projectName: string): boolean` を追加する
- 必要なら `e2e-tests/firefox_port_zero_rewrite/index.html` / `main.ts` を新規追加し、`e2e-tests/vite.config.ts` の `rolldownOptions.input` にエントリを追加する。または既存 `e2e-tests/sendrecv/` の構造を流用し、各 role 別 `main.ts` に `connection.on("timeline", ...)` の subscription を追加する判断を行う
- CI workflow (`.github/workflows/e2e-test.yml` 等) のマトリクスに `{ name: "firefox", type: "firefox" }` を追加し、`pnpm exec playwright install firefox --with-deps` で Firefox バイナリを取得する

### テストシナリオ (要決定)

E2E テストのシナリオは「multistream sendrecv で接続 → publisher を切断 → 残った subscriber 側の `callbacks.timeline` に `firefox-port-zero-rewrite` event が届く (`data.kinds` が空配列ではなく `data.firefoxVersion` が `null` ではない)」を想定するが、これは Sora 側の transceiver 解放挙動に依存する。本 issue 着手時に以下を確定する必要がある:

- 対象 Sora バージョンの固定方法 (`.env` 環境変数の追加、または既存 CI 設定で参照される `VITE_TEST_*` 系の更新)
- 何 connection 接続して、どの順序で disconnect すれば `m=audio 0` / `m=video 0` を含む re-offer / update が発生するかの再現条件
- 上記が困難な場合の代替案 (例: `processOfferSdp` を直接呼ぶ合成 SDP ハーネスを `page.evaluate` 内で構築する)

### スコープ外

- 既存の Chromium / WebKit / Edge 系 Playwright プロジェクトで動いているテスト群を Firefox 対応させる作業。本 issue では新規追加した `firefox_port_zero_rewrite.test.ts` のみを Firefox runner で動かす
- 0044 の SDK 本体実装 (`rewriteOfferSdpPortZero` / `getFirefoxMajorVersion` の追加、`processOfferSdp` の orchestrator 修正)
- 関連 issue 0015 の Firefox 再現確認 (本 issue で Firefox runner が整備されれば 0015 でも流用可能だが、0015 の再現確認自体は 0015 で扱う)

## 完了条件

- `tests/utils.test.ts` に `rewriteOfferSdpPortZero` と `getFirefoxMajorVersion` の単体テストを追加し、すべて pass する
- `playwright.config.ts` の Firefox runner を有効化する
- `e2e-tests/tests/firefox_port_zero_rewrite.test.ts` を新規追加し、Playwright Firefox runner で pass する
- 必要に応じて `e2e-tests/firefox_port_zero_rewrite/` 配下のエントリ HTML/TS と `e2e-tests/vite.config.ts` の更新、`e2e-tests/tests/helper.ts` への `shouldSkipFirefoxTest` 追加を行う
- CI workflow (`.github/workflows/e2e-test.yml` 等) で Firefox runner を実行する設定を追加し、`pnpm exec playwright install firefox --with-deps` で Firefox バイナリを取得する
- 既存の vitest テストと既存の Chromium / WebKit / Edge 系 E2E テストが退行なくそのまま通る
- ローカルで `pnpm test` と `pnpm exec playwright test --project=firefox` の両方が通る
- CHANGES.md の `## develop` セクションに本 issue 用の `[ADD]` エントリを追記する。具体的なエントリ文面は着手時に確定する (例: `[ADD] Playwright Firefox runner を有効化し firefox-port-zero-rewrite の自動 E2E テストを追加する`)

## pending にした理由

以下の前提条件が確定するまで実装に着手しないため、本 issue は `issues/pending/` に配置している。

- **Playwright Firefox runner 整備の影響範囲**: CI 設定変更 (`.github/workflows/e2e-test.yml` 等のマトリクス拡張、Firefox バイナリの install 経路追加、`pnpm exec playwright install firefox --with-deps` のフロー追加) を含み、既存の Chromium / WebKit / Edge 系 runner で動いているテスト群への副作用 (`webServer` の port 9000 共有による競合リスク、`workers: 1` 制約下での実行時間増、既存テスト全件が Firefox runner で flaky になるリスク) の評価が事前に必要
- **E2E テストシナリオの Sora 側挙動依存**: 「publisher 切断 → port=0 を含む re-offer」が Sora バージョンと multistream 設定に依存し、Sora バージョン固定や `.env` 環境変数追加など、E2E 基盤側の判断が必要となる
- **0044 の本番観測値の有用性確認**: 0044 (実装本体) を先にマージし、本番運用での `firefox-port-zero-rewrite` 観測値が 0015 の意思決定にどの程度有用かを見極めてから、本 issue の自動テスト整備の優先度と方法を再検討する

着手判断のトリガー:

- 0044 がマージされ、本番運用で `firefox-port-zero-rewrite` 観測値が一定期間蓄積された
- 0015 の意思決定 (mid 限定化を実装するか / workaround を撤去するか / 現状維持か) の方向性が見えた
- 上記を踏まえ、`firefox-port-zero-rewrite` の自動テスト整備が必要と判断された

## 関連 issue

- **0044 (`feature/add-firefox-port-zero-rewrite-timeline-event`)**: `firefox-port-zero-rewrite` timeline event の SDK 本体実装。本 issue は 0044 のテスト分を独立 issue として分離したもの
- **0015 (`feature/fix-process-offer-sdp-port-zero`)**: `processOfferSdp` の port=0 書き換えを mid 限定化する bug fix。本 issue で Playwright Firefox runner が整備されれば、0015 の第 1 段階「Firefox 再現確認」を自動化する基盤としても再利用できる
