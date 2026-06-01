# e2e-test の Node バージョンを 25 から 26 (LTS) に切り替える

- Priority: Medium
- Created: 2026-06-01
- Model: Opus 4.8
- Branch: feature/change-e2e-node-26

## 目的

e2e-test ワークフローのテストマトリクスを最新の stable な Node 26 (LTS) に合わせる。Node 25 は奇数リリースでサポート期間が短く、Node 26 LTS がリリースされた現在は 26 でテストすべきである。`.github/workflows/e2e-test.yml` には「Node 26 LTS がリリースされたら 26 に更新する」という TODO コメントが既に存在しており、本対応はその実施にあたる。

## 優先度根拠

Medium とする。

- CI のテスト対象を最新 LTS に追従させる保守作業であり、ユーザー向けの機能やバグには直接影響しない。
- 一方で `ci.yaml` は既に Node 26 / 24 / 22 を対象にしており、e2e-test のみ Node 25 のまま取り残されている。マトリクスの不整合を解消する必要がある。

## 現状

`.github/workflows/e2e-test.yml` のマトリクスは Node 25 / 24 / 22 を対象にしている (`e2e-test.yml:22-28`)。

```yaml
node:
  # Node 26 LTS がリリースされたら 26 に更新する
  - "25"
  # 30 Apr 2028 End of Life
  - "24"
  # 30 Apr 2027 End of Life
  - "22"
```

一方 `ci.yaml` のマトリクスは既に Node 26 / 24 / 22 を対象にしている (`ci.yaml:19-21`)。e2e-test だけが Node 25 のまま残っている。

## 設計方針

`e2e-test.yml` のマトリクスから Node 25 を外し、Node 26 を追加する。あわせて TODO コメントを他の Node バージョンと同じ End of Life コメントに置き換え、形式を揃える。Node 24 / 22 はそのまま残す。

## 完了条件

- `e2e-test.yml` のマトリクスが Node 26 / 24 / 22 になっている。
- TODO コメントが解消され、Node 26 にも End of Life コメントが付いている。
- e2e-test ワークフローが Node 26 を含む全マトリクスで成功する。

## 解決方法

1. `e2e-test.yml` のマトリクスの `- "25"` を `- "26"` に変更し、直上の TODO コメントを End of Life コメントに置き換える。
2. `CHANGES.md` の `## develop` の `### misc` に `[UPDATE]` エントリを追記する (CI のテスト対象の更新であり、ライブラリ利用者の機能には影響しないため misc が妥当)。
