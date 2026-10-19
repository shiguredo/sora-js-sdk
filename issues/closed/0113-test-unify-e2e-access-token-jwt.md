# E2E テストの access_token の生成を JWT に統一する

- Created: 2026-10-16
- Completed: 2026-10-19
- Branch: feature/refactor-unify-e2e-access-token-jwt
- Polished: 2026-10-16

## 目的

`e2e-tests` の fixture が access_token を生成する方法を JWT に統一し、どの fixture でも認証のプライベートクレームを指定できるようにする。現在はシークレットキーをそのまま access_token に指定する方式が 16 fixture あり、その方式では JWT のプライベートクレームを載せられない。`type redirect` 非対応の SDK でクラスターアフィニティを無効化する対応 (issue 0114) はプライベートクレームの指定を必要とするため、その前提を整える。

## 優先度根拠

Medium。単独では CI の失敗を解消しないが、issue 0114 の前提になる。放置すると access_token の生成方法が 2 方式のまま残り、プライベートクレームを使う検証を追加するたびに fixture ごとに方式を選び直すことになる。

## 現状

### access_token の生成が 2 方式に分かれている

- JWT を生成して指定している fixture (`e2e-tests/src/misc.ts` の `generateJwt` を使う): `h265` / `rpc` / `simulcast_sendonly` / `simulcast_sendonly_webkit`
- シークレットキーをそのまま access_token に指定している fixture: `data_channel_signaling_only` / `fake_sendonly` / `fake_stereo_audio` / `fake_stereo_audio_sendrecv` / `messaging` / `recvonly` / `sendonly` / `sendonly_audio` / `sendonly_reconnect` / `sendrecv` / `sendrecv_webkit` / `simulcast` / `simulcast_recvonly` / `spotlight_recvonly` / `spotlight_sendonly` / `spotlight_sendrecv`

### シークレットキーをそのまま指定する方式ではプライベートクレームを載せられない

- テストサーバーは access_token を JWT として検証し、プライベートクレームの値を認証ウェブフックの払い出しとして扱う (`e2e-tests/rpc/main.ts` の `rpc_methods` などの指定がこの仕組みを使っている)
- シークレットキーをそのまま access_token に指定した場合は JWT ではないため、プライベートクレームを指定できない

## 設計方針

- `e2e-tests/src/misc.ts` に access_token を生成する共通ヘルパを追加し、fixture はすべてこれを使う。シークレットキーをそのまま access_token に指定する方式は廃止する
- 共通ヘルパは `generateJwt` を包み、接続の直前に呼ぶ。`generateJwt` の有効期限が 30 秒のため、再接続する fixture は再接続時にも生成し直す
- 既存の JWT を使う fixture のプライベートクレーム (`rpc` の RPC 用クレームなど) はそのまま残す
- fixture が持つ `metadata` の型は `{ access_token: string }` のままでよい (中身が JWT になるだけ)
- 変更内容に応じて `CHANGES.md` の `## develop` の `### misc` にエントリを追記する

## テスト方針

- モック / スタブ禁止のため、access_token が JWT になっていることは実装のコードレビューで確認する
- テストサーバーへ接続する `e2e-tests` の E2E が従来どおり通ることを確認する

## 完了条件

- `e2e-tests` のすべての fixture が `e2e-tests/src/misc.ts` の共通ヘルパで access_token を生成していること
- シークレットキーをそのまま access_token に指定している fixture が残っていないこと
- 既存のプライベートクレーム (`rpc` の RPC 用クレームなど) が維持されていること
- ローカルで `vp test run` / `vp check` / `vp exec tsc --noEmit` が通ること
- E2E (chromium) が通ること
- `CHANGES.md` の `## develop` の `### misc` にエントリが追記されていること

## 解決方法

`e2e-tests/src/misc.ts` に `generateAccessToken` を追加し、全 20 fixture が接続の直前にこれで JWT を生成するようにした。シークレットキーをそのまま access_token に指定する方式は廃止した。再接続する fixture は再接続時にも JWT を生成し直す。既存の JWT fixture のプライベートクレームは維持している。
