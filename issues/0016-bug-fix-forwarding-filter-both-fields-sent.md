# `forwardingFilter` と `forwardingFilters` の同時指定時に両方を送信して Sora に接続拒否される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-forwarding-filter-exclusive

## 目的

`createSignalingMessage` (`src/utils.ts`) で `options.forwardingFilters` (新 API、複数フィルタ) と `options.forwardingFilter` (旧 API、単一フィルタ) が両方とも `undefined` でない場合、両方を signaling message に積んでしまう (`src/utils.ts:190-195`)。Sora は「どちらか片方のみ」を期待しており、両方積まれると `invalid-signaling-message` で接続拒否される。`createSignalingMessage` の段階で両方指定を検出して `Error` を throw し、開発者に誤りを早期に伝える。

## 優先度根拠

High。旧 API `forwardingFilter` から新 API `forwardingFilters` への移行期に、開発者が誤って両方をセットすると「Sora から接続拒否される」現象が SDK 側ログでは原因不明として現れる。発生条件は型システムでは検出できない (両プロパティとも `options` に独立して存在する) ため、ランタイムで早期 throw する以外に防ぐ方法がない。同 SDK の他のオプション検証パス (`src/utils.ts:132, 135, 324` の `throw new Error(...)`) と同じパターンで揃える。

## 現状

`src/utils.ts:190-195`

```ts
if (options.forwardingFilters !== undefined) {
  message.forwarding_filters = options.forwardingFilters;
}
if (options.forwardingFilter !== undefined) {
  message.forwarding_filter = options.forwardingFilter;
}
```

両方の `if` 条件が真のとき、両方が `message` に積まれて Sora に送信される。Sora 仕様上は片方のみ許容され、両方指定は `invalid-signaling-message` (close code 4xxx) を返す。

`createSignalingMessage` (`src/utils.ts:60` 付近開始) は他のオプション検証 (例: `src/utils.ts:132` で「Unknown role type」、`:135` で「channelId can not be null or undefined」、`:324` で「Simulcast can not be used with this browser」) を同期 `throw new Error(...)` で行うパターンを採用しており、本 issue の検証もこれに揃える。`ConnectError` (`src/utils.ts:414-417`) ではなく素の `Error` を使う。

## 完了条件

- `createSignalingMessage` (`src/utils.ts`) で `options.forwardingFilter !== undefined && options.forwardingFilters !== undefined` を検出した場合、`throw new Error("Both 'forwardingFilter' and 'forwardingFilters' are specified. Use only one.")` を実行する
- 検証は両方の if ブロックの直前に置くことで、片方指定の正常系には影響しない
- 単体テストを `tests/utils.test.ts` に追加し、両方指定時に `createSignalingMessage` が throw することを assert する。片方のみ指定時 (`forwardingFilters` のみ、`forwardingFilter` のみ) は throw しないことも assert する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] createSignalingMessage で forwardingFilter と forwardingFilters の両方が指定された場合に Error を投げるようにする
    - @voluntas
  ```
- 本 issue は他の issue と直接の依存はない。`createSignalingMessage` を編集する他の issue がない限りマージ衝突は起きない

## 解決方法

`src/utils.ts:190-195` を次の通り書き換える。両方指定の検証を `forwardingFilters` / `forwardingFilter` 個別の if ブロックの直前に挿入する。

```ts
if (options.forwardingFilter !== undefined && options.forwardingFilters !== undefined) {
  throw new Error("Both 'forwardingFilter' and 'forwardingFilters' are specified. Use only one.");
}
if (options.forwardingFilters !== undefined) {
  message.forwarding_filters = options.forwardingFilters;
}
if (options.forwardingFilter !== undefined) {
  message.forwarding_filter = options.forwardingFilter;
}
```

`tests/utils.test.ts` に次のテストを追加する。

```ts
test("forwardingFilter と forwardingFilters の両方指定で Error を投げる", () => {
  expect(() =>
    createSignalingMessage(
      "sdp",
      "sendrecv",
      "channel",
      null,
      {
        forwardingFilter: {
          /* dummy */
        },
        forwardingFilters: [
          {
            /* dummy */
          },
        ],
      },
      false,
    ),
  ).toThrow("Both 'forwardingFilter' and 'forwardingFilters' are specified. Use only one.");
});
```

引数の dummy は実際の `ForwardingFilter` 型に合わせる。`createSignalingMessage` のシグネチャは `src/utils.ts:60` 付近で確認する。
