# `clientId: ""` / `bundleId: ""` を有効値として送信して Sora に拒否される

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-clientid-bundleid-empty-string

## 目的

`createSignalingMessage` (`src/utils.ts`) は `options.clientId` / `options.bundleId` の `undefined` チェックしか行わず (`src/utils.ts:196-201`)、空文字 `""` がそのまま `client_id: ""` / `bundle_id: ""` として Sora に送信される。Sora 側は空文字を有効値として受け付けず、`invalid-client-id` などで接続拒否する。`createSignalingMessage` の段階で空文字を検出して `Error` を throw し、開発者に誤りを早期に伝える。

## 優先度根拠

High。React の `useState<string>("")` 初期値、フォーム入力の trim 漏れ、未入力プレースホルダの誤伝搬で容易に踏みうる。エンドユーザーから見ると「接続が失敗する」現象しか観測できず、空文字が原因と特定するのに時間がかかる。SDK の他オプション検証 (`src/utils.ts:132, 135, 324` の `throw new Error(...)`) と同じパターンで揃える。issue 0016 (forwardingFilter 両方指定検出) と方針を合わせ、ランタイム throw で早期失敗させる。

## 現状

`src/utils.ts:196-201`

```ts
if (options.clientId !== undefined) {
  message.client_id = options.clientId;
}
if (options.bundleId !== undefined) {
  message.bundle_id = options.bundleId;
}
```

`undefined` チェックのみで、空文字 `""` は素通りする。

Sora の `client_id` / `bundle_id` 仕様は空文字を許容しない (Sora 側で `invalid-client-id` を返す)。空文字を「指定なし」として `undefined` と同じく扱うのではなく、開発者の意図しない空文字流入を早期に検出するため throw する。

`metadata` / `signalingNotifyMetadata` などの他オプションは `JSONType | undefined` で空文字単独になるパスがほぼないため、本 issue ではスコープ外とする。文字列型として明示的に定義されている `clientId` / `bundleId` のみ検証する。

## 完了条件

- `createSignalingMessage` (`src/utils.ts`) で `options.clientId === ""` を検出した場合、`throw new Error("clientId must not be empty string")` を実行する
- 同じく `options.bundleId === ""` を検出した場合、`throw new Error("bundleId must not be empty string")` を実行する
- 検証は両方の if ブロックの直前 (もしくは内部) に置き、`undefined` ケースと文字列値ケースの正常系には影響しない
- 単体テストを `tests/utils.test.ts` に追加し、`clientId: ""` / `bundleId: ""` での `createSignalingMessage` が throw することを assert する。`clientId: "foo"` / `bundleId: "bar"` / `clientId: undefined` のケースは throw しないことも assert する
- CHANGES.md `## develop` に次のエントリを追記する
  ```
  - [FIX] createSignalingMessage で clientId / bundleId に空文字が指定された場合に Error を投げるようにする
    - @voluntas
  ```
- 本 issue は issue 0016 (forwardingFilter 両方指定検出) と同じ `createSignalingMessage` を編集するため、マージ順を 0016 → 0017 とする。issue 0016 で追加した throw 検証の直後に本 issue の検証を並べる形にする

## 解決方法

`src/utils.ts:196-201` を次の通り書き換える。

```ts
if (options.clientId !== undefined) {
  if (options.clientId === "") {
    throw new Error("clientId must not be empty string");
  }
  message.client_id = options.clientId;
}
if (options.bundleId !== undefined) {
  if (options.bundleId === "") {
    throw new Error("bundleId must not be empty string");
  }
  message.bundle_id = options.bundleId;
}
```

`tests/utils.test.ts` に次のテストを追加する。

```ts
test("clientId に空文字を指定した場合に Error を投げる", () => {
  expect(() =>
    createSignalingMessage("sdp", "sendrecv", "channel", null, { clientId: "" }, false),
  ).toThrow("clientId must not be empty string");
});

test("bundleId に空文字を指定した場合に Error を投げる", () => {
  expect(() =>
    createSignalingMessage("sdp", "sendrecv", "channel", null, { bundleId: "" }, false),
  ).toThrow("bundleId must not be empty string");
});
```

`createSignalingMessage` の引数シグネチャは `src/utils.ts:60` 付近で確認する。
