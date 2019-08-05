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
- package.json の version をタグを打つバージョンに変更する
- yarn release を実行する
    - Lint が実行されるので通ることを確認する
    - バイナリができるのでそれをコミットする
- git flow release finish <tag> で終了する
- git push -u origin develop master --tags
