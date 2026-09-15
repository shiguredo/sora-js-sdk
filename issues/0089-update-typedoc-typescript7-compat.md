# `vp run doc` を TypeScript 7 で実行可能にする

- Priority: High
- Created: 2026-09-16
- Completed: {YYYY-MM-DD}
- Branch: feature/update-typedoc-typescript7-compat
- Polished: 2026-09-16

## 目的

現 develop の依存構成では typedoc 0.28.20 が TypeScript 7.0.2 と非互換で `vp run doc` が起動時にクラッシュし、`apidoc/` を生成できない。これにより次の 2 点が解消できていない状態にある。

- `.github/workflows/deploy-apidoc.yml` は build ジョブで `vp run doc` を実行するため、workflow が master に反映された後の次回発火 (次回リリース時の master マージ / workflow_dispatch) で失敗し、GitHub Pages 配信が更新できなくなる
- 0064 (`TYPEDOC.md` 表紙刷新) / 0066 (`@example` 充実) / 0075 (`ConnectionBase.pc` の `@example` 追加) の完了条件に含まれる「`vp run doc` 生成物の HTML を目視確認する」検証が実施できない

## 優先度根拠

High。SDK 本体の挙動には影響しないが、(1) GitHub Pages での API ドキュメント配信が次回リリース時から壊れる、(2) open の doc 系 issue 3 件 (0064 / 0066 / 0075) の完了条件検証を恒久的にブロックする、のどちらも放置すると後続作業が滞留するため。

## 現状

- `package.json` の devDependencies は `typedoc: 0.28.20` + `typescript: 7.0.2` の組み合わせで、`@typescript/typescript6` の併用は無い (pnpm-lock.yaml も同様)
- typedoc 0.28.20 の peerDependencies は `typescript: 5.0.x || 5.1.x || 5.2.x || 5.3.x || 5.4.x || 5.5.x || 5.6.x || 5.7.x || 5.8.x || 5.9.x || 6.0.x` であり、7.0.2 は範囲外
- 0065 (closed、2026-09-16) の実測で、typescript@7.0.2 では typedoc が起動時にクラッシュする (`ts.SyntaxKind` が undefined) ことが確認されており、`vp run doc` は現 develop で実行不能
- shiguredo-typescript スキルには「TypeDoc は TypeScript 7 の API に未対応 (TypeScript 7.0 はプログラマティック API を持たず、API は 7.1 以降で提供予定)。TypeDoc が必要な間は `@typescript/typescript6` を併用し、TypeDoc の TypeScript 7 対応後に一本化する」と定められているが、本リポジトリでは未実施
- 0063 (closed、2026-09-15) の検証記録では `vp run doc` の最終成功は workflow 実行 (2026-06-23、TypeScript 6 系 (typedoc の peer 範囲内) の時代)。`deploy-apidoc.yml` は 2026-09-15 時点で master 未反映
- typedoc の書式 (entry point / excludePrivate 等) 自体には問題は無く、0063 の検証時には正常に生成できている
- 2026-09-16 時点で typedoc の stable 最新は 0.28.20 のままであり、TypeScript 7 対応版は未リリース。追跡 issue <https://github.com/TypeStrong/typedoc/issues/3098> の本文には「TypeScript 7.0 リリース後は機能凍結して対応を進める」「完了時期の見通しは立っていない」と記載され、2026-07-30 のメンテナ (Gerrit0) のコメントで TypeScript 7.1 のリリース / RC に合わせて公開したいという希望が、2026-08-04 のコメントでテストの約 70 〜 80 % が通る状態まで対応が進んだことが報告されている (いずれも確定した時期を示すものではない)
- 2026-09-16 の実測: devDependencies へ `@typescript/typescript6` を追加するだけでは typedoc 0.28.20 は依然として `typescript` (7.0.2) を peer 解決し、起動時にクラッシュする (`ts.SyntaxKind` が undefined)。pnpm の `overrides` で typedoc だけの `typescript` を差し替えても解決は変わらない

## 設計方針

