# `createSignalingMessage` の `copyOptions` delete ループの 3 配列統合と value-set ガード helper 抽出

- Priority: Low
- Created: 2026-06-12
- Polished: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-create-signaling-message-delete-loop

## 目的

`createSignalingMessage` (`src/utils.ts:230-263`) の `copyOptions` delete ループには、issue 0018 で追加された「`copyOptions[key] !== null && copyOptions[key] !== undefined`」の同一ガードが 3 箇所コピペで反復している。Rule of Three を満たし、helper 関数 (例: `isValueSet`) への抽出が読みやすさと修正漏れ防止 (3 箇所同時に直す必要があった事実そのものが脆さを示す) に有効。

加えて、3 つの判定配列 (`audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys`) の `continue` 分岐は **すべて同じ動作 (continue)** で個別判定する必要がなく、配列を統合した 1 つの判定に圧縮できる。各キーは prefix で相互排他のため統合しても挙動は変わらない。

`/auto-resolve 18,19` の処理中、issue 0018 のレビューで「観点 2 重要 #2」「観点 1 改善 2」「観点 6 #3」として helper 抽出と 3 配列統合が指摘されたが、観点間で意見が割れた (観点 1 と観点 6 は Premature Abstraction として推奨せず) ことから issue 0018 のスコープ外として保留したため、別 issue として起票する。

## 優先度根拠

Low。バグではなくリファクタリングで、利用者影響なし。動的挙動は 1 ビットも変えない。issue 0046 (`"X" in copyOptions` → `typeof` ガード置き換え) と組み合わせることで `createSignalingMessage` 全体のコードクオリティが上がるが、緊急性はない。

## 現状

`src/utils.ts:230-263` (issue 0018 マージ後、commit `232694a4` 時点) の該当箇所:

```ts
const copyOptions = { ...options };
for (const key of Object.keys(copyOptions) as Array<keyof ConnectionOptions>) {
  if (key === "audio" && typeof copyOptions[key] === "boolean") {
    continue;
  }
  if (key === "video" && typeof copyOptions[key] === "boolean") {
    continue;
  }
  // null だけでなく undefined も delete 側に流すために両方を明示的に弾く
  // (`!== null` 単独だと `undefined !== null` が真になり `undefined` キーが残ってしまうため)
  if (
    audioPropertyKeys.includes(key) &&
    copyOptions[key] !== null &&
    copyOptions[key] !== undefined
  ) {
    continue;
  }
  if (
    audioOpusParamsPropertyKeys.includes(key) &&
    copyOptions[key] !== null &&
    copyOptions[key] !== undefined
  ) {
    continue;
  }
  if (
    videoPropertyKeys.includes(key) &&
    copyOptions[key] !== null &&
    copyOptions[key] !== undefined
  ) {
    continue;
  }
  delete copyOptions[key];
}
```

問題点:

1. **同一ガードの 3 重反復**: `copyOptions[key] !== null && copyOptions[key] !== undefined` が 3 箇所コピペ。「値が設定済み」のセマンティクスに名前が付いていない
2. **判定配列 3 つの個別 `continue`**: 3 つの `continue` 分岐は同じ動作。`audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` は prefix で相互排他のため統合可能
3. **コメントが 1 箇所のみ**: 「null だけでなく undefined も delete 側に流すために両方を明示的に弾く」のコメントは最初の 1 箇所にしか付いておらず、2 〜 3 箇所目の同一ガードは別意図と誤読されうる

`audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` は `src/utils.ts:211-229` で定義され、本ループ以降にも `hasAudioProperty` / `hasAudioOpusParamsProperty` / `hasVideoProperty` (`src/utils.ts:267-300`) の判定で個別に再利用されているため、配列自体は残す必要がある。

## 設計方針

### 1. value-set ガード helper の抽出

ループ直前にローカル定数で:

```ts
// copyOptions[key] が「値として設定済み」(null でも undefined でもない) か判定する
// !== null 単独だと undefined !== null が真になり undefined キーが delete されないため、両方を明示的に弾く
const isValueSet = (value: unknown): boolean => value !== null && value !== undefined;
```

ループの 3 つの `continue` 条件を `... && isValueSet(copyOptions[key])` に揃える。

### 2. 3 配列の統合

`audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` を 1 つの判定に圧縮する。配列自体は `hasAudioProperty` 等の判定でも再利用されているため残し、ループ内では統合判定だけ行う:

```ts
const propertyKeys = [...audioPropertyKeys, ...audioOpusParamsPropertyKeys, ...videoPropertyKeys];
```

を `:230` の `copyOptions` 構築前後に追加し、ループ内の 3 つの `continue` を 1 つに統合:

```ts
const copyOptions = { ...options };
const propertyKeys = [...audioPropertyKeys, ...audioOpusParamsPropertyKeys, ...videoPropertyKeys];
const isValueSet = (value: unknown): boolean => value !== null && value !== undefined;
for (const key of Object.keys(copyOptions) as Array<keyof ConnectionOptions>) {
  if (key === "audio" && typeof copyOptions[key] === "boolean") {
    continue;
  }
  if (key === "video" && typeof copyOptions[key] === "boolean") {
    continue;
  }
  if (propertyKeys.includes(key) && isValueSet(copyOptions[key])) {
    continue;
  }
  delete copyOptions[key];
}
```

行数は約 25 行 → 約 13 行に減り、修正漏れリスクも消える。

## 完了条件

- `src/utils.ts:230-263` の `copyOptions` delete ループを「設計方針 1 / 2」のとおりに統合し、helper 関数 / 統合配列で書き直す
- 既存テスト `tests/utils.test.ts` 全件が修正なしで pass する (動的挙動を変えないため、テスト書き換えは不要なはず)
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass し、`pnpm fmt` で差分が出ないこと
- `CHANGES.md` `## develop` の `### misc` に refactor エントリ 1 件を追記する (機能に直接影響しないリファクタリングのため `misc`)

## 前提

- 動的挙動は 1 ビットも変えない (本 issue は構造リファクタのみ)
- issue 0046 マージ後の状態を前提とする (0046 で `"X" in copyOptions` が `typeof` ガードに置き換えられた後の方が、delete ループ周辺のコードが軽くなり統合の意義が明確になる)

## スコープ外

- `"X" in copyOptions` を `typeof` ガードに置き換える型安全化リファクタ (issue 0046)
- `audioPropertyKeys` / `audioOpusParamsPropertyKeys` / `videoPropertyKeys` の配列定義自体の見直し (本 issue は配列の利用方法のみ変更)
- `hasAudioProperty` / `hasAudioOpusParamsProperty` / `hasVideoProperty` の 3 つの判定の統合 (本 issue は delete ループのみに限定。これらは別意味で利用されており、統合すると後続コードの意図が変わる)

## マージ順

issue 0018 (マージ済) → issue 0046 → 本 issue。0046 で `in` 演算子が消えた後の方が、本 refactor で残る delete ループの構造がより読みやすくなる。
