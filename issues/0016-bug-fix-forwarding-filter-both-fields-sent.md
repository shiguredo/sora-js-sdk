# `forwardingFilter` と `forwardingFilters` の同時送信を防げず Sora が接続拒否する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-forwarding-filter-exclusive

## 目的

`createSignalingMessage` で `options.forwardingFilters` と `options.forwardingFilter` の両方が指定されていれば両方をメッセージに積んでしまう。Sora 側は「どちらか片方のみ」を期待しており、両方積むと `invalid-signaling-message` で接続拒否される致命的な接続不能経路を修正する。

## 優先度根拠

High。旧 API（`forwardingFilter`）から新 API（`forwardingFilters`）への移行期に開発者が誤って両方セットすると、原因不明の接続失敗として現れる。

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

両方の `if` が真の場合、両方が message に積まれる。

## 設計方針

両方が指定された場合は throw して、開発者に誤りを早期に伝える。新 API を優先するよう警告するなら trace ログを残す。

## 完了条件

- 両方指定で throw する
- 単体テストで両指定時の throw を検証

## 解決方法

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
