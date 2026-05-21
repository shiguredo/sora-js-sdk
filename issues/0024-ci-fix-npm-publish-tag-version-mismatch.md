# `npm-publish.yml` のタグトリガが緩すぎて誤タグで latest publish 事故が起きる

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-npm-publish-tag-validation

## 目的

`npm-publish.yml` の `tags: "*"` は任意タグで publish を発火させる。`package.json:version` とタグ名の整合性検証もない。canary 判定は `contains(github.ref, 'canary')` という緩い文字列マッチで、`v2025.2.1-canary-test` のような任意文字列にもマッチする。誤タグで `package.json:version` のまま latest に再 publish される事故を防ぐ。

## 優先度根拠

High。リリース運用者の誤操作で過去版が latest に再 publish される事故は npm 規約で取り返しがつかない（同名同 version の再 push 不可）。

## 現状

`.github/workflows/npm-publish.yml:3-7`

```yaml
on:
  push:
    tags:
      - "*"
```

`:37`, `:63`:

```yaml
if: ${{ contains(github.ref, 'canary') }}
...
if: ${{ !contains(github.ref, 'canary') }}
```

`package.json:version` との照合は無い。

## 設計方針

1. `tags:` を `["[0-9]+.[0-9]+.[0-9]+", "[0-9]+.[0-9]+.[0-9]+-canary.[0-9]+"]` のような厳格な glob に絞る
2. build ジョブの前に gate ジョブを置き、`jq -r .version package.json` と `github.ref_name` の完全一致を verify する
3. canary 判定を `contains` ではなく endsWith / 正規表現相当（`startsWith` で `-canary.` を含むか判定）に置き換える

## 完了条件

- 任意タグで publish が走らない
- `package.json:version` とタグ名が不一致なら build 前に fail する
- canary 判定が glob と一致する形式のみ canary 扱い

## 解決方法

```yaml
on:
  push:
    tags:
      - "[0-9]+.[0-9]+.[0-9]+"
      - "[0-9]+.[0-9]+.[0-9]+-canary.[0-9]+"

jobs:
  verify-version:
    runs-on: ubuntu-slim
    steps:
      - uses: actions/checkout@<sha>
      - name: Verify tag matches package.json version
        run: |
          PKG=$(jq -r .version package.json)
          TAG=${GITHUB_REF_NAME}
          if [ "$PKG" != "$TAG" ]; then
            echo "Tag ($TAG) does not match package.json version ($PKG)"
            exit 1
          fi

  build:
    needs: [verify-version]
    ...

  npm-publish-canary:
    if: ${{ endsWith(github.ref_name, '-canary.0') || contains(github.ref_name, '-canary.') }}
    ...
  npm-publish:
    if: ${{ !contains(github.ref_name, '-canary.') }}
    ...
```

Provenance (`--provenance --access public`) の付与もあわせて検討する（別 issue として 0030 以降で追跡候補）。
