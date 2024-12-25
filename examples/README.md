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

## WHIP/WHEP

SDK では対応していないブラウザレベルでの WHIP/WHEP の E2E テストを用意しています。

このサンプルは Chrome / Edge でのみ動作します。

WHIP/WHEP を利用するには whip/whep が有効になっており、
whip_turn/whep_turn も有効になっている必要があります。

さらにブラウザから fetch する場合は CORS の設定が必要です。
