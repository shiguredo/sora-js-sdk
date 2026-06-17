# `.github/workflows/npm-publish.yml` の publish 2 経路に並ぶ運用コメントを整理する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-tidy-npm-publish-comments
- Polished: {YYYY-MM-DD}

## 目的

`.github/workflows/npm-publish.yml` の `npm install -g npm@latest` ステップに対する運用コメントが、視覚的に直後の `npm publish` ステップにも係って見える状態を整理し、コメントの根拠範囲を明確にする。あわせて参照先 pnpm issue の鮮度を確認し、本 workaround がまだ必要かどうかをドキュメントとして整える。0033 で `npm publish` 行に `--provenance` が追加されて行が長くなり、誤読リスクが上がった現状の負債を解消する。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。可読性・保守性の改善であり、緊急性は無いが、0033 でフラグ追加によりコメント位置の問題が顕在化したため、関連変更が記憶に新しいうちに整理しておく。

## 現状

`.github/workflows/npm-publish.yml` の `npm-publish-canary` (`:74-77`) と `npm-publish` (`:100-103`) の両ジョブに、同一のコメント・ステップ構成が並んでいる。

```yaml
# pnpm publish は CI では正常に動作しない
# https://github.com/pnpm/pnpm/issues/4937
- run: npm install -g npm@latest
- run: npm publish --no-git-checks --tag canary --provenance
```

- コメントは 76 行目 (`npm install -g npm@latest`) を実行する理由を述べているが、視覚的にはその直下 77 行目 (`npm publish ...`) も含めたブロックコメントに見える
- 0033 で 77 行目末尾に `--provenance` を追加して行が長くなった結果、77 行目に対するコメントとして読まれる誤読リスクが増した
- 参照先 `https://github.com/pnpm/pnpm/issues/4937` は 2022 年起票で 3 年以上経過しており、pnpm 9 / 10 / 11 系で挙動が変わっている可能性がある。鮮度確認なしに残すのは「コードを読めば分かる」自明説明と紙一重

## 設計方針

以下のいずれかで対応する。実装時にどちらにするか決定する。

### 案 A: コメント位置を 76 行目の直前に限定

- 76 行目と 77 行目の間に空行を 1 行入れて視覚的にステップ境界を明確化する
- コメント本文はそのまま、または「# npm CLI を再インストールする理由:」のような主語明確化文面に書き換える
- canary / latest 両経路で同じ整理を行う

### 案 B: コメント本文を「`npm install -g npm@latest` の理由」と明示

- コメント先頭に対象ステップを明示する: `# 直下の npm install -g npm@latest の理由: pnpm publish は CI で正常に動作しない (https://github.com/pnpm/pnpm/issues/4937)`
- 行が伸びるが、対象ステップとの結び付きが文面で明示される

### 鮮度確認

- 参照先 pnpm issue `pnpm/pnpm#4937` の最新状態を確認する
- まだ open かつ未解決なら現状コメント維持で良い
- 解決済または挙動が変わっている場合は、参照先を更新するか、`pnpm publish` を直接使うように見直す (見直しは別 issue にする)

## 完了条件

- 両 publish ジョブ (`npm-publish-canary` / `npm-publish`) のコメントが、76 / 102 行目の `npm install -g npm@latest` ステップに限定された配置・文面になっている
- 77 / 103 行目の `npm publish` ステップに係って見える誤読リスクが解消されている
- 参照先 pnpm issue の現状確認結果が PR 本文に明記されている

## スコープ外

- `npm install -g npm@latest` ステップ自体の共通化 (別 issue で扱う)
- canary / latest 2 ジョブ統合 (別 issue で扱う)
- `--no-git-checks` フラグの削除 (別 issue で扱う)

## 関連 issue

- 0033 (closed): `--provenance` 追加。本 issue の動機
- 0056 (open): `npm install -g npm@latest` 重複共通化
- 0057 (open): canary / latest publish ジョブ統合
- 0058 (open): `--no-git-checks` フラグの削除
