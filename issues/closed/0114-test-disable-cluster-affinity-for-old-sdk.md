# `type redirect` 非対応の SDK では cluster_affinity を無効化する

- Created: 2026-10-16
- Completed: 2026-10-19
- Branch: feature/update-disable-cluster-affinity-for-old-sdk
- Polished: 2026-10-16

## 目的

`npm-pkg-e2e-test` の `2021.1.7` のジョブが、テストサーバーが返す `type: redirect` を処理できずに接続に失敗し、ジョブのタイムアウトで cancelled になる状態を解消する。`type redirect` に対応していない SDK では、access_token のプライベートクレームで `cluster_affinity: false` を払い出し、redirect が発生しないようにする。

## 優先度根拠

High。`npm-pkg-e2e-test` は月曜から金曜まで毎日実行される。2026-10-12 以降は `2021.1.7` の 4 ジョブ (Node 22 / 24 × Google Chrome / Microsoft Edge) が接続に失敗し、多くの実行で `timeout-minutes: 20` に達して cancelled になる。CI が恒常的に赤くなり Slack 通知も毎日飛び、1 回あたり最大 20 分のランナー時間を無駄にしている。

## 現状

### テストサーバーが `type: redirect` を返すようになった

- テストサーバー側でクラスターアフィニティが有効になり、接続時に `{"type": "redirect", "location": "..."}` が返ってシグナリング WebSocket が閉じられるようになった
- `sora-js-sdk` は 2021.2.0 で `type redirect` 対応を追加している (`CHANGES.md` の 2021.2.0 の `[UPDATE] type redirect 対応を追加する`)。`src/base.ts` の `signaling` の `ws.onmessage` の `SIGNALING_MESSAGE_TYPE_REDIRECT` 分岐が `signalingOnMessageTypeRedirect` で `location` へ再接続する処理にあたる
- それより前のバージョンは `type: redirect` を解釈できないため `#connection-id` が設定されず、テストは 30 秒のタイムアウトで失敗して最大 3 回リトライされる。ログには `ConnectError: Signaling failed. CloseEventCode:1000 CloseEventReason:'REDIRECT'` が出る
- `.github/workflows/npm-pkg-e2e-test.yml` の matrix の中で `type redirect` に対応していないのは `2021.1.7` だけ (`2021.2.3` 以降は対応済み)

### cluster_affinity は認証のプライベートクレームで指定する

- `cluster_affinity` は認証 (authz) で払い出す値で、`false` のときは同一ノードへの集約を行わず、接続したノードで WebRTC を確立する (redirect が発生しない)。`true` のときは同一セッションの接続を同一ノードへ集約する
- metadata での指定は廃止されており、access_token (JWT) のプライベートクレームに指定する (テストサーバーが JWT のプライベートクレームを認証の払い出しに使う仕組みは `e2e-tests/rpc/main.ts` の `rpc_methods` と同じ)
- そのため、access_token を JWT で生成していない fixture では指定できない。access_token の生成を JWT に統一する対応 (issue 0113) を前提とする

## 設計方針

- issue 0113 で追加する access_token 生成の共通ヘルパ内で、`Sora.version()` を見て `type redirect` に対応していないバージョンのときだけ `cluster_affinity: false` をプライベートクレームに含める。判定は `type redirect` 対応が入った 2021.2.0 で切る。現行 matrix では `2021.1.7` だけが該当する
- 対応しているバージョンでは `cluster_affinity` を指定せず、サーバーの既定 (有効) のままにする。これにより redirect を挟む接続経路の検証は維持する
- 判定はブラウザ側で動く fixture から使える必要があるため `e2e-tests/src/misc.ts` に置く (access_token の生成はブラウザ側の fixture で行うため、Playwright テスト側の `e2e-tests/tests/helper.ts` の `checkVersionSupport` は使わない)
- 変更内容に応じて `CHANGES.md` の `## develop` の `### misc` にエントリを追記する

## テスト方針

- モック / スタブ禁止のため、プライベートクレームの内容は実装のコードレビューで確認する
- 実際に `type: redirect` が発生しないことは、テストサーバーへ接続する `npm-pkg-e2e-test` の `2021.1.7` のジョブで確認する

## 完了条件

- `2021.1.7` の access_token のプライベートクレームに `cluster_affinity: false` が含まれること
- `2021.2.3` 以降の access_token に `cluster_affinity` が含まれないこと
- `npm-pkg-e2e-test` を `workflow_dispatch` で実行し、`2021.1.7` の 4 ジョブが 20 分のタイムアウトに達せず完了すること
- ローカルで `vp test run` / `vp check` / `vp exec tsc --noEmit` が通ること
- E2E (chromium) が通ること
- `CHANGES.md` の `## develop` の `### misc` にエントリが追記されていること

## 解決方法

`e2e-tests/src/misc.ts` の `generateAccessToken` で `Sora.version()` を確認し、`type redirect` に対応していない `2021.2.0` 未満の sora-js-sdk のときだけ、認証のプライベートクレームに `cluster_affinity: false` を含めるようにした。対応しているバージョンでは指定せず、テストサーバーの既定 (有効) のままにする。バージョンは CalVer (年.リリース番号.パッチ) として比較し、解析できない場合はエラーにする。

ローカルで実際の sora-js-sdk 2021.1.7 を e2e-tests に読み込んでテストサーバーへ接続し、未対応のままでは `ConnectError: Signaling failed. CloseEventCode:1000 CloseEventReason:'REDIRECT'` で接続に失敗すること、`cluster_affinity: false` を含めると接続できることを確認した。現行の 2026.2.0-canary.0 では `cluster_affinity` が含まれず接続できることも確認した。`npm-pkg-e2e-test` の 2021.1.7 ジョブでの確認はブランチを push した後に CI で行う。
