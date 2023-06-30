# リリース

## リリース環境

- Node.js
  - v16.20.0 以上
- pnpm
  - v8.6.5 以上
- pnpm install
  - これで事前に利用するライブラリをインストールする

## canary リリース手順

- pnpm run lint を実行する
- pnpm run test を実行する
- pnpm run release:canary を実行する
  - Next version を確認する
  - git commit をするか聞かれるので確認して yes を選択する
  - git tag をするか聞かれるので確認して yes を選択する
- git push -u origin develop
- git push origin `<tag>`
- pnpm publish --tag canary を実行する

## リリース手順

- 動作確認:
  - git clean -ffdx を実行する
  - pnpm install を実行する
  - pnpm run build を実行する
  - pnpm run lint を実行する
  - pnpm run test を実行する
  - https://shiguredo.github.io/sora-js-sdk/check.html で各ブラウザ・デバイスでの挙動を確認する
- バージョン更新:
  - git flow release start `<tag>` で開始する
  - CHANGES.md にタグを打つバージョンで書き込む
  - package.json のバージョン番号を更新する
  - 年度が変わっている場合にはコピーライトの年度も更新する（README.md, TYPEDOC.md）
  - git flow release finish `<tag>` で終了する
  - git push -u origin develop master
  - git push origin `<tag>`
- リリース:
  - GitHub Releases にリリースを作成する
  - pnpm publish を実行する （事前に `pnpm publish --dry-run` を実行して変なところがないかを軽く確認する）
  - sora-js-sdk のドキュメントリポジトリ（private）のリリースノートを更新する
