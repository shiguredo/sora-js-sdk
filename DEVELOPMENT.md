# 開発

**この資料は SDK 開発者向けです**

## 開発環境

- npm
    - v6.9.0 以上
- yarn
    - v1.16.0 以上
- yarn install
    - これで事前に利用するライブラリをインストールする

## 開発準備

- `yarn install` を実行
- `yarn bootstrap` を実行して packages 以下の各パッケージで依存関係をインストール
- `yarn start` でローカルサーバを起動する

## 開発
sora-js-sdk のトップディレクトリでコマンドを実行することによりビルドやフォーマットを行う
- `yarn build` packages 以下をビルドする
- `yarn lint` packages 以下のコードに lint を実行する
- `yarn fmt` packages 以下のコードに formatter を実行する
- `yarn test` packages 以下のテストを実行する

## パッケージ更新
sora-js-sdk の package 更新
- `yarn upgrade` を実行する

sora-js-sdk/packages の package 更新
- `yarn packages:upgrade` を実行する
- `yarn test` を実行する
- `yarn build` を実行する
