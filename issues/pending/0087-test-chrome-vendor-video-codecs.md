# Chrome (Intel VPL / AMD AMF / NVIDIA Video Codec SDK) の E2E テストを実現する

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/test-chrome-vendor-video-codecs
- Polished: {YYYY-MM-DD}

## 目的

Chrome が利用する GPU ベンダー実装 (Intel VPL / AMD AMF / NVIDIA Video Codec SDK) の映像エンコード/デコードを使った E2E テストを実現する。ハードウェアエンコーダ固有の問題を CI で検出できるようにする。

## 優先度根拠

Low。CPU エンコードでの E2E は既にあり、GPU ベンダー実装の検証は範囲の拡大である。self-hosted ランナーや GPU が必要で実現難度が高く、元 issue のコメントでも「急がない」とされている。

## 現状

### 現行の E2E は CPU エンコード前提

- `.github/workflows/e2e-test.yml` は GitHub-hosted の `ubuntu-24.04` / `macos-15` / `windows-2025-vs2026` で実行する
- GPU ベンダー実装のエンコーダを明示的に使うテストや、ランナーの GPU を検証する仕組みは無い
- 元 issue では「self-hosted 前提」「sudo なしで homebrew で Chrome をインストールできるようにすれば頑張れそう」とされている
- 元 issue のコメントでは「Ubuntu の Chrome では正常に HEVC が使えない可能性があるので、急がないことにする」とされている

## 設計方針

未確定。少なくとも以下を決める必要がある。

- どのベンダー (Intel VPL / AMD AMF / NVIDIA Video Codec SDK) の環境を用意するか
- self-hosted ランナーの構成 (GPU、OS、Chrome のインストール方法)
- GPU が使われたことをどう検証するか (`RTCCodecStats` / `encoderImplementation` など)
- H.265 などコーデック依存のテストとの関係 (Ubuntu Chrome での HEVC 可否)
- 安定して実行できない環境の skip 条件

## 完了条件

- 対象ベンダーの GPU を使った映像 E2E テストが追加されていること
- GPU が使われたことをテストで確認できること
- self-hosted ランナーで安定して実行できること
- 実行できない環境の skip 条件がコメントで説明されていること

## pending にした理由

- **実行環境が未確定**: self-hosted ランナーと GPU の準備、Chrome のインストール方法が決まっていない
- **優先度が低い**: 元 issue のコメントで「急がないことにする」と明示されている
- **元 issue (shiguredo/sora-oss-private#2026) が環境検討の段階で止まっている**

着手判断のトリガー:

- 対象ベンダーと self-hosted ランナーの構成が決定した
- GPU 使用の検証方法が決定した
