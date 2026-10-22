# TypeScript 7.1 系の先行版を CI matrix から一時的に外す

- Priority: High
- Created: 2026-10-21
- Completed: 2026-10-22
- Branch: N/A (CI 設定のみの変更)
- Polished: {YYYY-MM-DD}

## 目的

`ci` が TypeScript 7.1 系の先行版 (`typescript@beta` / `typescript@next`) を検証して常時失敗し、Slack の failure 通知が鳴り続ける状態を止める。TypeScript 7.1 対応は vite-plus 側 (rolldown-plugin-dts) の上流修正を待ち、対応が入ったら先行版の検証を matrix に戻す。

## 優先度根拠

High。`ci` が常時赤になると、SDK の変更に起因する失敗と上流の pre-release 非互換による失敗が区別しづらくなり、通知も鳴り続ける。SDK 側では修正できない依存側の問題なので、いったん検証対象から外して CI を安定させる。

## 現状

### 失敗しているジョブ

2026-10-21 の `ci` で `ci (22, beta)` / `ci (24, beta)` / `ci (26, beta)` の 3 ジョブだけが失敗し、他の 36 ジョブは成功していた。失敗箇所は `vp run build` (`vp pack`) の `rolldown-plugin-dts:generate` で、次のエラーになる。

```text
TypeError: Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')
  at @voidzero-dev/vite-plus-core/dist/tsdown/tsc-*.js
```

### 原因

- `vite-plus` 1.0.0-rc.0 が同梱する rolldown-plugin-dts 0.28.5 は、インストールされた TypeScript のバージョンが `7.0` で始まる場合だけネイティブ版の tsgo 生成器に切り替え、それ以外は TypeScript の JS API を使う tsc 生成器にフォールバックする
- TypeScript 7.x は JS のコンパイラ API を持たないため、7.1 系では `typescript.sys` が `undefined` になり、tsc 生成器が上記の例外で落ちる
- 上流の rolldown-plugin-dts は peerDependencies で `typescript` を `~7.0.0` までしかサポートしていない

`vite-plus` 1.3.0 へ更新しても同梱は rolldown-plugin-dts 0.28.8 で判定は同じままなので、`typescript@7.1.0-beta` で同じエラーになることを隔離環境で確認している。バージョン更新だけでは解決しない。

### 上流の状況

rolldown-plugin-dts の main ブランチと 0.29.0-beta.2 では peerDependencies に `~7.1.0-0` が追加され、バージョン判定も `isNativeTypeScriptVersion` (major >= 7) に変わっている。vite-plus が 0.29 系を取り込むまで SDK 側では解決できない。

### pnpm の解決と minimumReleaseAge

`pnpm-workspace.yaml` の `minimumReleaseAge: 10080` (7 日) により、公開直後の TypeScript はインストールされない。CI の pnpm 11.7.0 では `typescript@beta` / `typescript@next` とも `7.1.0-dev.20261014.1` に解決され、これは TS 7.1 系のため同じエラーになる。`typescript@beta` が指す `7.1.0-beta` そのものが検証されていない点にも注意する。

## 対応方針

- `ci` の `matrix.typescript` から `beta` を外し、先行版の検証を一時的に停止する
- 外した理由と戻す条件を `ci.yaml` のコメントに明記する
- 上流対応 (rolldown-plugin-dts 0.29 系を取り込んだ vite-plus) が入ったら、`beta` と `next` を matrix に戻す

## 完了条件

- `ci` の matrix から `typescript@beta` が外れている
- `ci.yaml` のコメントに、外した理由と戻す条件が記載されている
- `ci` が安定版の matrix だけで pass する

## 関連 issue

- 0070 (closed): `typescript@next` を matrix から外した先行事例。「先行版の検証は beta がカバーする」という前提は、beta 自体が TS 7.1 に移行したことで崩れている
- 0067 (closed): TypeScript 7 への更新。vite-plus と TypeScript 7 の組み合わせを扱った
- 0038 (closed): `@typescript/native-preview` による型検証ジョブの追加

## 解決方法

`ci.yaml` の `matrix.typescript` から `beta` をコメントアウトして外した。一時的な除外のため、あとで戻しやすいよう削除せずコメントアウトで残している。あわせて、`next` と `beta` を外している理由 (vite-plus が TypeScript 7.1 のネイティブ版 API に未対応で dts 生成が失敗する) と、戻す条件 (rolldown-plugin-dts 0.29 系を取り込んだ vite-plus に更新できたとき) をコメントに明記した。

`typescript@next` は 0070 で既に外しており、今回 `beta` も外すことで先行版の検証は一時的になくなる。上流対応が入ったら両方を matrix に戻す。

検証: `ci.yaml` の YAML 構文と matrix の内容 (node 3 種 × TypeScript 11 種 = 33 ジョブ) を確認した。
