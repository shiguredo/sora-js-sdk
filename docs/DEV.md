# 開発

**この資料は SDK 開発者向けです**

## 開発環境

- Node.js
  - v18 以上
- pnpm
  - https://pnpm.io/
  - v8 以上

## 開発準備

- `pnpm install` を実行
- `pnpm run start` でローカルサーバを起動する

## 開発

sora-js-sdk のトップディレクトリでコマンドを実行することによりビルドやフォーマットを行う

- `pnpm run build` packages 以下をビルドする
- `pnpm run lint` packages 以下のコードに lint を実行する
- `pnpm run fmt` packages 以下のコードに formatter を実行する
- `pnpm run test` packages 以下のテストを実行する

## パッケージ更新

sora-js-sdk の package 更新

- `pnpm up -L` を実行する

sora-js-sdk/packages の package 更新

- `pnpm up -L -r` を実行する

## ドキュメント作成

- `pnpm run doc` を実行する