- 実装手段は `@typescript/typescript6` の併用構成に確定する。typedoc の TypeScript 7 対応版は 2026-09-16 時点で未リリース (上記 `#3098`、時期未定) のため、「対応版へ更新」は現状実現できず、対応版のリリース後に skill の記載どおり一本化する
- 併用構成の要点 (2026-09-16 に動作を実測済み)
  - ルート (`package.json`) は `typescript: 7.0.2` を維持する (SDK のビルド / typecheck は TypeScript 7 のまま)
  - pnpm workspace のサブパッケージ (例: `docs/`) に `typedoc` と `"typescript": "npm:@typescript/typescript6@6.0.2"` を導入する。`npm:` エイリアスにより `docs` 配下では `typescript` パッケージ名が TypeScript 6 の API を指すため、typedoc 0.28.20 が動作する
  - `@typescript/typescript6` をルートの devDependencies へ単純追加するのは不可 (上記「現状」の実測どおり。typedoc は `typescript` パッケージ名で解決するため)
  - typedoc の実行はルートの `doc` スクリプトから workspace のタスクを呼ぶ形にし、`vp install --frozen-lockfile && vp run doc` がルートで完走する形を維持する (`.github/workflows/deploy-apidoc.yml` の build ジョブを変更不要にするため)。typedoc は `docs/` 側だけに置き、ルートからは削除する (未使用のまま残さない)
- 本構成でも、`vp install --frozen-lockfile && vp run doc` が終了コード 0 で完走し `apidoc/` が生成されることを確認する
- `typedoc.json` の設定変更は本 issue の目的に必要な範囲のみに留める (`intentionallyNotExported` の整理は 0065 で「@internal では置換不可」と実測された別問題であり、本 issue では扱わない)

## 完了条件

- `vp install --frozen-lockfile && vp run doc` が success で完走し、`apidoc/index.html` が生成される
- `.github/workflows/deploy-apidoc.yml` の build ジョブと同じ条件 (ubuntu-slim / Node.js 22 / `vp install --frozen-lockfile` → `vp run doc`) で完走できる (ルートの `doc` スクリプト経由で workspace タスクを呼ぶため、workflow 側のステップ変更は不要)
- `CHANGES.md` の `## develop` セクション `### misc` に `[UPDATE]` として 1 行追加する
- ルート (`package.json`) の `typescript` は 7.0.2 のまま維持され、`vp run build` / `vp run typecheck` が引き続き成功する (SDK 側は TypeScript 7 のままであること)

## 解決方法

- pnpm workspace へ doc ビルド用のサブパッケージを追加する (例: `docs/`。`pnpm-workspace.yaml` の `packages:` に追加し、`docs/package.json` の `name` は `docs` にする。`vp run docs#doc` の `#` はパッケージ名なので揃えること)。`docs/` 側の devDependencies は `typedoc@0.28.20` と `"typescript": "npm:@typescript/typescript6@6.0.2"` (`docs/package.json` の `doc` スクリプトは `typedoc` を呼ぶ)。`typedoc.json` は `docs/` に移し、`entryPoints` / `readme` / `out` は `docs/` からの相対パスで参照する (例: `../src/sora.ts` / `../TYPEDOC.md` / `../apidoc`。`out: ../apidoc` にすればルートの `apidoc/` に出力され、deploy-apidoc.yml の `path: apidoc` も変更不要)。`typedoc.json` の `tsconfig` も `"../tsconfig.json"` に変更する (`./tsconfig.json` のままだと `docs/tsconfig.json` を探して存在せずエラーになる。ルートの tsconfig.json は `include` が `src/**/*.ts` なのでそのまま使える)。`disableSources` / `excludePrivate` / `excludeProtected` / `intentionallyNotExported` 等のその他の書式は現行 `typedoc.json` から引き継ぐ
- ルート (`package.json`) から `typedoc` の devDependency を削除し、`doc` スクリプトを workspace の doc タスクを呼ぶ形に変更する (例: `vp run docs#doc`)。`vp install --frozen-lockfile` 後に `vp run doc` を実行し、`apidoc/` の生成を確認する
- 完了後は 0064 / 0066 / 0075 の完了条件にある HTML 目視確認が実施可能になる

## 関連 issue

- **0065 (closed、2026-09-16)**: 本問題を「残る別問題 (スコープ外)」として記載している
- **0064 (open)**: `vp run doc` での生成物確認を完了条件に含む
- **0066 (open)**: 同上 (typedoc の `@example` 充実)
- **0075 (open)**: 同上 (`ConnectionBase.pc` の `@example` 追加)
