# Sora JavaScript SDK E2E テスト

## 使い方

```bash
$ git clone git@github.com:shiguredo/sora-js-sdk.git
$ cd sora-js-sdk
# .env.local を作成して適切な値を設定してください
$ cp .env.template .env.local
$ pnpm install
$ pnpm build
$ pnpm e2e-test
```

## WHIP/WHEP E2E テスト

SDK では対応していないブラウザレベルでの WHIP/WHEP の E2E テストを用意しています。
環境変数に `E2E_TEST_WISH=true` を設定することで実行する事ができます。

このサンプルは Chrome でのみ動作します。

WHIP/WHEP の E2E テストを実行する場合は、
`whip` と `whep` が有効になっており、
`whip_turn` と `whep_turn` も有効になっている必要があります。

> [!WARNING]  
> ブラウザから fetch する場合は CORS の設定が必要です。
