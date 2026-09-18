# `.github/workflows/npm-publish.yml` の canary / latest publish ジョブを 1 ジョブに統合する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-merge-publish-jobs-into-one
- Polished: 2026-09-15

## 目的

`.github/workflows/npm-publish.yml` の `npm-publish-canary` ジョブと `npm-publish` ジョブの 2 つの publish ジョブを 1 つに統合し、構造重複を解消する。今後の publish 経路変更 (フラグ追加・削除、setup ステップの置換、composite action 化等) を 1 箇所で完結できるようにする。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。構造重複の解消による保守性向上目的。0033 (closed) で `--provenance` を 2 箇所に追加した際、0058 (closed) で `--no-git-checks` を 2 箇所から削除した際のように、同じ変更を 2 箇所に書く運用が続いているため、関連整理として起票する。

## 現状

`.github/workflows/npm-publish.yml` の publish 2 ジョブ (`npm-publish-canary` / `npm-publish`) は steps の中身がほぼ同一で、以下の差分のみがある。

| 項目                   | `npm-publish-canary` ジョブ             | `npm-publish` ジョブ                     |
| ---------------------- | --------------------------------------- | ---------------------------------------- |
| `if` 条件              | `contains(github.ref_name, '-canary.')` | `!contains(github.ref_name, '-canary.')` |
| `npm publish` コマンド | `npm publish --tag canary --provenance` | `npm publish --provenance`               |

それ以外の構成 (`runs-on`、`needs`、`permissions`、`actions/checkout`、`voidzero-dev/setup-vp`、`actions/download-artifact`、`npm install -g npm@latest` までの全ステップ) は完全に同一。この現状は 0033 (closed, `--provenance` 追加) / 0058 (closed, `--no-git-checks` 削除) / 0039 (closed, `actions/setup-node` → `voidzero-dev/setup-vp` 置換) マージ後の確定状態。`voidzero-dev/setup-vp` は `node-version: 22` / `registry-url: https://registry.npmjs.org` / `run-install: false` で、`npm install -g npm@latest` の直前には `# pnpm publish は CI では正常に動作しない` の 2 行コメントがある。

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
    - uses: actions/checkout@<SHA> # vX.Y.Z
    - uses: voidzero-dev/setup-vp@<SHA> # vX.Y.Z
      with:
        node-version: 22
        registry-url: https://registry.npmjs.org
        # このジョブは artifact の dist/ をダウンロードして `npm publish` するだけで vp / 依存関係を使わないため自動 install を無効化する
        run-install: false
    - uses: actions/download-artifact@<SHA> # vX.Y.Z
      with:
        name: sora-js-sdk-dist
        path: dist/
    - run: npm install -g npm@latest
    - run: npm publish --provenance ${{ contains(github.ref_name, '-canary.') && '--tag canary' || '' }}
```

ジョブ名は `npm-publish` に統一し、canary / latest 両経路でこれを使う。`slack_notify` ジョブの `needs: [npm-publish-canary, npm-publish]` は `needs: [npm-publish]` に変更する。

補足:

- 各 action の参照先は現行どおりコミット SHA 固定 + `# バージョン` コメント形式 (`uses: actions/checkout@<コミット SHA> # vX.Y.Z`) を維持する。`<SHA>` は実装時に `verify-version` / `build` ジョブで使われている現行値へ置き換える
- `npm install -g npm@latest` 直前のコメント (`# pnpm publish は CI では正常に動作しない` + 参照 URL) は現行どおり 1 箇所へ引き継ぐ (文面・配置の整理は 0055 (open) のスコープ)

### 検証ポイント

- canary tag (`2026.1.0-canary.X` 等) push 時に `--tag canary` 付きで publish される
- stable tag (`2026.X.0` 等) push 時に `--tag canary` 無しで publish される
- `verify-version` / `build` ジョブに変更を加えず、挙動は従来と同一
- `slack_notify` ジョブは `needs:` の記述変更のみで、通知のタイミング・内容は従来と同等
- Trusted Publishing 設定 (npmjs.com 側の Workflow filename `npm-publish.yml`) は変更不要 (npm 側の subject claim は workflow filename ベースで、ジョブ名 (`npm-publish-canary` / `npm-publish`) は含まれない。0033 (closed) で確認済み)

### 動作確認

- マージ後、次回 canary tag push で `--tag canary` 付き publish を確認する
- 続く stable tag push で `--tag canary` 無し publish を確認する

## 完了条件

- publish ジョブが 1 つになっている (`npm-publish-canary` が削除され、`npm-publish` が両経路をカバー)
- canary tag と stable tag の振り分けが正しく動作する
- `verify-version` / `build` ジョブに変更がない
- `slack_notify` の `needs:` から `npm-publish-canary` が削除されている
- Trusted Publishing 設定 (npmjs.com) に変更がない

## スコープ外

- workflow コメント整理 (0055 で扱う。統合後 1 箇所となったコメントの整理も同 issue の対象)
- `npm install -g npm@latest` 重複共通化 (本 issue の統合で同時解消されるが、本 issue が後回しになる場合は 0056 (open) で先行解消。0056 の案 C (node-version 昇格) が成立した場合は `npm install -g npm@latest` 自体が不要となり統合後のジョブにも残さないため、0056 が先にマージされた場合はその結論を確認する)
- `--no-git-checks` フラグの削除 (0058 (closed) で対応済み)

## 関連 issue

- 0033 (closed): `--provenance` を 2 経路に追加した経緯。本 issue で構造重複を解消する
- 0039 (closed): `actions/setup-node` の `voidzero-dev/setup-vp` 置換。本 issue は置換後の状態を前提にする
- 0055 (open): workflow コメント整理 (統合後のコメントの扱い)
- 0056 (open): `npm install -g npm@latest` 重複共通化 (相互依存。0056 の案 C が成立した場合は本 issue の構造案から当ステップを外す)
- 0058 (closed): `--no-git-checks` フラグの削除。対応済みのため本 issue のスコープ外
