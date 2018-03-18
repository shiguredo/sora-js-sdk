# リリース

**この資料は時雨堂社内向けです**

## リリース環境

- npm
    - v5.7.1 以上
- yarn
    - v1.5.1 以上
- yarn install
    - これで事前に利用するライブラリをインストールする

## リリース手順

- git flow release start <tag> で開始する
- CHANGES.md にタグを打つバージョンで書き込む
- package.json の version をタグを打つバージョンに変更する
- npm run build を実行する
    - バイナリができるのでそれをコミットする
- git flow release finish <tag> で終了する
- git push -u origin develop master --tags
