# `e2e-tests/sendonly` にビデオコーデック指定 UI を追加する

- Priority: Medium
- Created: 2026-06-17
- Completed: 2026-06-17
- Model: Kimi
- Branch: feature/add-video-codec-type-to-sendonly-e2e-test
- Polished: {YYYY-MM-DD}

## 目的

`sendonly_recvonly` テストで sendonly 側のビデオコーデックを明示的に指定できるようにし、特定コーデック（VP9 / AV1 等）での動作検証を可能にする。

## 優先度根拠

Medium。`sendrecv` や `simulcast_sendonly` には既に `#video-codec-type` セレクトボックスがあり、sendonly/recvonly の sendonly 側だけ未対応になっている。統一性を持たせ、コーデック別の e2e 検証を手動・自動の両方で行えるようにする。

## 現状

- `e2e-tests/sendonly/index.html` には `#video-codec-type` セレクトボックスが無い
- `e2e-tests/sendonly/main.ts` は `getVideoCodecType()` を import しておらず、`ConnectionOptions` に `videoCodecType` を設定していない
- `e2e-tests/tests/sendonly_recvonly.test.ts` は `video/VP9` になっていることを期待しているが、これはブラウザ / Sora 側のデフォルト選択に依存している

## 設計方針

`sendrecv` と同様の構成にする。

- `index.html` に `#video-codec-type` セレクトボックスを追加する
  - 選択肢は `未指定 / VP8 / VP9 / AV1` とする（`sendrecv` と同じ。H264 / H265 は Self-hosted 等の限定環境が必要なためコメントアウト）
- `main.ts` で `getVideoCodecType()` を使い、選択値を `ConnectionOptions.videoCodecType` に設定する
- `sendonly_recvonly.test.ts` は現状の `video/VP9` 期待を維持するか、セレクトボックスで `VP9` を選択してから接続するように変更する

## 完了条件

- `e2e-tests/sendonly/index.html` に `#video-codec-type` セレクトボックスが追加される
- `e2e-tests/sendonly/main.ts` で `videoCodecType` が `ConnectionOptions` に渡される
- `e2e-tests/tests/sendonly_recvonly.test.ts` が既存の `video/VP9` 検証を維持したまま pass する
- `pnpm typecheck` / `pnpm lint` が pass する
- `CHANGES.md` `## develop` に `[ADD]` エントリ 1 件を追加する

## 解決方法

- `e2e-tests/sendonly/index.html` に `#video-codec-type` セレクトボックスを追加し、選択肢を `未指定 / VP8 / VP9 / AV1` とした。H264 / H265 は `sendrecv` と同様にコメントアウトしている。
- `e2e-tests/sendonly/main.ts` で `getVideoCodecType()` を import し、connect 時に選択値を取得して `SoraClient` コンストラクタに渡すようにした。`SoraClient` では `ConnectionOptions.videoCodecType` に設定して `sora.sendonly()` を呼び出す。
- `e2e-tests/tests/sendonly_recvonly.test.ts` で sendonly 接続前に `#video-codec-type` から `VP9` を選択するようにし、既存の `video/VP9` 検証を維持した。
- `CHANGES.md` `## develop` `### misc` に `[ADD]` エントリを追加した。
- `vp check` / `vp test` が pass することを確認した。
