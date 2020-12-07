# リリース

**この資料は時雨堂社内向けです**

## リリース環境

- npm
    - v6.9.0 以上
- yarn
    - v1.16.0 以上
- yarn install
    - これで事前に利用するライブラリをインストールする



## リリース手順

- git flow release start <tag> で開始する
- CHANGES.md にタグを打つバージョンで書き込む
- yarn lint を実行する
- yarn test を実行する
- yarn release:minor を実行する
    - minor バージョンが更新されていることを確認する
    - 差分をコミットする
- git flow release finish <tag> で終了する
- git push -u origin develop master --tags

## canary リリース手順

- yarn lint を実行する
- yarn test を実行する
- yarn release:canary を実行する
    - canary バージョンが更新されていることを確認する
    - コミットメッセージをバージョンにして差分をコミットする(例. git commit -m "2020.1.0-canary.0")
- git push -u origin develop --tags
