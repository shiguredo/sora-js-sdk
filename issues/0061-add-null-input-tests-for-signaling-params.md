# `tests/utils.test.ts` に `createSignalingMessage` の audio / video パラメータキーへの `null` 入力テストを追加する

- Priority: Low
- Created: 2026-06-16
- Completed: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/add-null-input-tests-for-signaling-params
- Polished: {YYYY-MM-DD}

## 目的

`createSignalingMessage` (`src/utils.ts`) の `copyOptions` delete ループ (`:230-262`、issue 0018 closed で導入) が、audio / video パラメータキーに `null` を渡されたときに事前に delete する動作を pin する回帰テストを `tests/utils.test.ts` に追加する。

issue 0046 (closed) の `typeof` ガード置換は「`null` は事前 delete ループで除去されるため、`typeof === "number"` 等で `null` が弾かれても message に積む値の集合は不変」という前提に依存しているが、この前提を保証する `null` 入力テストが現状 0 件で、将来 delete ループの条件が `value != null` から `value !== null && value !== undefined` の片方が抜けるような書き換えが入ると、本 refactor 後の挙動が静かに壊れても unit テストでは検知できない。

## 優先度根拠

Low。issue 0046 / 0018 マージ済みで動的挙動は正しく動いており、本 issue は「将来の回帰検知」を目的とする予防的テスト追加。利用者影響なし。issue 0050 (open、`createSignalingMessage` の delete ループ helper 抽出) の実装時に、この回帰テストが pin として機能することを目的とする。

## 現状

`tests/utils.test.ts` を `grep -n "null" tests/utils.test.ts` で確認すると、`audio/video パラメータキー` (`audioCodecType` / `audioBitRate` / `audioOpusParams*` / `videoCodecType` / `videoBitRate` / `videoVP9Params` 等) に `null` を渡したテストは 0 件。`channelId: null` / `metadata: null` 等の他キーに対する null テストは存在するが、本 issue の対象キーには無い。

issue 0018 (closed) で `copyOptions[key] !== null && copyOptions[key] !== undefined` の事前 delete が導入され、issue 0046 (closed) で `typeof` ガードへ置換された結果、これらキーに `null` を渡しても `message.audio.*` / `message.video.*` には積まれない挙動が成立しているが、それを担保するテストが存在しない。

## 設計方針

以下のキーに `null` (`as <型>` 等で型強制) を渡した場合に、対応する message プロパティが積まれないことを assertion する単体テストを追加する。

- audio セクション: `audioCodecType: null`, `audioBitRate: null`
- audio_opus_params セクション: `audioOpusParamsChannels: null`, `audioOpusParamsMaxplaybackrate: null`, `audioOpusParamsStereo: null`, `audioOpusParamsSpropStereo: null`, `audioOpusParamsMinptime: null`, `audioOpusParamsPtime: null`, `audioOpusParamsUseinbandfec: null`, `audioOpusParamsUsedtx: null`
- video セクション: `videoCodecType: null`, `videoBitRate: null`, `videoVP9Params: null`, `videoH264Params: null`, `videoH265Params: null`, `videoAV1Params: null`

全 16 キー × 1 ケース = 16 テスト追加。あるいは、3 セクション単位でまとめて 1 テストにする (例: 全 audio キーに null を渡して `message.audio` が `true` のままになることを 1 テストで assert する) かは実装者判断。

既存の `tests/utils.test.ts` のスタイル (`expect(createSignalingMessage(...)).toStrictEqual(baseExpectedMessage)`) に揃える。

## 完了条件

- `tests/utils.test.ts` に上記 16 キーへの `null` 入力テストを追加する (個別 16 テストまたはセクション単位の集約テスト、いずれも可)
- 既存テストの修正は不要 (動的挙動は不変、純粋な追加のみ)
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` がすべて pass
- `CHANGES.md` `## develop` `### misc` に `[ADD]` または `[UPDATE]` エントリ 1 件を追加する

## スコープ外

- `videoVP9Params` 等 JSONType 系 4 件の正常系テスト追加 (別 issue で扱う)
- 値域検証 (例: `audioCodecType` の文字列値ホワイトリストチェック) は本 issue の対象外
- delete ループ自体の構造変更 (issue 0050 で扱う)
- `null` 以外の型逸脱値 (例: `audioOpusParamsStereo: 0` のような number 代入) のテスト追加 (本 issue は `null` のみに限定)

## 解決方法

実装完了後に追記する (どのファイルをどう変更したかの実績)。
