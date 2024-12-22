# Sora JavaScript SDK サンプル

## 使い方

```bash
$ git clone git@github.com:shiguredo/sora-js-sdk.git
$ cd sora-js-sdk
# .env.local を作成して適切な値を設定してください
$ cp .env.template .env.local
$ pnpm install
$ pnpm build
$ pnpm dev
```

## WHIP/WHEP

SDK では対応していない WHIP/WHEP のサンプルを用意しています。

WHIP/WHEP を利用するには whip/whep が有効になっており、
whip_turn/whep_turn も有効になっている必要があります。

さらにブラウザから fetch する場合は CORS の設定が必要です。
