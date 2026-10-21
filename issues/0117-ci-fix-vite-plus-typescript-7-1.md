# vite-plus を最新化し、TS 7.1 dev の beta ジョブを非ブロッキング化して CI を green に戻す

- Priority: High
- Created: 2026-10-21
- Completed: {YYYY-MM-DD}
- Branch: feature/update-vite-plus-for-typescript-7-1
- Polished: 2026-10-21

## 目的

`ci` の `typescript@beta` ジョブが TypeScript 7.1 dev をインストールするようになり、`vp run build` の dts 生成が失敗して CI が red になっている。vite-plus を最新の 1.3.0 に更新したうえで、TypeScript 7.1 dev に対応する vite-plus が存在しないことを確認し、`beta` を blocking な `ci` matrix から外して非ブロッキング検証に移す。CI を green に戻し、0070 で matrix から外した `typescript@next` も引き続き外したままにする判断を明記する。

## 現状

### 失敗しているジョブ

2026-10-21 の `ci` workflow (run 39592001554) では、`ci (22, beta)` / `ci (24, beta)` / `ci (26, beta)` の 3 ジョブだけが失敗し、他の 36 ジョブは成功している（workflow 全体 39 ジョブ中 3 失敗・36 成功。`ci` matrix は 36 ジョブ中 3 失敗・33 成功）。失敗箇所は `vp run build` (`vp pack`) の `rolldown-plugin-dts:generate` で、次のエラーになる。

```text
TypeError: Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')
  at @voidzero-dev/vite-plus-core/dist/tsdown/tsc-*.js
```

### 原因

- `.github/workflows/ci.yaml` の `ci` matrix は `beta` で `vp add -E -D typescript@beta -w` を実行している
- `typescript@beta` の dist-tag は 2026-10-21 時点で `7.1.0-beta` (2026-10-20T16:45Z、2026-10-21 01:45 JST 公開)
- `pnpm-workspace.yaml` の `minimumReleaseAge: 10080` (7 日) により、7 日を経過していない TypeScript はインストールされず、7 日以上経過した古いバージョンに解決される
- 2026-10-20 の `ci` workflow (run 39355360483) では、`7.1.0-dev.20261014.1` がまだ 7 日を経過していなかったため、beta ジョブは 7 日を経過した古いバージョンにフォールバックし、build に成功していた（`vp install` のログでは `typescript 7.0.2`）
- 2026-10-21 の CI では `7.1.0-dev.20261014.1` が 7 日を超えたため、beta ジョブはこの TS 7.1 dev をインストールし、vite-plus 1.0.0-rc.0 の dts 生成が `typescript.sys` の undefined 参照で失敗した
- 0070 で `typescript@next` を matrix から外した際の「先行版の検証は beta がカバーする」という前提が、beta 自体の TS 7.1 dev 移行で崩れている。`.github/workflows/ci.yaml` のコメントにも「先行版は beta でカバーできるため」とあるが、beta も同じエラーで失敗する

### vite-plus の状況

- 現在の `package.json` は `vite-plus: 1.0.0-rc.0`
- `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` に `vite-plus` が含まれているため、公開直後でも更新できる
- 最新リリースは 1.3.0 (2026-10-16)。1.3.0 より新しいリリースは 2026-10-21 時点で存在しない
- dependabot の vite-plus 更新 PR #798 は 1.1.0 のままで、1.3.0 への更新は含まれていない

### 1.3.0 の TS 7.1 dev 対応状況 (確認済み)

2026-10-21 に `vite-plus@1.3.0` と `typescript@7.1.0-dev.20261014.1` を一時プロジェクトにインストールし、`vp pack` を実行した。結果は次のとおりで、CI と同じエラーで失敗した。

- `@voidzero-dev/vite-plus-core@1.3.0` の `dist/tsdown/tsc-*.js` は `ts$2.sys.useCaseSensitiveFileNames` を参照している

  ```text
  getCanonicalFileName: ts$2.sys.useCaseSensitiveFileNames ? (f) => f : (f) => f.toLowerCase()
  ```

