# macOS の Google Chrome stable インストールが 302 リダイレクト未追従で失敗するのを playwright-core へのパッチで修正する

- Priority: High
- Created: 2026-06-04
- Completed: 2026-06-04
- Model: Opus 4.8
- Branch: feature/fix-chrome-stable-mac-install-redirect

## 目的

e2e-test ワークフローの macos-15 マトリクスで `pnpm exec playwright install chrome` が失敗するのを修正する。Playwright 1.60.0 同梱の `reinstall_chrome_stable_mac.sh` は `curl` でリダイレクトを追従しない (`-L` なし)。2026-06-02 に Google が macOS stable の dmg 配信を 302 リダイレクト化したため、リダイレクト先の dmg を取得できず、302 応答の本体 (text/html) が `googlechrome.dmg` として保存され、後続の `hdiutil attach` が失敗する。

## 優先度根拠

High とする。

- e2e-test はスケジュール実行 (平日 JST 10:00-16:00 に 30 分ごと) と push 時に走る常用 CI であり、macos-15 の Google Chrome (chrome チャネル) のジョブが恒常的に失敗する。
- 通知が `failure_and_fixed` のため、失敗のたびに Slack 通知が飛び続ける。
- 失敗ジョブが CI 実行時間とコストを無駄に消費する。

## 現状

playwright-core 1.60.0 の `bin/reinstall_chrome_stable_mac.sh`:

```
curl --retry 3 -o ./googlechrome.dmg https://dl.google.com/chrome/mac/universal/stable/GGRO/googlechrome.dmg
```

`curl -sI` で確認すると、この URL は `HTTP/2 302` を返し、`location: https://dl.google.com/tag/s/appguid%3D...%26brand%3DGGRO/chrome/mac/universal/stable/googlechrome.dmg` へリダイレクトする。`-L` がないためリダイレクトを追従せず、302 応答の本体が dmg として保存される。

## 原因と時系列

- 2026-05-11: Playwright 1.60.0 リリース。この時点では当該 URL は 200 を返し、スクリプトは正常に動作していた。
- 2026-06-02: Google が macOS stable dmg を 302 リダイレクト化 (応答の `last-modified` より)。これ以降 `-L` なしの取得が壊れた。
- Playwright 本家 main も未修正 (`-L` なし)。1.60.1 は未リリースで latest は 1.60.0、次は 1.61.0 alpha のみ。関連 issue/PR も見当たらない (発生から日が浅いため未報告と思われる)。

これは Playwright のバグというより Google 側の配信仕様変更による breakage であり、Playwright のアップグレードで解消する見込みは現時点でない。

## 影響範囲

302 リダイレクトが発生するのは macOS stable のみ。以下は影響しない (`curl -sI` で 200 を確認)。

- macOS beta (`reinstall_chrome_beta_mac.sh`): `https://dl.google.com/chrome/mac/universal/beta/googlechromebeta.dmg` は 200。
- Linux stable / beta (`*_linux.sh`): `https://dl.google.com/linux/direct/...amd64.deb` は 200。
- Windows stable / beta (`*_win.ps1`): `net.webclient` の `DownloadFile` がリダイレクトを自動追従する。

`PLAYWRIGHT_DOWNLOAD_HOST` 系のアーティファクトリポジトリ機能は chromium / firefox / webkit のバンドルブラウザ専用 (`_downloadURLs` 経由) であり、`chrome` チャネル (`reinstall_chrome_stable_mac.sh` 経由) には効かないため、回避策にはならない。

## 設計方針

pnpm の `patchedDependencies` で `playwright-core@1.60.0` にパッチを当て、`reinstall_chrome_stable_mac.sh` の `curl` に `-L` を追加する。本家修正後に撤去する暫定対応とする。

## 完了条件

- e2e-test の macos-15 × Google Chrome (chrome) の install ステップが通過する。
- 他のマトリクス (他 OS / chromium / chrome-beta) に影響しない。

## 解決方法

1. `patches/playwright-core@1.60.0.patch` を作成し、`reinstall_chrome_stable_mac.sh` の `curl` に `-L` を追加した。
2. `pnpm-workspace.yaml` の `patchedDependencies` に `playwright-core@1.60.0: patches/playwright-core@1.60.0.patch` を登録した。
3. `CHANGES.md` の `## develop` の `### misc` に `[FIX]` エントリを追記した (CI/開発依存の修正でありライブラリ利用者の機能には影響しないため misc が妥当)。
4. `prek.toml` の `trailing-whitespace` / `end-of-file-fixer` フックから `patches/` を除外した。パッチのコンテキスト行 (空行) の行頭スペースが trim されると pnpm のパッチ適用が corrupt patch で壊れるため。

### 検証結果

- `curl -sI` で当該 stable URL が 302 を返し、`location` が `brand=GGRO` 付き URL であることを確認した。
- `curl -L -r 0-0` で最終 URL に到達し、`http_code: 206` / `content_type: application/x-apple-diskimage` を確認した (`-L` で正しい dmg を取得できる)。
- macOS beta / Linux stable・beta / Windows msi の各 URL が 200 を返し、`-L` 追加が不要であることを確認した。
- `pnpm test` (vitest) が 2 ファイル 72 件すべて成功することを確認した。

(注: e2e-test ワークフローでの最終確認は push 後の CI で行う。)
