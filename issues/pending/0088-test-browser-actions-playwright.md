# Browser Actions でセットアップしたブラウザを Playwright で利用できるようにする

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/test-browser-actions-playwright
- Polished: {YYYY-MM-DD}

## 目的

GitHub Actions で Browser Actions (<https://browser-actions.dev/>) を使ってセットアップしたブラウザ (Chrome / Edge の Canary など) を Playwright から利用できるようにし、E2E テストのブラウザ対応範囲を広げる。

## 優先度根拠

Low。現行の E2E は Google Chrome / Beta と WebKit をカバーしており、Canary / Dev の検証は範囲の拡大である。テスト基盤の改善であり、接続やメディアの挙動には影響しない。

## 現状

### Playwright でインストールできるブラウザに制限がある

- `playwright.config.ts` の project には Google Chrome Dev / Canary、Microsoft Edge Beta / Dev / Canary が定義されている
- しかし `.github/workflows/e2e-test.yml` の matrix は `Chromium` / `Google Chrome` / `Google Chrome Beta` のみで、Edge 系は Playwright のインストールが不安定なためコメントアウトされている
- Chrome Dev / Canary は `.github/workflows/e2e-test-h265.yml` で self-hosted macOS 上に Homebrew で個別インストールしている
- Browser Actions を利用すれば Windows / macOS で Chrome / Edge の Canary をセットアップできると元 issue にある

## 設計方針

未確定。少なくとも以下を決める必要がある。

- Browser Actions でセットアップしたブラウザの実行ファイルパスを Playwright にどう渡すか (`executablePath` / channel)
- 対象ブラウザと実行する workflow (`e2e-test.yml` に組み込むか、canary 専用 workflow に分けるか)
- 既存の self-hosted H.265 workflow との役割分担
- OS ごとの対応可否 (Browser Actions は Windows / macOS が中心)
- 失敗時の扱い (Canary / Dev の flaky を許容するか)

## 完了条件

- Browser Actions でセットアップしたブラウザで Playwright の E2E テストが実行できること
- CI で安定して実行できること
- 対象外の環境の skip 条件が説明されていること

## pending にした理由

- **実現方法が未確定**: Browser Actions のセットアップ結果を Playwright に渡す方法、対象ブラウザ、workflow の構成が決まっていない
- **優先度が低い**: 現行のブラウザ対応で主要な検証はできており、Canary / Dev の追加は緊急性が低い
- **元 issue (shiguredo/sora-oss-private#1998) が Browser Actions の紹介のみで、SDK 側の設計が固まっていない**

着手判断のトリガー:

- Browser Actions のセットアップ結果を Playwright で使う方法が確認できた
- 対象ブラウザと workflow の構成が決定した
