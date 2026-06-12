# `tests/utils.test.ts` の既存 `audio: undefined` / `video: undefined` テストに意図コメントを補強する

- Priority: Low
- Created: 2026-06-12
- Polished: {YYYY-MM-DD}
- Model: Opus 4.7
- Branch: feature/refactor-augment-undefined-test-comments

## 目的

`tests/utils.test.ts` の既存 `createSignalingMessage audio: undefined` / `createSignalingMessage video: undefined` テストはコメントが付いていない。一方、issue 0018 で新規に追加した同種の `audioBitRate: undefined` / `videoBitRate: undefined` / `audioOpusParamsChannels: undefined` / `audioBitRate: 100, audioCodecType: undefined` には「copyOptions delete ループで undefined キーが除去されるため `audio: true` / `video: true` を保つ」という意図コメントが付いている。

既存と新規でコメント濃度の非対称が生じており、`CLAUDE.md` の「テストはコメントを重視すること」原則からも「既存側にも同等のコメントを追加して揃える」のが本来あるべき姿。`/auto-resolve 18,19` の処理中、issue 0018 のレビュー (観点 2 改善 4) で broken windows として指摘されたが、issue 0018 のスコープ外として保留したため別 issue として起票する。

## 優先度根拠

Low。テストの挙動は変えず、コメント追加のみで利用者影響なし。緊急性はないが「破られた窓」原則 (`CLAUDE.md` 「Don't live with broken windows」) に基づき低優先度で対処する。

## 現状

`tests/utils.test.ts` (issue 0018 マージ後、commit `232694a4` 時点) の該当 2 テストはコメントなし:

```ts
test("createSignalingMessage audio: undefined", () => {
  const options = {
    audio: undefined,
  };
  const expectedMessage = { ...baseExpectedMessage, audio: true };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage video: undefined", () => {
  const options = {
    video: undefined,
  };
  const expectedMessage = { ...baseExpectedMessage, video: true };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});
```

一方、issue 0018 で追加した `audioBitRate: undefined` テストにはコメントあり:

```ts
test("createSignalingMessage audioBitRate: undefined", () => {
  // audioBitRate: undefined 単独の場合、copyOptions delete ループで undefined キーが除去されるため
  // hasAudioProperty が false のまま message.audio は boolean true を保つ
  const options = {
    audioBitRate: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});
```

`audio: undefined` / `video: undefined` 経路は `audioBitRate: undefined` と異なり「`src/utils.ts:232-237` の boolean ガードを `typeof === "boolean"` で通らず、末尾の `delete copyOptions[key]` で落ちる → `copyOptions.audio === undefined` で `if (copyOptions.audio !== undefined)` の代入分岐をスキップ → `message.audio` が `baseExpectedMessage.audio` (`true`) を保つ」という別経路の挙動。テストを読んだだけではこの経路は分からない。

## 設計方針

既存 2 テストに 1〜2 行の意図コメントを追加する。経路の違い (`audio: undefined` は boolean ガード + 末尾 delete、`audioBitRate: undefined` は delete ループの `continue` 条件) を区別できる粒度で書く。

例:

```ts
test("createSignalingMessage audio: undefined", () => {
  // audio: undefined は src/utils.ts:232-234 の boolean ガード (typeof === "boolean") を通らず、
  // copyOptions delete ループ末尾の delete で除去されるため message.audio は baseExpectedMessage.audio (true) を保つ
  const options = {
    audio: undefined,
  };
  const expectedMessage = { ...baseExpectedMessage, audio: true };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});
```

video 側も同様の趣旨で書く。

## 完了条件

- `tests/utils.test.ts` の `createSignalingMessage audio: undefined` / `createSignalingMessage video: undefined` の 2 テストに、`audioBitRate: undefined` 等と同等の粒度の意図コメントを追加する
- 既存テストの assertion・期待値は一切変えない (挙動を変えないコメント追加のみ)
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass し、`pnpm fmt` で差分が出ないこと
- `CHANGES.md` `## develop` の `### misc` に `[UPDATE]` エントリを 1 件追記する (機能影響なし、テストコメント追加のみ)

## スコープ外

- 他の `undefined` 系既存テスト (`clientId: undefined`、`bundleId: undefined`、`signalingNotifyMetadata: undefined`、`dataChannelSignaling: undefined`、`ignoreDisconnectWebSocket: undefined`、`audioStreamingLanguageCode: undefined`、`spotlightNumber: undefined` 等) へのコメント補強 — 本 issue は `audio: undefined` / `video: undefined` の 2 件のみに限定 (これらは issue 0018 で新規追加した `audioBitRate: undefined` 等との対称性を保つことが主目的のため)
- テストの構造変更 / 命名変更 / `describe` ブロック導入等のリファクタ
