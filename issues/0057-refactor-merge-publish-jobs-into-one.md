# `.github/workflows/npm-publish.yml` の canary / latest publish ジョブを 1 ジョブに統合する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-merge-publish-jobs-into-one
- Polished: {YYYY-MM-DD}

## 目的

`.github/workflows/npm-publish.yml` の `npm-publish-canary` (`:53-77`) と `npm-publish` (`:79-103`) の 2 つの publish ジョブを 1 つに統合し、構造重複を解消する。今後の publish 経路変更 (フラグ追加・削除、setup-node 置換、composite action 化等) を 1 箇所で完結できるようにする。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。構造重複の解消による保守性向上目的。0033 で `--provenance` を 2 箇所に追加した際、また将来 `--no-git-checks` を 2 箇所から削除する際 (0058) のように、同じ変更を 2 箇所に書く運用が続くため、関連整理として起票する。

## 現状

`.github/workflows/npm-publish.yml` の publish 2 ジョブは steps の中身がほぼ同一で、以下の差分のみがある。

| 項目                 | `npm-publish-canary` (`:53-77`)             | `npm-publish` (`:79-103`)                |
| -------------------- | ------------------------------------------- | ---------------------------------------- |
| `if` 条件            | `contains(github.ref_name, '-canary.')`     | `!contains(github.ref_name, '-canary.')` |
| `npm publish` フラグ | `--no-git-checks --tag canary --provenance` | `--no-git-checks --provenance`           |

それ以外の構成 (`runs-on`、`needs`、`permissions`、`actions/checkout`、`actions/setup-node`、`actions/download-artifact`、`npm install -g npm@latest` までの全ステップ) は完全に同一。

## 設計方針

1 ジョブにまとめ、tag 名による分岐を `if` レベルではなく実行コマンドのフラグ生成側で行う。

### 構造案

```yaml
npm-publish:
  runs-on: ubuntu-slim
  needs: [build]
  permissions:
    contents: read
    id-token: write
  steps:
    - uses: actions/checkout@...
    - uses: actions/setup-node@...
      with:
        node-version: 22
        registry-url: https://registry.npmjs.org
    - uses: actions/download-artifact@...
      with:
        name: sora-js-sdk-dist
        path: dist/
    - run: npm install -g npm@latest
    - run: npm publish --no-git-checks --provenance ${{ contains(github.ref_name, '-canary.') && '--tag canary' || '' }}
```

ジョブ名は `npm-publish` に統一し、canary / latest 両経路でこれを使う。`slack_notify` ジョブ (`:105`) の `needs: [npm-publish-canary, npm-publish]` は `needs: [npm-publish]` に変更する。

### 検証ポイント

- canary tag (`2026.1.0-canary.X` 等) push 時に `--tag canary` 付きで publish される
- stable tag (`2026.X.0` 等) push 時に `--tag canary` 無しで publish される
- `verify-version` / `build` / `slack_notify` への影響がない
- Trusted Publishing 設定 (npmjs.com 側の Workflow filename `npm-publish.yml`) は変更不要 (filename ベースで matching、ジョブ名は subject claim に含まれない)

### 動作確認

- マージ後 next canary tag push で `--tag canary` 付き publish を確認
- 続く stable tag push で `--tag canary` 無し publish を確認

## 完了条件

- publish ジョブが 1 つになっている (`npm-publish-canary` が削除され、`npm-publish` が両経路をカバー)
- canary tag と stable tag の振り分けが正しく動作する
- `verify-version` / `build` / `slack_notify` への影響がない
- `slack_notify` の `needs:` から `npm-publish-canary` が削除されている

## スコープ外

- workflow コメント整理 (0055 で扱う)
- `npm install -g npm@latest` 重複共通化 (本 issue で同時解消されるが、本 issue が後回しになる場合は 0056 で先行解消)
- `--no-git-checks` フラグの削除 (0058 で扱う)

## 関連 issue

- 0033 (closed): `--provenance` 追加時の構造重複を本 issue で扱う
- 0055 (open): workflow コメント整理
- 0056 (open): `npm install -g npm@latest` 重複共通化 (相互依存)
- 0058 (open): `--no-git-checks` フラグの削除
