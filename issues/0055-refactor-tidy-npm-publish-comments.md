# `.github/workflows/npm-publish.yml` の publish 2 経路に並ぶ運用コメントを整理する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-tidy-npm-publish-comments
- Polished: 2026-09-15

## 目的

`.github/workflows/npm-publish.yml` の `npm install -g npm@latest` ステップに対する運用コメントが、視覚的に直後の `npm publish` ステップにも係って見える状態を整理し、コメントの根拠範囲を明確にする。あわせて参照先 pnpm issue の鮮度を確認し、本 workaround がまだ必要かどうかをコメントの文面に反映する。0033 で `--provenance` が追加され、0058 で `--no-git-checks` が削除されるなど publish 行の変更は続いたが、コメントが 2 ステップ全体に係って見える構造は変わっておらず、誤読リスクの負債が残っている。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。可読性・保守性の改善であり、緊急性は無いが、0033 でフラグ追加によりコメント位置の問題が顕在化したため、関連変更が記憶に新しいうちに整理しておく。

## 現状

`.github/workflows/npm-publish.yml` の `npm-publish-canary` ジョブと `npm-publish` ジョブに、同一のコメント・ステップ構成が並んでいる (`npm-publish-canary` 側):

```yaml
# pnpm publish は CI では正常に動作しない
# https://github.com/pnpm/pnpm/issues/4937
- run: npm install -g npm@latest
- run: npm publish --tag canary --provenance
```

(`npm-publish` 側は publish 行が `npm publish --provenance`)

- コメントは直上の `npm install -g npm@latest` ステップを実行する理由を述べているが、視覚的にはその直下の `npm publish` ステップも含めたブロックコメントに見える
- 0033 で publish 行末尾に `--provenance` が追加され (`npm publish --no-git-checks --tag canary --provenance`)、0058 で `--no-git-checks` が削除された現在の publish 行は `npm publish --tag canary --provenance` となっている。行の見た目が変わっても、コメントが 2 ステップ分に係って見える構造自体は残ったまま
- 参照先 `https://github.com/pnpm/pnpm/issues/4937` は 2022-06-26 起票で、2026-09-15 時点でも open のまま未解決 (コメント・リンク PR とも無し) だった。3 年以上経過しており、pnpm 9 / 10 / 11 系で挙動が変わっている可能性がある。鮮度確認なしに残すのは「コードを読めば分かる」自明説明と紙一重

## 設計方針

以下のいずれかで対応する。実装時にどちらにするか決定する。

### 案 A: コメント位置を `npm install -g npm@latest` ステップの直前に限定

- `npm install -g npm@latest` ステップと `npm publish` ステップの間に空行を 1 行入れて視覚的にステップ境界を明確化する
- コメント本文はそのまま、または「# npm CLI を再インストールする理由:」のような主語明確化文面に書き換える
- canary / latest 両経路で同じ整理を行う

### 案 B: コメント本文を「`npm install -g npm@latest` の理由」と明示

- コメント先頭に対象ステップを明示する: `# 直下の npm install -g npm@latest の理由: pnpm publish は CI で正常に動作しない (https://github.com/pnpm/pnpm/issues/4937)`
- 行が伸びるが、対象ステップとの結び付きが文面で明示される

### 鮮度確認

- 参照先 pnpm issue `pnpm/pnpm#4937` の最新状態を確認する (2026-09-15 時点で open かつ未解決を確認済み。実装時にも再確認する)
- まだ open かつ未解決なら現状コメント維持で良い
- 解決済または挙動が変わっている場合は、参照先を更新するか、`pnpm publish` を直接使うように見直す (見直しは別 issue にする)

## 完了条件

- 両 publish ジョブ (`npm-publish-canary` / `npm-publish`) のコメントが、`npm install -g npm@latest` ステップに限定された配置・文面になっている (0057 統合後は 1 ジョブで同様)
- `npm publish` ステップに係って見える誤読リスクが解消されている
- 参照先 pnpm issue の現状確認結果が PR 本文に明記されている

## スコープ外

- `npm install -g npm@latest` ステップ自体の共通化 (0056 で扱う)
- canary / latest 2 ジョブ統合 (0057 で扱う)
- `--no-git-checks` フラグの削除 (0058 closed で扱い済み)

## 関連 issue

- 0033 (closed): `--provenance` 追加。本 issue の動機
- 0056 (open): `npm install -g npm@latest` 重複共通化。案 C が成立した場合は対象ステップ自体が削除されるため、本 issue とのマージ順に注意
- 0057 (open): canary / latest publish ジョブ統合。統合後はコメント整理対象が 1 箇所になる
- 0058 (closed): `--no-git-checks` フラグの削除。現行の publish 行からは削除済み
