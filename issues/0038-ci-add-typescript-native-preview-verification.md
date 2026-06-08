# CI に @typescript/native-preview による型検証ジョブを追加する

- Priority: Medium
- Created: 2026-06-08
- Polished: 2026-06-08
- Model: Composer 2.5
- Branch: feature/add-typescript-native-preview-verification

## 目的

TypeScript 7.0 は Go 実装 (Project Corsa) への移行が前提であり、`@typescript/native-preview` が提供する Go 製コンパイラで型検証を行う必要がある。現状の `ci.yaml` は JS 実装の `tsc` のみで、TypeScript 7 (Go) 互換の検証パスがない。

既存の CI はそのまま維持し、**TypeScript 7 互換の Go 実装による型検証ジョブを新規追加する** のが本 issue のスコープである。

## 優先度根拠

Medium。SDK は既に TypeScript 6.0.3 を利用しており (`package.json`)、`ci.yaml` でも TypeScript バージョン matrix で `tsc` による検証を行っている。TypeScript 7 の安定版リリース前に Go 実装での型検証を CI に組み込むことで、移行リスクを早期に検出できる。

## 現状

### ルート `package.json`

```json
"devDependencies": {
  "typescript": "6.0.3"
}
```

### `ci.yaml`

```yaml
strategy:
  matrix:
    node: ["26", "24", "22"]
    typescript:
      ["next", "beta", "6.0", "5.9", "5.8", "5.7", "5.6", "5.5", "5.4", "5.3", "5.2", "5.1"]
steps:
  - run: pnpm add -E -D typescript@${{ matrix.typescript }} -w
  - run: pnpm run typecheck # tsc --noEmit
```

### 未対応の点

- TypeScript 7 (Go 実装) 向けの CI 検証パスが存在しない

参考:

