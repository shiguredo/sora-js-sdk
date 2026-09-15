# `vp run doc` を TypeScript 7 で実行可能にする

- Priority: High
- Created: 2026-09-16
- Completed: {YYYY-MM-DD}
- Branch: feature/update-typedoc-typescript7-compat
- Polished: {YYYY-MM-DD}

## 目的

現 develop の依存構成では typedoc 0.28.20 が TypeScript 7.0.2 と非互換で `vp run doc` が起動時にクラッシュし、`apidoc/` を生成できない。これにより次の 2 点が解消できていない状態にある。

- `.github/workflows/deploy-apidoc.yml` は build ジョブで `vp run doc` を実行するため、workflow が master に反映された後の次回発火 (次回リリース時の master マージ / workflow_dispatch) で失敗し、GitHub Pages 配信が更新できなくなる
- 0064 (`TYPEDOC.md` 表紙刷新) / 0066 (`@example` 充実) の完了条件に含まれる「生成物の HTML を目視確認する」検証が実施できない

## 優先度根拠

High。SDK 本体の挙動には影響しないが、(1) GitHub Pages での API ドキュメント配信が次回リリース時から壊れる、(2) open の doc 系 issue 2 件 (0064 / 0066) の完了条件検証を恒久的にブロックする、のどちらも放置すると後続作業が滞留するため。

## 現状

- `package.json` の devDependencies は `typedoc: 0.28.20` + `typescript: 7.0.2` の組み合わせで、`@typescript/typescript6` の併用は無い (pnpm-lock.yaml も同様)
- typedoc 0.28.20 の peerDependencies は `typescript: 5.0.x || 5.1.x || 5.2.x || 5.3.x || 5.4.x || 5.5.x || 5.6.x || 5.7.x || 5.8.x || 5.9.x || 6.0.x` であり、7.0.2 は範囲外
- 0065 (closed、2026-09-16) の実測で、typescript@7.0.2 では typedoc が起動時にクラッシュする (`ts.SyntaxKind` が undefined) ことが確認されており、`vp run doc` は現 develop で実行不能
- shiguredo-typescript スキルには「TypeDoc は TypeScript 7 の API に未対応 (TypeScript 7.0 はプログラマティック API を持たず、API は 7.1 以降で提供予定)。TypeDoc が必要な間は `@typescript/typescript6` を併用し、TypeDoc の TypeScript 7 対応後に一本化する」と定められているが、本リポジトリでは未実施
- 0063 (closed、2026-09-15) の検証記録では `vp run doc` の最終成功は workflow 実行 (2026-06-23、TypeScript 6 系 (typedoc の peer 範囲内) の時代)。`deploy-apidoc.yml` は 2026-09-15 時点で master 未反映
- typedoc の書式 (entry point / excludePrivate 等) 自体には問題は無く、0063 の検証時には正常に生成できている

## 設計方針

- 優先候補: typedoc を TypeScript 7 対応版 (7.1 以降で API 提供予定に合わせて) へ更新する。対応版リリース前であれば `@typescript/typescript6` を追加して typedoc が型情報を解決できる構成に切り替える (shiguredo-typescript スキルの記載どおり)
- どちらの手段でも、`vp install --frozen-lockfile && vp run doc` が終了コード 0 で完走し `apidoc/` が生成されることを確認する
- `typedoc.json` の設定変更は本 issue の目的に必要な範囲のみに留める (`intentionallyNotExported` の整理は 0065 で「@internal では置換不可」と実測された別問題であり、本 issue では扱わない)

## 完了条件

- `vp install --frozen-lockfile && vp run doc` が success で完走し、`apidoc/index.html` が生成される
- `.github/workflows/deploy-apidoc.yml` の build ジョブと同じ条件 (ubuntu-slim / Node.js 22 / `vp install --frozen-lockfile` → `vp run doc`) で完走できる
- `CHANGES.md` の `## develop` セクション `### misc` に `[UPDATE]` として 1 行追加する

## 解決方法

- 実装時に typedoc の TypeScript 7 対応版への更新か、`@typescript/typescript6` の併用のどちらかを確定し、`package.json` / `pnpm-lock.yaml` を更新する
- `vp install --frozen-lockfile` 後に `vp run doc` を実行し、`apidoc/` の生成を確認する
- 完了後は 0064 / 0066 の完了条件にある HTML 目視確認が実施可能になる

## 関連 issue

- **0065 (closed、2026-09-16)**: 本問題を「残る別問題 (スコープ外)」として記載している
- **0064 (open)**: `vp run doc` での生成物確認を完了条件に含む
- **0066 (open)**: 同上 (typedoc の `@example` 充実)
