# `tests/utils.test.ts` に `videoVP9Params` / `videoH264Params` / `videoH265Params` / `videoAV1Params` の正常系テストを追加する

- Priority: Low
- Created: 2026-06-16
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/add-video-params-tests
- Polished: {YYYY-MM-DD}

## 目的

`createSignalingMessage` (`src/utils.ts:316-334`) の video セクションで JSONType 系プロパティ (`videoVP9Params` / `videoH264Params` / `videoH265Params` / `videoAV1Params`) を `message.video.*_params` に積む経路の回帰テストを `tests/utils.test.ts` に追加する。issue 0046 (closed) で `"X" in copyOptions` から `copyOptions.X !== undefined` への置換が行われたが、現状この 4 プロパティを使ったテストは unit / e2e ともに 0 件で、置換による動的挙動不変が実テストで担保されていない。

## 優先度根拠

Low。issue 0046 で型安全化リファクタは完了済みで動的挙動は変わっていないため、本 issue は「将来の回帰検知」を目的とする予防的テスト追加。利用者影響なし。

## 現状

`tests/utils.test.ts` の `video parameters` 関連テスト群 (`:393` から始まる領域) は `videoBitRate` / `videoCodecType` のみをカバーしており、`videoVP9Params` / `videoH264Params` / `videoH265Params` / `videoAV1Params` を渡した場合の `message.video.vp9_params` / `h264_params` / `h265_params` / `av1_params` の積まれ方を検証するテストは存在しない (`grep -nE 'videoVP9Params|videoH264Params|videoH265Params|videoAV1Params' tests/utils.test.ts` の結果は 0 件)。

issue 0046 では「動的挙動は 1 ビットも変えない」を方針とし、回帰検知の既存テストとして完了条件 :109 で `video*Params の有効値・undefined・混在ケース` が挙げられていたが、これらが既存テストに存在しないままマージされた。

## 設計方針

- 4 プロパティそれぞれについて以下のケースを単体テストとして追加する:
  - 有効値 (例: `videoVP9Params: { profile_id: 0 }`) を渡すと `message.video.vp9_params` に等価のオブジェクトが積まれる
  - `undefined` を渡すと `message.video.*_params` キーが message に積まれない
  - `videoBitRate` 等の他キーとの混在 (例: `videoBitRate: 500, videoVP9Params: { profile_id: 0 }`) で双方が正しく積まれる
- `null` 入力テスト (delete ループ依存の pin) は別 issue (audio/video params キー全 16 件への null 入力テスト) で扱う
- 既存の `videoBitRate` / `videoCodecType` テスト (`tests/utils.test.ts:393-419`) のスタイル (`expect(createSignalingMessage(...)).toStrictEqual(...)`) に揃える
- `JSONType` 型 (`src/types.ts:22-28`) は `null` を unit に含むが、本 issue では有効値・undefined・他キー混在の正常系のみ扱う

## 完了条件

- `tests/utils.test.ts` に `videoVP9Params` / `videoH264Params` / `videoH265Params` / `videoAV1Params` の各々について少なくとも有効値 / undefined / 混在ケースのテストを追加する
- 既存テストの修正は不要 (動的挙動は不変、純粋な追加のみ)
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` がすべて pass
- `CHANGES.md` `## develop` `### misc` に `[ADD]` または `[UPDATE]` エントリ 1 件を追加する

## スコープ外

- `null` 入力テスト追加 (別 issue で扱う)
- 値域検証 (`videoVP9Params` の中身が SDP に流せる形式かどうか) は本 issue の対象外
- `audioOpusParams*` 系のテスト補強 (本 issue は video 系の 4 プロパティのみに限定)

## 解決方法

実装完了後に追記する (どのファイルをどう変更したかの実績)。
