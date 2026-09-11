# Safari <-> Chrome の H.265 E2E テストを実現する

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/test-safari-chrome-h265
- Polished: {YYYY-MM-DD}

## 目的

Safari と Chrome の間で H.265 (HEVC) の送受信ができることを E2E テストで確認できるようにする。現状の H.265 E2E は macOS 上の Google Chrome 同士のみで、Safari が絡む組み合わせは未検証。

## 優先度根拠

Low。既存の Chrome 同士の H.265 E2E は通っており、Safari 対応は検証範囲の拡大である。ブラウザのバージョンや OS の組み合わせに依存し実現難度が高いため、優先度は低い。

## 現状

### H.265 E2E は Chrome のみ

- `.github/workflows/e2e-test-h265.yml` は self-hosted macOS (Apple Silicon) 上で Google Chrome / Beta / Dev / Canary を Homebrew でインストールし、`e2e-tests/tests/h265.test.ts` を実行する
- matrix に Safari は含まれていない
- `.github/workflows/e2e-test-webkit.yml` は WebKit (Playwright) で `e2e-tests/tests/webkit.test.ts` を実行するが、H.265 は扱っていない
- `e2e-tests/tests/h265.test.ts` は `shouldSkipH265Test` で self-hosted macOS の Google Chrome 以外を skip する
- 元 issue のコメントでは「頑張れば行けそうだけどスゴイ面倒くさそう」とされている

## 設計方針

未確定。少なくとも以下を決める必要がある。

- Safari をどの環境で動かすか (self-hosted macOS 上の実 Safari か、Playwright の WebKit か)
- H.265 の Safari / Chrome 間の送受信を `h265.test.ts` に組み込むか、別テストとして追加するか
- Safari と Chrome のコーデックネゴシエーション (Safari が H.265 を送受信できる条件) の確認
- OS / Safari / Chrome のバージョン依存と、どの組み合わせを必須にするか

## 完了条件

- Safari <-> Chrome の H.265 送受信を確認する E2E テストが追加されていること
- CI (self-hosted) で安定して実行できること
- 実行できない組み合わせの skip 条件がコメントで説明されていること

## pending にした理由

- **実現方法が未確定**: Safari を実機で動かすか WebKit を使うか、テストの構成、バージョン依存の扱いが決まっていない
- **実現難度が高く優先度が低い**: 元 issue のコメントでも難易度が高いとされており、急いでいない
- **元 issue (shiguredo/sora-oss-private#2025) が実現方法の検討段階で止まっている**

着手判断のトリガー:

- Safari を動かす環境と、H.265 の組み合わせをどこまで必須にするかが決定した
