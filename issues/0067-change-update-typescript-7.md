# TypeScript 7 に対応する

- Created: 2026-08-10
- Completed: 未対応
- Branch: feature/update-typescript-7
- Polished: 未対応

## 目的

TypeScript 7.0 (Go 実装の Project Corsa / tsgo) は npm の `typescript` パッケージとして 7.0.2 が公開されている。現在は `package.json` の devDependencies で typescript を 6.0.3 に固定しており、7 系に追従できるようにする必要がある。

依存ライブラリ更新時に typescript@7.0.2 へ更新を試みたが、`vp pack` の d.ts 生成が失敗したため 6.0.3 に戻した。本 issue ではその原因を解決して TypeScript 7 に対応する。

## 現状

- `package.json` の devDependencies の typescript は 6.0.3 に固定されている
- typescript@7.0.2 (および CI の `next` が解決する 7.1.0-dev) では `vp pack` が失敗する
  - エラー: `Error: tsgo did not generate dts file for src/sora.ts, please check your tsconfig.`
  - 警告: `TypeScript 7.0 does not yet have a stable API and is experimental. Some options will be unavailable.`
- 原因は vite-plus (内部の rolldown-plugin-dts) の d.ts 生成が TypeScript 7 の tsgo に対応していないこと。vite-plus 側の API はまだ安定していない

  ただし、調査の結果、問題を引き起こしているのは tsconfig の `declarationDir` であることが判明した
  - rolldown-plugin-dts は typescript が 7.0 系の場合、tsgo バイナリを直接起動して一時ディレクトリ (`--outDir <temp>`) に d.ts を生成させる
  - tsgo は CLI の `--outDir` より tsconfig の `declarationDir` を優先する挙動のため、`dist/` に d.ts を出力してしまい、rolldown-plugin-dts が一時ディレクトリから d.ts を拾えずエラーになる
  - `declarationDir` を削除すれば TS 7.0.2 でも `vp pack` が成功することを確認した

- `.github/workflows/ci.yaml` の `ci` ジョブの typescript matrix に `next` / `beta` が含まれており、`next` が 7.1.0-dev に解決されるため `vp run build` が失敗する

## 設計方針

- `tsconfig.json` から `declarationDir` を削除する
  - d.ts の出力先は vite-plus が制御しており、`tsc` で emit するユースケースがないため不要
  - `tests/tsconfig.json` の `declarationDir: null` (継承元の無効化) も削除する
- `package.json` の typescript を 7.0.2 に更新する
- CI の `ci` ジョブの typescript matrix に `7.0` を追加して検証する

## 完了条件

- `package.json` の devDependencies の typescript が 7.0.x に更新されている
- `pnpm build` が成功し、`dist/sora.d.ts` が生成される
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全て成功する
- CI の `ci` ジョブの typescript matrix に `7.0` が含まれ、全組み合わせが pass する
