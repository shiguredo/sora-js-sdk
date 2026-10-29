# CI の GitHub-hosted macOS runner を macos-15 から macos-26 に更新する

- Created: 2026-10-23
- Completed: {YYYY-MM-DD}
- Branch: feature/update-macos-runner
- Polished: 2026-10-26
- Reporter: @miosakuma

## 目的

GitHub-hosted の macOS runner が `macos-15` のままなので、新しい `macos-26` に更新する。新しい macOS / ブラウザの組み合わせで E2E を継続的に検証できるようにし、`macos-15` の提供終了やサポート切れに先回りする。

## 現状

GitHub-hosted の macOS runner を使っている箇所は次の 3 つ。

- `.github/workflows/e2e-test.yml` の matrix `os` の `macos-15`
  - `ubuntu-24.04` / `macos-15` / `windows-2025-vs2026` の 3 OS で Chromium / Google Chrome / Google Chrome Beta を実行している
- `.github/workflows/e2e-test-canary.yml` の `runs-on: macos-15`
  - Homebrew で Chrome Canary / Edge Canary をインストールして実行している
- `.github/workflows/e2e-test-firefox.yml` の `runs-on: macos-15`
  - Firefox のコーデックと simulcast を確認する E2E テストを実行している

self-hosted の macOS runner (`e2e-test-webkit.yml` / `e2e-test-h265.yml`) はラベル (`self-hosted`, `macOS`, `ARM64`, `Apple-M2-Pro`) と `group: Self` で指定しており、OS のバージョンはリポジトリ側では管理していない。

## 設計方針

- `macos-15` を `macos-26` に更新する。GitHub Actions の macOS runner は `macos-26` または `macos-15` を使う規約のため、新しい `macos-26` に揃える
- 変更後に CI (`e2e-test` / `e2e-test-canary`) が成功することを確認してから develop にマージするため、`feature/update-macos-runner` ブランチで作業する。`feature/*` への push で該当 workflow が実行される
- 対象は `.github/workflows/e2e-test.yml` の matrix `os` と `.github/workflows/e2e-test-canary.yml` / `.github/workflows/e2e-test-firefox.yml` の `runs-on`
  - `ubuntu-24.04` / `windows-2025-vs2026` は変更しない
- self-hosted runner の OS バージョン更新はリポジトリ管理外のため本 issue のスコープ外とする
- `e2e-test-canary.yml` は Homebrew で Canary ブラウザをインストールしているため、macos-26 でも同じ手順が動作することを確認する
- `actions/checkout` / `voidzero-dev/setup-vp` / `playwright install` が macos-26 で動作することを確認する
- E2E の期待値は OS 依存の部分 (H264 / H265 の対応など) があるため、macos-26 で既存テストが退行なく pass することを確認する

## 完了条件

- `.github/workflows/e2e-test.yml` の matrix `os` が `macos-26` になっている
- `.github/workflows/e2e-test-canary.yml` の `runs-on` が `macos-26` になっている
- `.github/workflows/e2e-test-firefox.yml` の `runs-on` が `macos-26` になっている
- `e2e-test` の macOS ジョブ (macos-26) が Chromium / Google Chrome / Google Chrome Beta で pass する
- `e2e-test-canary` の macOS ジョブが pass する
- `e2e-test-firefox` の macOS ジョブが pass する
- ubuntu / windows のジョブに影響がない
- `CHANGES.md` の `## develop` の `### misc` に `[UPDATE]` エントリを追記する

## 関連 issue

- closed 0117: CI 設定のみの変更の先行例 (`Branch: N/A`)
- closed 0038: CI ジョブ追加の先行例
