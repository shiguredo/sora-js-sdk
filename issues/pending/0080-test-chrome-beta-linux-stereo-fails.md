# Ubuntu + Google Chrome Beta で stereo audio の E2E テストが失敗する

- Priority: Low
- Created: 2026-09-11
- Completed: {YYYY-MM-DD}
- Branch: feature/fix-chrome-beta-linux-stereo
- Polished: {YYYY-MM-DD}

## 目的

`e2e-test` workflow の Ubuntu + Google Chrome Beta の組み合わせでのみ、stereo audio の E2E テストが失敗する事象を追跡する。

これは SDK の不具合ではなく Chromium (Chrome Beta の Linux 版) 側の不具合であり、SDK 側では修正できない。テストが通るようになったことを確認して closed にするための追跡 issue とする。

## 優先度根拠

Low。特定のブラウザ (Google Chrome Beta の Linux 版) の特定バージョンでだけ発生するブラウザ側の不具合であり、SDK の機能や他ブラウザの E2E には影響しない。ただし CI が常時赤くなるため、修正の確認と CI の扱いを決める必要がある。

## 現状

### CI の実行構成

`.github/workflows/e2e-test.yml` は `ubuntu-24.04` / `macos-15` / `windows-2025-vs2026` と `Chromium` / `Google Chrome` / `Google Chrome Beta` の matrix で `e2e-tests` を実行する。stereo audio は `e2e-tests/tests/stereo_audio.test.ts` と `e2e-tests/tests/stereo_audio_sendrecv.test.ts` が担当する。

### 失敗する組み合わせ

元 issue の調査 (2025-08 時点) では、次の結果だった。

| プラットフォーム | ブラウザ                              | バージョン    | 結果 |
| ---------------- | ------------------------------------- | ------------- | ---- |
| Ubuntu           | Chromium                              | 139.0.7258.5  | 成功 |
| Ubuntu           | Google Chrome                         | 139.0.7258.66 | 成功 |
| Ubuntu           | Google Chrome Beta                    | 140.0.7339.5  | 失敗 |
| Ubuntu           | Microsoft Edge / Edge Beta / Edge Dev | 139 / 140 系  | 成功 |
| macOS            | Google Chrome Canary                  | 141 系        | 成功 |
| macOS            | Microsoft Edge Canary                 | 141.0.3493.0  | 成功 |

- macOS では発生しない
- Ubuntu でのみ発生する
- Chrome Dev では修正済み
- Edge では発生しない
- 左右チャンネルが同じ周波数として処理される (実質モノラル化される)
- Linux 向けの Chrome Dev は提供されていないため、修正版での検証ができない

参考にした元 issue の調査用 GitHub Actions: <https://github.com/shiguredo/sora-js-sdk/actions/runs/16900864087>

### SDK 側の stereo 実装

stereo は SDK の `audioOpusParamsStereo` のシグナリングと、`src/base.ts` の `createAnswer` が `forceStereoOutput` 時に `addStereoToFmtp` で answer SDP の opus fmtp に `stereo=1` を付与する実装で扱う。これらは macOS や他ブラウザでは正常に動作しており、今回の失敗はこの SDK 実装に起因しない。

## 設計方針

未確定。少なくとも以下を決める必要がある。

- Google Chrome Beta のバージョンが 140.0.7339.5 を超えた時点で再度 CI を実行し、失敗しなくなったことを確認する
- 恒久的な対処として、Ubuntu + Google Chrome Beta の組み合わせで stereo テストを skip するかどうか。skip すると唯一 Chrome Beta Linux での回帰を検知できなくなるため、トレードオフがある
- SDK 側の変更は不要。必要なら CI 側の除外設定のみを検討する

## 完了条件

- Ubuntu + Google Chrome Beta で stereo audio の E2E テストが通ること
- または Chromium 側の修正を含むバージョンで失敗しないことを確認し、CI が green になること
- CI を green に保つために skip などの対処を入れた場合は、その理由がワークフローまたはテストにコメントとして残っていること

## pending にした理由

- **SDK 側で修正できない**: 原因は Chromium (Chrome Beta 140.0.7339.5 の Linux 版) 側の不具合であり、SDK の変更では解決しない
- **検証手段が限られる**: Linux 向けの Chrome Dev が提供されておらず、修正版での検証ができない。Google Chrome Beta / Stable の更新を待って再実行するしかない
- **元 issue (shiguredo/sora-oss-private#2225) が「テストが通るようになったら閉じる」という共有用の追跡 issue として起票されている**

着手判断のトリガー:

- Google Chrome Beta が 140.0.7339.5 を超えて更新された (更新後に CI を再実行して結果を確認する)
- Chrome Beta Linux での stereo テストを恒久的に skip するかどうかを決める必要が生じた
