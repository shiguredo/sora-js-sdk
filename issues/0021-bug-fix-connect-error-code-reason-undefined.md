# `ConnectError.code` / `reason` がインスタンス生成後に undefined のまま残る経路がある

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-connect-error-constructor

## 目的

`ConnectError` (`src/utils.ts:414-417`) は `code?: number; reason?: string;` のクラスフィールドを宣言するのみで constructor を持たない。呼び出し側 (例: `src/base.ts:1136-1140`) で `new ConnectError(message)` 直後に `error.code = event.code; error.reason = event.reason;` と後付け代入するパターンが採用されているが、`src/base.ts:1123`、`:1233`、`:1236`、`:1610` のように `new ConnectError(message)` だけで終わるケースもある。これらの経路では `error.code` / `error.reason` が `undefined` のままユーザーに渡る。

SDK 利用者が `if (error instanceof ConnectError) { switch (error.code) { ... } }` のようにエラー分類しようとしても、`code` / `reason` が `undefined` だと分類できない。`ConnectError` に constructor を導入して `code` / `reason` を初期化時に受け取り、`name` も `"ConnectError"` で設定し、後付け代入を必要に応じて constructor 引数経由に置き換える。

## 優先度根拠

High。SDK 利用者がエラーハンドリング設計を組めない公開 API バグ。再接続戦略 (例: `code === 1006` で abnormal closure と判定) や Sentry / 監視ツールへのエラー分類が機能しない。issue 0007 / 0008 で新たに導入する `error.reason = "WS_SEND_INVALID_STATE"` などの分類用 reason も、constructor 経由で渡せるようにしておくと統一感が出る。

## 現状

`src/utils.ts:414-417`

```ts
export class ConnectError extends Error {
  code?: number;
  reason?: string;
}
```

呼び出しパターン (`src/base.ts`):

- `:1123` `throw new ConnectError("Signaling failed. The signalingUrlCandidates array is empty.")`: code / reason 未代入
- `:1136-1140` `new ConnectError(...)` + `error.code = event.code; error.reason = event.reason;`: 後付け
- `:1233` `throw new ConnectError("Signaling failed. All signaling URL candidates failed to connect")`: code / reason 未代入
- `:1236` `throw new ConnectError("Signaling failed. Invalid format signaling URL candidates")`: code / reason 未代入
- `:1261-1265` 後付けパターン
- `:1600-1604` 後付けパターン
- `:1610` `new ConnectError("Signaling failed. WebSocket onerror was called")`: code / reason 未代入

`name` プロパティも未設定なので、デフォルトの `Error` 由来 `"Error"` のまま。

issue 0007 / 0008 では新たに `new ConnectError(...)` を導入し `error.reason = "WS_SEND_INVALID_STATE"` 等を後付け代入する解決方法を採用している。本 issue が constructor を提供すれば、0007 / 0008 もそれに合わせて clean に書ける。マージ順は本 issue → 0007 / 0008 を推奨する。

## 完了条件

- `src/utils.ts:414-417` の `ConnectError` クラスに constructor を追加する。`constructor(message: string, code?: number, reason?: string)` で `super(message)`、`this.name = "ConnectError"`、`this.code = code`、`this.reason = reason`、`Object.setPrototypeOf(this, ConnectError.prototype)` を呼ぶ
- `src/base.ts` 内の既存呼び出しを次のように分類して書き換える
  - `code` / `reason` を渡せる箇所 (`:1136-1140`、`:1261-1265`、`:1600-1604`): `new ConnectError(message, event.code, event.reason)` 形式に変更し、後付け代入を削除
  - `code` / `reason` が無い箇所 (`:1123`、`:1233`、`:1236`、`:1610`): `new ConnectError(message)` のまま (引数 optional のため変更不要だが、`name = "ConnectError"` の効果は得られる)
- 単体テストを `tests/utils.test.ts` に追加し、次を assert する
  - `const e = new ConnectError("msg"); expect(e.name).toBe("ConnectError"); expect(e.code).toBeUndefined(); expect(e.reason).toBeUndefined();`
  - `const e = new ConnectError("msg", 1006, "abnormal"); expect(e.code).toBe(1006); expect(e.reason).toBe("abnormal");`
  - `e instanceof ConnectError === true` (`Object.setPrototypeOf` が効いていることを確認)
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [CHANGE] ConnectError に constructor(message, code?, reason?) を追加し name プロパティを設定するようにする
    - @voluntas
  ```
  既存の `code` / `reason` を後から代入するパターンは引き続き動くため、本変更は実質的に後方互換だが、`name` が `"Error"` から `"ConnectError"` に変わる挙動変更があるため `[CHANGE]` とする
- 本 issue のマージ順は 0007 / 0008 より先。0007 / 0008 で `new ConnectError(...).reason = "X"` の後付け代入パターンを採用している箇所は、本 issue マージ後に `new ConnectError(message, undefined, "X")` 形式に書き換える (0007 / 0008 のレビューで対応)
- `errors.ts` (`src/errors.ts`) には別の Error クラスが定義済み (`DisconnectWaitTimeoutError` 等)。`ConnectError` を `errors.ts` に移動するか `utils.ts` に残すかは issue 0022 (`disconnect errors missing name`) と合わせて検討する。本 issue は `utils.ts:414-417` の場所のまま constructor を追加する

## 解決方法

`src/utils.ts:414-417` を次の通り書き換える。

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

`Object.setPrototypeOf(this, ConnectError.prototype)` は TypeScript で `Error` を継承する際の prototype チェーン補正で、`instanceof` を確実に効かせるために必要 ([TypeScript Handbook: Extending Built-ins](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-mix-in-classes))。

`src/base.ts` の既存呼び出しを次の通り書き換える。

```ts
// :1136-1140 の後付け代入を constructor 引数経由に
const error = new ConnectError(
  `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`,
  event.code,
  event.reason,
);
// error.code / error.reason の後付け代入を削除

// :1261-1265 / :1600-1604 も同様
```

`tests/utils.test.ts` に次のテストを追加する。

```ts
test("ConnectError は constructor で code / reason / name を設定する", () => {
  const e1 = new ConnectError("msg");
  expect(e1.name).toBe("ConnectError");
  expect(e1.message).toBe("msg");
  expect(e1.code).toBeUndefined();
  expect(e1.reason).toBeUndefined();
  expect(e1 instanceof ConnectError).toBe(true);
  expect(e1 instanceof Error).toBe(true);

  const e2 = new ConnectError("msg", 1006, "abnormal");
  expect(e2.code).toBe(1006);
  expect(e2.reason).toBe("abnormal");
});
```
