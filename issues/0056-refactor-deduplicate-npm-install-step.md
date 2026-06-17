# `.github/workflows/npm-publish.yml` の `npm install -g npm@latest` 重複ステップを共通化する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-deduplicate-npm-install-step
- Polished: {YYYY-MM-DD}

## 目的

`.github/workflows/npm-publish.yml` の `npm-publish-canary` ジョブ (`:76`) と `npm-publish` ジョブ (`:102`) に存在する同一の `npm install -g npm@latest` ステップ重複を解消し、npm CLI のバージョン要件 (Trusted Publishing のための npm 11.5.1+) を 1 箇所で管理できるようにする。0033 でスコープ外と明示した内容を本 issue で扱う。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。DRY 違反の整理であり、保守性向上目的。0033 で `--provenance` を 2 箇所に追加したことで「同じ変更を 2 箇所に書く」運用負荷が再確認されたため、関連整理として起票する。

## 現状

両 publish ジョブで以下の同一ステップが重複している。

`.github/workflows/npm-publish.yml`:

- `:74-76` (`npm-publish-canary`):

  ```yaml
  # pnpm publish は CI では正常に動作しない
  # https://github.com/pnpm/pnpm/issues/4937
  - run: npm install -g npm@latest
  ```

- `:100-102` (`npm-publish`): 同一内容

このステップは publish ジョブ独自の事情 (Trusted Publishing 要件の npm 11.5.1+ を満たすため、`setup-node@v6.4.0` 同梱の npm をグローバル更新する) で必要だが、2 箇所に同じものが書かれている。

## 設計方針

以下のいずれかを検討する。実装時に検証して決定する。

### 案 A: 2 ジョブを 1 ジョブに統合

- 0057 (canary / latest publish ジョブ統合) と合わせて実施すると、`npm install -g npm@latest` が自然に 1 箇所になる
- 0057 と本 issue は強い相互依存があるため、どちらか先に実装する側で他方も解消できる可能性が高い

### 案 B: composite action 化

- `shiguredo/github-actions` リポジトリに `npm-install-latest` のような composite action を追加し、両ジョブからそれを呼び出す
- リポジトリ間依存が増える代わりに、他リポジトリ (`sora-devtools` 等) でも再利用できる
- composite action 内に `npm install -g npm@latest` を含めるか、対象 npm バージョンを引数で受け取るかは設計時に決める

### 案 C: `setup-node` で代替できるか検証

- `actions/setup-node@v6.4.0` には npm バージョンを直接指定する仕様は無いが、`node-version` で Node のバージョンを上げることで同梱 npm のバージョンが上がる可能性がある
- Trusted Publishing 要件の npm 11.5.1+ を満たす Node の version 範囲を調査する
- 満たせるなら `npm install -g npm@latest` を完全削除できる
- 満たせないなら案 A / B に戻る

## 完了条件

- `npm install -g npm@latest` の重複が解消されている (1 箇所のみ、または完全削除)
- canary と latest の publish 経路が同じ npm CLI バージョンで動くことが保証されている (動作確認は次回 canary tag push 時に行う)
- Trusted Publishing 要件 (npm 11.5.1+) が引き続き満たされている

## スコープ外

- canary / latest publish ジョブ自体の構造統合 (0057 で扱う)
- `--no-git-checks` フラグの削除 (0058 で扱う)
- workflow コメント整理 (0055 で扱う)

## 関連 issue

- 0033 (closed): `--provenance` 追加時に「スコープ外」と明示した内容を本 issue で扱う
- 0055 (open): workflow コメント整理
- 0057 (open): canary / latest publish ジョブ統合 (案 A と相互依存)
- 0058 (open): `--no-git-checks` フラグの削除
