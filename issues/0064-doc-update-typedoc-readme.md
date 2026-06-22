# TYPEDOC.md を API ドキュメントの表紙として刷新する

- Priority: Low
- Created: 2026-06-22
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/update-typedoc-readme
- Polished: {YYYY-MM-DD}

## 目的

`TYPEDOC.md` を、`typedoc.json` の `readme` で参照され `apidoc/index.html` のトップに展開される API ドキュメントの「表紙」として刷新する。SDK 概要・最小サンプル・`sendrecv` / `sendonly` / `recvonly` / `messaging` の 4 つの role の使い分け・関連ドキュメントへの導線を追加し、ライセンス文と OSS 注意書きは最下部に残す。

## 優先度根拠

Low。現在 `TYPEDOC.md` を表紙として参照しているのは内部ドキュメント管理リポジトリ側に手動コピーされた `apidoc/` のみで、SDK 利用者の主導線は時雨堂ドキュメントサイト側のチュートリアル / examples。0063 (typedoc 生成物の GitHub Pages デプロイ) がマージされ `https://shiguredo.github.io/sora-js-sdk/` で配信が稼働してから初めて、本表紙の品質が一般利用者の体験を直接左右する。0063 着手前に磨いても意味が薄いため、0063 マージ後に着手する想定で Low。

## 現状

- `/Users/voluntas/shiguredo/sora-js-sdk/TYPEDOC.md` は全 35 行。内訳は SDK 紹介 1 文 + OSS 注意書き (英 / 日) + Apache 2.0 ライセンス全文 (約 20 行)
- `typedoc.json` の `readme` で `./TYPEDOC.md` を参照し、`apidoc/index.html` のトップに展開される
- 一方で `src/sora.ts` には 4 つの role (`sendrecv` / `sendonly` / `recvonly` / `messaging`) それぞれに `@example` 付きの JSDoc が既に書かれており、表紙に転載できる素材は揃っている
- README.md (リポジトリトップ) は別に存在し、こちらは npm パッケージ閲覧者向けの導入として機能している (約 7000 字)。`TYPEDOC.md` と役割が分かれている

## 設計方針

- `TYPEDOC.md` の冒頭に「Sora JS SDK API ドキュメント表紙」として、以下を簡潔に並べる
  - SDK が何をするものか (1 〜 2 文。WebRTC SFU Sora に接続するクライアント SDK である旨)
  - 最小コードサンプル (1 例。`Sora.connection(...)` → `sendrecv` の起動)
  - 4 つの role の使い分け (`sendrecv` / `sendonly` / `recvonly` / `messaging` を 1 行ずつ説明、`src/sora.ts` の JSDoc から表現を揃える)
  - 関連ドキュメントへのリンク (時雨堂ドキュメントサイトのチュートリアル / examples / Sora 本体ドキュメント)
- 既存のライセンス文と OSS 注意書きはセクションごと最下部に移動する (削除はしない)
- 文体は README.md と同じく日本語、全角半角間の半角スペース規約に従う
- typedoc が Markdown を HTML に変換する仕様上、コードフェンスの言語指定 (` ```typescript `) はそのまま使える
- ファイル名は `TYPEDOC.md` のまま据え置く (`typedoc.json` の `readme` 設定を変更しない)
- ブラウザタブのタイトル (`apidoc/index.html` の `<title>`) は現状 `typedoc.json` の `name` が未設定のため `package.json` の `name` (`sora-js-sdk`) が使われる。表紙刷新と合わせて `typedoc.json` に `name: "Sora JavaScript SDK"` を設定するかは検討事項 (本 issue の範囲内で扱う。`typedoc.json` を変更するため 0065 とは編集箇所が異なる)

## 完了条件

- `TYPEDOC.md` が刷新され、`vp run doc` で生成した `apidoc/index.html` のトップに「表紙」として機能する内容 (SDK 概要・最小サンプル・role 使い分け・リンク) が表示される
- ライセンス文・OSS 注意書きはセクション位置を最下部に変えるが、削除はしない
- `typedoc.json` は無編集
- 0063 が稼働した後の `https://shiguredo.github.io/sora-js-sdk/` トップに表紙として表示されることを確認できる

## 解決方法

### ファイル変更

- `/Users/voluntas/shiguredo/sora-js-sdk/TYPEDOC.md` を書き換える
- セクション順序の参考: (1) タイトル + 概要 → (2) 最小サンプル → (3) 4 つの role の使い分け → (4) 関連ドキュメントリンク → (5) OSS 注意書き → (6) ライセンス

### 検証

- ローカルで `vp install --frozen-lockfile && vp run doc` を実行し、`apidoc/index.html` を開いて表紙の表示を目視確認する
- 0063 マージ後は `https://shiguredo.github.io/sora-js-sdk/` で確認する

### 変更履歴

- `CHANGES.md` の `## develop` セクションに `### misc` の `[UPDATE]` として 1 行追加する (具体的な文面は実装時にコミット内容に合わせて確定)

## 関連 issue

- **0063 (open)**: typedoc 生成物の GitHub Pages デプロイ。本 issue の表紙刷新が意味を持つのは 0063 マージ後で配信が始まってから
