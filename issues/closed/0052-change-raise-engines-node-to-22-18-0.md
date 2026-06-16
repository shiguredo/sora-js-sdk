# Node.js エンジン要件を 22.18.0 以上に引き上げる

- Priority: Medium
- Created: 2026-06-14
- Completed: 2026-06-16
- Model: Opus 4.7
- Branch: feature/change-raise-engines-node-to-22-18-0
- Polished: 2026-06-16

## 目的

`package.json` の `engines.node` を `">=22"` から `">=22.18.0"` に引き上げ、利用者契約として Node.js 22.18.0 以上を要求する。`vp pack` (issue 0051) が依存する `tsdown` 0.22 系の `engines.node` 要件 (`^22.18.0 || >=24.0.0`) に SDK の利用者契約を揃える。

本 issue は `engines.node` の利用者契約変更のみを扱い、`.github/workflows/*` の `node-version` 設定は変更しない (理由は「スコープ外」セクション参照)。

## 優先度根拠

Medium。後方互換のない利用者契約変更 (`[CHANGE]`)。

- 本 issue は 0051 (`vp pack` 移行、Low) の先行ブロッカー。0051 が遅延しても本 issue 単独で 2026.1.0 の利用者契約を確定できる
- Node.js v22.18.0 は 2025-07-15 リリース (<https://github.com/nodejs/node/releases/tag/v22.18.0>)。sora-js-sdk 2026.1.0 リリース時点で約 1 年経過しており、22.18+ への移行は十分浸透している。利用者影響は限定的

## 利用者影響

`engines.node` の引き上げは後方互換のない変更。各パッケージマネージャの既定挙動:

- npm: `engines` 違反は warning。利用者が `npm install --engine-strict` を付けると install fail
- pnpm: 既定では warning。`.npmrc` または `package.json` で `engine-strict=true` を設定している環境では install fail
- yarn 1 系: warning のみ (yarn berry の engines 検査挙動は本 issue では実機検証していない)

Node 22.0 - 22.17 を使い続ける利用者は、本リリース以降 `engines` 違反警告が出るか、`engine-strict` 環境では install できなくなる。

## 現状

`package.json:51-54`:

```json
"engines": {
  "node": ">=22",
  "pnpm": ">=11"
}
```

`vite-plus` 0.1.24 (`@voidzero-dev/vite-plus-core@0.1.24`) は `tsdown` を内部ビルドツールとして利用する。`tsdown` の npm latest (0.22 系) の `engines.node` は `^22.18.0 || >=24.0.0` (`npm view tsdown engines` で確認、典拠: <https://www.npmjs.com/package/tsdown>)。SDK 利用者契約 `">=22"` のままだと、Node 22.0 - 22.17 環境で `pnpm install` 時に tsdown 側の engines 警告が発生し、`engine-strict` 環境では install fail する。

`.github/workflows/*` の `node-version` は `setup-node` action 経由で指定されており、`matrix.node: ["26", "24", "22"]` の `"22"` は内部的に Node 22.x の最新パッチ (現時点で 22.18+) を取得する。`npm-publish.yml` の `node-version: 22` 直書き 4 箇所 (`:22, :42, :65, :91`) も同様。したがって CI 環境は既に 22.18+ で動作しており、本 issue で matrix を `"22.18.0"` 等に固定する必然性はない。

## 設計方針

本 issue では以下のみを変更する:

- `package.json` の `engines.node` 値を `">=22"` から `">=22.18.0"` に変更する (1 行)
- `CHANGES.md` の `## develop` 配下に `[CHANGE]` エントリを 1 件追記する

`engines.pnpm` は本 issue では触らない (`>=11` のまま維持)。

`engines.node` の表記は `tsdown` の `^22.18.0 || >=24.0.0` と完全一致させず、単純 `>=22.18.0` を採用する。理由: Node.js 奇数版 (23.x、25.x など) は LTS 対象外で短命だが、`>=22.18.0` で許容する。SDK 利用者契約は tsdown より緩く保ち、利用者の Node バージョン選択を阻害しない方針を取る。既存の `">=22"` も単純 `>=` 表記であり、表現の継続性も保たれる。

## スコープ外

- `.github/workflows/*.yml` の `node-version` 設定変更 — `setup-node` の `node-version: "22"` は内部的に 22.x の最新パッチを取得するため、CI 環境では既に 22.18+ で動作している。matrix を `"22.18.0"` に固定するとパッチ更新を取り逃がす。本 issue の主目的は「利用者契約 (engines.node)」の引き上げであり、CI 環境の動作とは別の責務
- `npm-publish.yml` の `node-version: 22` 直書き 4 箇所の matrix 化・env 化リファクタ — 別 issue (集約系リファクタの責務)
- `dependency-review.yml` は `actions/setup-node` を使用しないため、もともと対象外
- `engines.pnpm` の見直し — 本 issue は `engines.node` のみ変更する
- `tsdown` バージョンの直接指定 (`vite-plus` 経由の間接依存のため、本 SDK では tsdown の直接依存は持たない)

## 変更対象ファイル

| ファイル       | 内容                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| `package.json` | `engines.node` を `">=22"` から `">=22.18.0"` に変更                                |
| `CHANGES.md`   | `## develop` の `[CHANGE]` 群末尾に 1 エントリ追記 (挿入位置の詳細は完了条件を参照) |

## 完了条件

- `package.json` の `engines.node` が `">=22.18.0"` になっている
- `package.json` の `engines.pnpm` は本 issue で変更されていない (`">=11"` のまま)
- `package.json` 以外のファイル (workflows / docs 等) に差分が無いこと (CHANGES.md は除く)
- ローカルで `pnpm install --frozen-lockfile` が成功する (engines 違反警告も含めて確認)
- `CHANGES.md` `## develop` 配下、`[CHANGE]` 群末尾 (`:21` の `- @voluntas` の直後、`:22` の `[UPDATE] pnpm 11 系に上げる` の直前) に次を追記する:

  ```
  - [CHANGE] Node.js の最低要件を 22.18.0 以上に引き上げる
    - `vp pack` (issue 0051) が利用する `tsdown` 0.22 系が Node.js `^22.18.0 || >=24.0.0` を要求するため
    - <https://www.npmjs.com/package/tsdown>
    - @voluntas
  ```

- `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass する
- `pnpm fmt` を実行した時にフォーマッタ起因の追加差分が出ないこと (CHANGES.md / package.json の意図した変更は除く)

## マージ順

- 上流依存: なし
- 下流: 0051 (`vp pack` 移行) — 本 issue を先にマージすると、0051 で `vp pack` を導入した時に利用者環境での engines 警告経路が整理済みになる
- 2026.1.0 リリース (issue 0059) の Medium ブロッカー候補

## 関連

- issues/0051-refactor-use-vp-pack-for-library-build.md (本 issue が先行ブロッカー)
- issues/0039-refactor-replace-setup-node-with-setup-vp-in-workflows.md (workflow 側の node-version は 0039 が扱う)
- issues/0059-release-2026-1-0.md (本 issue は 2026.1.0 Medium ブロッカー候補)

## 解決方法

- `package.json` の `engines.node` を `">=22"` から `">=22.18.0"` に変更した。`engines.pnpm` は `">=11"` のまま据え置き。
- `CHANGES.md` の `## develop` 配下、`[CHANGE]` 群末尾 (`abendPeerConnectionState` エントリの直後、`[UPDATE] pnpm 11 系に上げる` の直前) に `[CHANGE]` エントリ 1 件を追加した。
- 完了条件テンプレ (`:84`) に元々書かれていた `(issue 0051)` という issue 番号への参照は `shiguredo-issues` 規約 (`CHANGES.md` に issue 番号への参照を書いてはいけない) に違反するため、実装時に「後続のビルドツール移行で導入される `tsdown` 0.22 系が要求するため」のように issue 番号を含まない理由表現に書き換えた。
- ローカルで `pnpm install --frozen-lockfile` / `pnpm typecheck` / `pnpm lint` / `pnpm test` (108 件 pass) / `pnpm fmt` を順序通り通過させ、fmt 後の追加差分が無いことを確認した。