- [Announcing TypeScript Native Previews](https://devblogs.microsoft.com/typescript/announcing-typescript-native-previews/)
- [Announcing TypeScript 7.0 Beta](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/)
- [microsoft/typescript-go](https://github.com/microsoft/typescript-go)

## 事前確認（実装着手前必須）

1. `@typescript/native-preview` が npm レジストリに実在すること
2. npm パッケージの `bin` フィールドに登録されている CLI バイナリ名（現時点では `tsgo` と想定されているが、実際の名前を確認すること）
3. `tsgo` CLI が `tsc` と共通のフラグ（`-p` / `--project`、`--noEmit`、`--emitDeclarationOnly`）をサポートしていること
4. `tsgo` が `tsconfig.json` の JSONC 形式（`//` コメント）を解釈可能であること
5. `tsconfig.json` の全 compilerOptions（`strictNullChecks`、`strictFunctionTypes`、`strictPropertyInitialization`、`stripInternal`、`importHelpers`、`moduleResolution: Bundler`、`declaration` / `declarationDir`）が `tsgo` で完全互換サポートされていること
6. `e2e-tests/tsconfig.json` の `paths` 設定が `baseUrl` なしで `tsgo` により解決可能であること
7. `@typescript/native-preview` が `runs-on: ubuntu-slim` (self-hosted runner) 環境で動作するアーキテクチャのバイナリを提供していること

## 設計方針

### 変更対象

- `.github/workflows/ci.yaml` にジョブを **1 本追加するだけ**

以下は **リポジトリ管理下では変更しない**（CI ジョブ内の `pnpm remove` / `pnpm add` による変更は破棄される）:

- 既存 `ci` ジョブ（TypeScript matrix 含め一切触らない）
- ルート `package.json`
- `e2e-tests/package.json`
- `pnpm-lock.yaml`

### `typescript-native-preview` ジョブの追加

`package.json` に最初から入っている JS 版 `typescript` パッケージは `pnpm remove` で CI 環境から除外し、代わりに `@typescript/native-preview` をインストールする。`@typescript/native-preview` と `typescript` パッケージが名前衝突・バージョン制約で同居できない可能性があるため、事前に排除する設計とした（両立不可の根拠がなければ `pnpm remove` を省略可能）。

```yaml
typescript-native-preview:
  runs-on: ubuntu-slim
  steps:
    - uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
      with:
        node-version: "26"
    - uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093 # v6.0.8
    - run: pnpm install --frozen-lockfile
    - run: pnpm remove -D typescript -w
    - run: pnpm add -E -D @typescript/native-preview -w
    - run: pnpm exec tsgo --emitDeclarationOnly -p tsconfig.json
    - run: pnpm exec tsgo --noEmit -p e2e-tests/tsconfig.json
```

ポイント:

- `pnpm remove -D typescript -w` で JS 版 `typescript` パッケージを CI 環境から除外する
  - `typescript` パッケージを要求する依存（`vite-plugin-dts`、`vite-plus` 等）が peer dependency の解決に失敗しないことを実装前に確認すること
- `@typescript/native-preview` のバージョン指定：preview パッケージのため明示的なバージョン固定は行わず、latest を追う。ただしプレビュー期間中の破壊的変更でジョブが突然失敗する可能性を許容する
- `pnpm exec tsgo` で直接実行する（`package.json` にスクリプトを足さない）
- `pnpm run build` は使わない。`vp build` は `typescript` パッケージに依存するため、`typescript` 排除後は動作しない
- SDK 本体: `pnpm exec tsgo --emitDeclarationOnly -p tsconfig.json` で `dist/sora.d.ts` のみを生成する
  - `--noEmit` ではなく emit する理由: `e2e-tests/tsconfig.json` の `paths` が `../dist/sora.d.ts` を参照しており、宣言ファイルが存在しないと e2e-tests 側の型検証が解決失敗するため
  - `--emitDeclarationOnly` を使う理由: `tsconfig.json` には `outDir` が未設定で、`--noEmit` なしだと `src/` 以下に JS ファイルが副次的に生成され CI 環境を汚染することを避けるため。また `importHelpers: true` だが `tslib` 未インストールのため、JS emit を伴うとモジュール解決エラーが発生する可能性があるため
- `e2e-tests`: `pnpm exec tsgo --noEmit -p e2e-tests/tsconfig.json` で型検証する
- Node は 1 バージョン (26) で十分（型検証は Node バージョンに依存しない）

### `slack_notify` の更新

`needs: [ci]` に `typescript-native-preview` を追加する。

```yaml
needs: [ci, typescript-native-preview]
```

注意: `typescript-native-preview` ジョブが失敗すると `slack_notify` 自体が skip され、既存 `ci` ジョブの結果も通知されなくなる。preview パッケージの不安定性を考慮すると、`typescript-native-preview` ジョブの失敗を許容できる通知設計になっているか確認すること。必要であれば `needs` に追加せず別の通知経路を用意する。

### 非対応のエッジケース（許容する）

- `@typescript/native-preview` が npm レジストリから取得できない → その時点でジョブ失敗（再現性あり）
- `tsgo` がクラッシュ (segfault) する → ジョブ失敗
- `tsgo` と `tsc` が異なるエラーを報告する → その差分は確認用であり、本ジョブではエラー検出として扱う（従来の `tsc` は別 matrix で継続するため）
- `vite-plugin-dts` が生成する宣言ファイルと `tsgo --emitDeclarationOnly` が生成する宣言ファイルの差異 → 本 issue のスコープ外。差異が検出された場合に備考として記録すること

### ローカル再現手順

```bash
pnpm remove -D typescript -w
pnpm add -E -D @typescript/native-preview -w
pnpm exec tsgo --emitDeclarationOnly -p tsconfig.json
pnpm exec tsgo --noEmit -p e2e-tests/tsconfig.json
```

## 完了条件

- `package.json` / `e2e-tests/package.json` / `pnpm-lock.yaml` にリポジトリへコミットされる変更がない（CI ジョブ内での `pnpm remove` / `pnpm add` による変更は許容する）
- 既存 `ci` ジョブ（TypeScript 5.1〜5.9 / 6.0 / beta / next の matrix）は退行なくそのまま動作する
- `typescript-native-preview` ジョブで、現在のソースコードが `tsgo` でエラーゼロで検証完了すること
- `tsgo` 検証失敗時に CI job が fail する

## 変更履歴

着手時に `CHANGES.md` `## develop` の `### misc` に追記する。AGENTS.md の規定に従い種別順（CHANGE → ADD → UPDATE → FIX）を守り、`[ADD]` は既存の `[UPDATE]` エントリより前に挿入すること。

```
- [ADD] CI に @typescript/native-preview による型検証ジョブを追加する
  - @voluntas
```
