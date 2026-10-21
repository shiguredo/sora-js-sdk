# vite-plus を更新して TypeScript 7.1 dev の dts 生成に対応する

- Priority: High
- Created: 2026-10-21
- Completed: {YYYY-MM-DD}
- Branch: feature/update-vite-plus-for-typescript-7-1
- Polished: {YYYY-MM-DD}

## 目的

`ci` の `typescript@beta` ジョブが TypeScript 7.1 dev をインストールするようになり、`vp run build` の dts 生成が失敗して CI が red になっている。vite-plus を TypeScript 7.1 dev に対応したバージョンへ更新し、CI を green に戻す。あわせて、0070 で matrix から外した `typescript@next` を戻せるか判断する。

## 現状

### 失敗しているジョブ

2026-10-21 の `ci` で `ci (22, beta)` / `ci (24, beta)` / `ci (26, beta)` の 3 ジョブだけが失敗し、他の 36 ジョブは成功している。失敗箇所は `vp run build` (`vp pack`) の `rolldown-plugin-dts:generate` で、次のエラーになる。

```text
TypeError: Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')
  at @voidzero-dev/vite-plus-core/dist/tsdown/tsc-*.js
```

### 原因

- `.github/workflows/ci.yaml` の `ci` matrix は `beta` で `vp add -E -D typescript@beta -w` を実行している
- `typescript@beta` の dist-tag は `7.1.0-beta` (2026-10-20 公開) で、その前は `7.1.0-dev.20261014.1` (2026-10-14 公開) だった
- `pnpm-workspace.yaml` の `minimumReleaseAge: 10080` (7 日) により、公開直後の TypeScript はインストールされない
- 2026-10-20 の CI では `7.1.0-dev.20261014.1` がまだ 7 日経っておらず、`typescript 7.0.2` にフォールバックして成功していた
- 2026-10-21 の CI では `7.1.0-dev.20261014.1` が 7 日を超えたため beta ジョブが TS 7.1 dev をインストールし、vite-plus 1.0.0-rc.0 の dts 生成が `typescript.sys` の undefined 参照で失敗した
- 0070 で `typescript@next` を matrix から外した際の「先行版の検証は beta がカバーする」という前提が、beta 自体の TS 7.1 dev 移行で崩れている

### vite-plus の状況

- 現在の `package.json` は `vite-plus: 1.0.0-rc.0`
- `pnpm-workspace.yaml` の `minimumReleaseAgeExclude` に `vite-plus` が含まれているため、公開直後でも更新できる
- 最新リリースは 1.3.0 (2026-10-16)。dependabot の vite-plus 更新 PR は 1.1.0 のままで古い
- 1.3.0 以降が TS 7.1 dev の dts 生成に対応しているかは未確認

## 設計方針

- vite-plus を最新バージョン (1.3.0 以降) に更新する
- `typescript@beta` (TS 7.1 dev) をインストールした状態で `vp run build` の dts 生成が成功することを確認する
- 成功したら `ci (*, beta)` が pass することを確認する。あわせて、0070 で外した `typescript@next` を matrix に戻せるか検証する
- 最新の vite-plus でも TS 7.1 dev で失敗する場合は、`beta` を blocking な `ci` matrix から外し、別の非ブロッキング検証に移す。いずれにせよ CI を green に戻すことを優先する
- `beta` が moving tag であり、`minimumReleaseAge` により 7 日遅れて新しい TypeScript が入ることを `ci.yaml` のコメントに明記し、再発時に原因を追いやすくする

## 完了条件

- `vite-plus` を TypeScript 7.1 dev 対応版に更新している
- `typescript@beta` で `vp run build` の dts 生成が成功し、`ci (*, beta)` が pass する
- `typescript@next` を matrix に戻すかどうかを判断し、戻す場合は pass する
- `typescript` 7.0 / 6.0 / 5.x のジョブと `typescript-native-preview` が退行なく pass する
- ローカルで `vp run build` / `vp check` / `vp test run` が pass する
- CI 全体が pass する
- `.github/workflows/ci.yaml` の `beta` / `next` に関するコメントを現状に合わせて更新する
- `CHANGES.md` の `## develop` の `### misc` に vite-plus 更新の `[UPDATE]` エントリを追記する

## 関連 issue

- 0070 (closed): `typescript@next` が vite-plus の dts 生成と非互換になった問題。同じエラーの先行事例で、当時は `next` を matrix から外して `beta` に任せる判断をした
- 0067 (closed): TypeScript 7 への更新。vite-plus と TypeScript 7 の組み合わせを扱った
- 0038 (closed): `@typescript/native-preview` による型検証ジョブの追加
