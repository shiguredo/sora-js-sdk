# `in` 演算子で `undefined` 値を拾ってしまい不正なメッセージを Sora に送信する

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-in-operator-undefined-values

## 目的

`createSignalingMessage` の一部分岐が `"spotlightNumber" in options` 等の `in` 演算子で判定しており、値が `undefined` でもキーが存在していれば真と判定して message に `undefined` を代入する。`JSON.stringify` で省略はされるが、ロジックとしては不正で、`audioBitRate` / `videoBitRate` 等の number 系で `null` / `undefined` を渡されたケースの挙動が不安定になる。

## 優先度根拠

High。動的にオプションを組み立てるアプリで `{ ...base, spotlightNumber: someValueOrUndefined }` を渡すと、Sora 側で `invalid-spotlight-number` で接続拒否される可能性がある。

## 現状

`src/utils.ts:168-170`

```ts
if ("spotlightNumber" in options) {
  message.spotlight_number = options.spotlightNumber;
}
```

`in` 演算子は `undefined` 値でも true を返す。同様のパターンが `audioBitRate` / `videoBitRate` 関連（`:259-261, 306-308`）にも存在する。

## 設計方針

`in` 演算子ではなく型ガードで判定する。number 系は `typeof options.X === "number"`、その他は `options.X !== undefined && options.X !== null` のような明示判定にする。

## 完了条件

- `undefined` / `null` が message に積まれない
- 単体テストで `undefined` 渡しケースの message 構築結果を検証

## 解決方法

```ts
if (typeof options.spotlightNumber === "number") {
  message.spotlight_number = options.spotlightNumber;
}
```

`audioBitRate` / `videoBitRate` も同じパターンで修正する。`copyOptions` のフィルタ条件（`utils.ts:230-247`）も `undefined` を `delete` 対象に含めるよう統一する。
