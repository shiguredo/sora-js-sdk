# `.github/workflows/npm-publish.yml` の `npm install -g npm@latest` 重複ステップを共通化する

- Priority: Low
- Created: 2026-06-15
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-deduplicate-npm-install-step
- Polished: 2026-09-15

## 目的

`.github/workflows/npm-publish.yml` の `npm-publish-canary` ジョブと `npm-publish` ジョブに存在する同一の `npm install -g npm@latest` ステップ重複を解消し、npm CLI のバージョン要件 (Trusted Publishing のための npm 11.5.1+) を 1 箇所で管理できるようにする。0033 (closed) でスコープ外と明示した内容を本 issue で扱う。

## 優先度根拠

Low。CI / publish ジョブの動作には影響しない。DRY 違反の整理であり、保守性向上目的。0033 (closed) で `--provenance` を 2 箇所に追加したこと、0058 (closed) で `--no-git-checks` を 2 箇所から削除したことで「同じ変更を 2 箇所に書く」運用負荷が再確認されたため、関連整理として起票する。

## 現状

`npm-publish.yml` の両 publish ジョブ (`npm-publish-canary` / `npm-publish`) に、次のコメント 2 行 + 同一ステップの並びがある (`npm-publish-canary` ジョブ側。`npm-publish` ジョブ側も同一内容。コメント部分の整理は 0055 (open) のスコープ):

```yaml
# pnpm publish は CI では正常に動作しない
# https://github.com/pnpm/pnpm/issues/4937
- run: npm install -g npm@latest
```

このステップは publish ジョブ独自の事情で必要だが、2 箇所に同じものが書かれている。publish ジョブの Node は `voidzero-dev/setup-vp` (0039 closed で `actions/setup-node` から置換済み。2026-09-15 時点は `v1.15.0`) の `node-version: 22` で入る Node 22 系で、同梱 npm は 10.x (最新 22.23.2 は npm 10.9.8) のため Trusted Publishing 要件の npm 11.5.1+ を満たさない。`npm install -g npm@latest` でグローバル更新して要件を満たしている (npm@latest は 2026-09-15 時点で 12.0.2)。なお Trusted Publishing は Node 22.14.0+ も要件だが、`node-version: 22` の解決版 (22.x 最新) はこれを満たす。

## 設計方針

以下のいずれかを検討する。実装時に検証して決定する。

### 案 A: 2 ジョブを 1 ジョブに統合

- 0057 (open, canary / latest publish ジョブ統合) と合わせて実施すると、`npm install -g npm@latest` が自然に 1 箇所になる
- 0057 と本 issue は強い相互依存があるため、どちらか先に実装する側で他方も解消できる可能性が高い
- **0057 が先にマージされた場合**は重複自体が消滅済みのため、案 B / 案 C によるさらなる改善の必要性を再評価し、不要なら本 issue は closed にする

### 案 B: composite action 化

- `shiguredo/github-actions` リポジトリに `npm-install-latest` のような composite action を追加し、両ジョブからそれを呼び出す
- リポジトリ間依存が増える代わりに、他リポジトリ (`sora-devtools` 等) でも再利用できる
- composite action 内に `npm install -g npm@latest` を含めるか、対象 npm バージョンを引数で受け取るかは設計時に決める

### 案 C: `node-version` 昇格で代替できるか検証

- `voidzero-dev/setup-vp` にも npm バージョンを直接指定する入力は無い (action.yml の inputs に npm バージョン指定相当は無い) が、`node-version` で Node のバージョンを上げることで同梱 npm のバージョンを上げられる
- 2026-09-15 時点の照合結果: Node 22 系は npm 10.9.x (11.5.1 未満)、Node 24.5.0+ は npm 11.5.1+ (最新 24.21.0 は npm 11.19.0)、Node 26 系は npm 11.19.x。したがって `node-version: 22` を 24 以上へ上げれば Trusted Publishing 要件の npm 11.5.1+ を満たせる可能性が高い
- 実装時にも Node と同梱 npm の対応を再確認する (対応はリリースのたびに変わるため)
- 満たせるなら案 A / B を検討せず `npm install -g npm@latest` を完全削除できる。ただし npm@latest (12.0.2) と違い、昇格後の同梱 npm 11.x は要件を満たすが npm 12 系の新挙動は取り込まれない点に留意する
- 満たせないなら案 A / B に戻る

## 完了条件

- `npm install -g npm@latest` の重複が解消されている (1 箇所のみ、または完全削除)
- canary と latest の publish 経路が同じ npm CLI バージョンで動くことが保証されている (動作確認は次回 canary tag push 時に行う)
- Trusted Publishing 要件 (npm 11.5.1+) が引き続き満たされている

## スコープ外

- canary / latest publish ジョブ自体の構造統合 (0057 で扱う)
- `--no-git-checks` フラグの削除 (0058 closed で対応済み)
- workflow コメント整理 (0055 で扱う)

## 関連 issue

- 0033 (closed): `--provenance` 追加時に「スコープ外」と明示した内容を本 issue で扱う
- 0039 (closed): `actions/setup-node` の `voidzero-dev/setup-vp` 置換。本 issue は置換後の状態を前提にする
- 0055 (open): workflow コメント整理
- 0057 (open): canary / latest publish ジョブ統合 (案 A と相互依存)
- 0058 (closed): `--no-git-checks` フラグの削除。対応済みのため本 issue の対象外
