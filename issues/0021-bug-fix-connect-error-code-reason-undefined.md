# `ConnectError.code` / `reason` がインスタンス生成後に undefined のままになる経路がある

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-connect-error-constructor

## 目的

`ConnectError` は `code?: number; reason?: string;` のクラスフィールドのみ持ち、constructor で初期化されない。`base.ts:1123, 1233, 1236` 等で `new ConnectError("...")` だけ呼ばれて code / reason 未代入のケースがある。ユーザーが `if (error instanceof ConnectError) { switch (error.code) { ... } }` でエラー分類しようとしても常に `undefined` になり、分類不能。

## 優先度根拠

High。SDK 利用者がエラーハンドリング設計を組めない致命的な公開 API バグ。

## 現状

`src/utils.ts:414-417`

```ts
export class ConnectError extends Error {
  code?: number;
  reason?: string;
}
```

呼び出し側 (`base.ts:1135-1140` 等) で `error.code = event.code; error.reason = event.reason;` のように後付け代入されるケースもあるが、`base.ts:1123` (`throw new ConnectError("Signaling failed. The signalingUrlCandidates array is empty.")`) のように代入されないケースもある。

## 設計方針

constructor で `code` / `reason` を受け取り必ず初期化する。`name` プロパティも設定する。後付け代入のコードはすべてこの constructor 呼び出しに置き換える。

## 完了条件

- `new ConnectError(message, code?, reason?)` で生成時に code / reason が必ずセットされる
- `error.name === "ConnectError"` で識別可能
- 単体テストで code / reason / name の挙動を検証

## 解決方法

```ts
export class ConnectError extends Error {
  code?: number;
  reason?: string;

  constructor(message: string, code?: number, reason?: string) {
    super(message);
    this.name = "ConnectError";
    this.code = code;
    this.reason = reason;
    Object.setPrototypeOf(this, ConnectError.prototype);
  }
}
```

呼び出し側 `base.ts:1135-1142` などの後付け代入をすべて constructor 引数経由に置き換える。`ConnectError` を `errors.ts` に統合（issue 0022 と連動）するのが望ましい。