- `typescript@7.1.0-dev.20261014.1` の `lib/version.cjs` は `version` と `versionMajorMinor` のみを export し、`sys` を持たない
- `typescript@7.1.0-beta` も同様に `sys` を持たない
- `vite-plus@1.3.0` と `typescript@7.0.2` の組み合わせでは `vp pack` が成功する

したがって、1.3.0 は TypeScript 7.1 dev 対応版ではない。2026-10-21 時点で TS 7.1 dev に対応する vite-plus のリリースは存在しない。

## 設計方針

- `vite-plus` を 1.3.0 に更新する (`package.json` / `pnpm-lock.yaml`)。dependabot PR #798 は 1.3.0 に更新するか、本 issue の更新で置き換えて close する
- 1.3.0 は TS 7.1 dev に未対応であるため、`ci` matrix から `beta` を外す。`7.0` / `6.0` / `5.x` は残す
- `beta` の検証は `ci.yaml` の独立した `typescript-beta` job に移す。`continue-on-error: true` を設定し、失敗しても `ci` の required check を落とさないことを確認する。matrix の要素として `continue-on-error` を使う方式は、0070 で required check を pass にできなかったため採用しない
- `typescript@next` は matrix に戻さない。vite-plus が TS 7.1 dev に対応するまで戻さない判断を `ci.yaml` のコメントに明記する
- `beta` は moving tag であり、`minimumReleaseAge` により 7 日を経過した古いバージョンに解決されること、`next` と `beta` の両方が TS 7.1 dev で `vp run build` に失敗することを `ci.yaml` のコメントに明記する。vite-plus の対応状況を確認したらコメントを更新する
- `CHANGES.md` の `## develop` の `### misc` に、`vite-plus` を 1.3.0 に更新する `[UPDATE]` エントリと、CI の TypeScript beta ジョブを非ブロッキング化する `[UPDATE]` エントリを追記する。担当者行 (`- @ユーザー名`) を付ける

## 完了条件

- `vite-plus` を 1.3.0 に更新している (`package.json` / `pnpm-lock.yaml`)
- `ci` matrix から `beta` を外し、`beta` の検証を独立した非ブロッキング job に移している。`beta` の失敗が `ci` の required check を落とさないことを確認している
- `typescript@next` は matrix に戻さず、その理由を `ci.yaml` のコメントに明記している
- `typescript` 7.0 / 6.0 / 5.x のジョブと `typescript-native-preview` が退行なく pass する
- ローカルで `vp run build` / `vp check` / `vp test run` が pass する
- `ci` workflow が pass する（`beta` の非ブロッキング job は既知のエラーで失敗してよい）
- `.github/workflows/ci.yaml` の `beta` / `next` に関するコメントを現状に合わせて更新する。`minimumReleaseAge` により beta が 7 日以上経過した古いバージョンに解決されることを明記する
- `CHANGES.md` の `## develop` の `### misc` に `vite-plus` 1.3.0 更新の `[UPDATE]` エントリと CI の beta ジョブ非ブロッキング化の `[UPDATE]` エントリを追記する
- dependabot PR #798 を 1.3.0 に更新するか、本 issue の更新で置き換えて close している

## 関連 issue

- `issues/closed/0070-ci-fix-typescript-next-build-failure.md`: `typescript@next` が vite-plus の dts 生成と非互換になった問題。同じエラーの先行事例で、当時は `next` を matrix から外して `beta` に任せる判断をした
- `issues/closed/0067-change-update-typescript-7.md`: TypeScript 7 への更新。vite-plus と TypeScript 7 の組み合わせを扱った
- `issues/closed/0038-ci-add-typescript-native-preview-verification.md`: `@typescript/native-preview` による型検証ジョブの追加
