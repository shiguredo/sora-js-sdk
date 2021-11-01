# リリース

**この資料は時雨堂社内向けです**

## リリース環境

- Node.js
    - v16.13.0 以上
- npm
    - v8.1.0 以上
- npm install
    - これで事前に利用するライブラリをインストールする


## リリース手順

- git flow release start <tag> で開始する
- CHANGES.md にタグを打つバージョンで書き込む
- npm run lint を実行する
- npm run test を実行する
- npm run release:minor を実行する
    - Next version を確認する
    - コミットメッセージを<tag>にして差分をコミットする(例. git commit -m "2020.2.0")
- git flow release finish <tag> で終了する
- git push -u origin develop master
- git push origin <tag>
- npm publish を実行する

## canary リリース手順

- npm run lint を実行する
- npm run test を実行する
- npm run release:canary を実行する
    - Next version を確認する
    - コミットメッセージをバージョンにして差分をコミットする(例. git commit -m "2020.1.0-canary.0")
- git push -u origin develop master
- git push origin <tag>
- npm publish --tag canary を実行する
