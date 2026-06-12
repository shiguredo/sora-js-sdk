# `messaging()` が呼び出し側の `options` を破壊し他 Connection の `this.options` まで壊す

- Priority: High
- Created: 2026-05-21
- Polished: 2026-06-11
- Completed: 2026-06-12
- Model: Opus 4.7
- Branch: feature/fix-messaging-mutates-shared-options

## 目的

`Sora.connection().messaging()` (`src/sora.ts:210-227`) が引数 `options` をその場で mutate し、`ConnectionBase` constructor (`src/base.ts:264`) が浅い参照のまま `this.options = options` と保持するため、同一 `opts` を `sendrecv()` と `messaging()` に渡すと後者が前者の `this.options` まで書き換える。加えて呼び出し側で `opts` を直接 mutate すると、参照を保持しているすべての Connection の `this.options` が連動して変質する。

## 優先度根拠

High。`messaging()` は `@public` JSDoc 付き公開 API (`src/sora.ts:189-209` 付近) で、同一 `opts` を `sendrecv()` と `messaging()` に渡す利用形態は SDK の使用例として自然。破壊の症状 (sendrecv 側の audio/video 設定が後から書き換わる、`opts.skipIceCandidateEvent` が `false` に変質する) は SDK ログから観測しづらく、原因特定が困難。

## 現状

| 箇所                  | 役割                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/sora.ts:215-217` | `options.audio = false; options.video = false; options.dataChannelSignaling = true;` の直接代入が呼び出し側 `opts` を破壊 ((1) で修正)                              |
| `src/base.ts:264`     | `this.options = options;` で浅い参照を保持し、呼び出し側 `opts` と同一参照になる ((2) で修正)                                                                       |
| `src/base.ts:269`     | `this.options.skipIceCandidateEvent ??= false;` が `:264` の浅い参照経由で呼び出し側 `opts` にも `skipIceCandidateEvent: false` を書き込む ((2) 適用で副次的に解消) |

`sendrecv` / `sendonly` / `recvonly` (`src/sora.ts:110-187`) は options を mutate せず `new ConnectionPublisher(...)` / `new ConnectionSubscriber(...)` を返すだけだが、(2) の参照保持があるため `??=` 漏れと外部 mutate 連動の両方が発生する。`this.options.X = Y` 形式の書き込みは `src/base.ts:269` の 1 箇所のみで、それ以外の `this.options` 参照はすべて read 専用 (constructor 内のタイムアウト系 `:273` の `timeout` / `:281` の `connectionTimeout` / `:286` の `disconnectWaitTimeout` / `:291` の `signalingCandidateTimeout` は `typeof ... === "number"` ガード越しに局所変数へ転写、`:1421` は `createSignalingMessage` への全体渡し、`:1584` の `forceStereoOutput` は条件式の read のみ。2026-06-11 develop 時点でソース全体を目視確認)。

再現:

```ts
import Sora, { type ConnectionOptions } from "sora-js-sdk";

const connection = Sora.connection("ws://example.com/signaling");
const opts: ConnectionOptions = { audio: true, video: true };

const sendrecv = connection.sendrecv("ch1", null, opts);
// この時点で src/base.ts:269 が走り opts.skipIceCandidateEvent === false に変質
// sendrecv.options === opts (同一参照)

connection.messaging("ch2", null, opts);
// この時点で src/sora.ts:215-217 が走り opts.audio === false / video === false / dataChannelSignaling === true に変質
// sendrecv.options === opts のため sendrecv 側にも上書きが伝播
```

## 設計方針

### 1. `messaging()` (`src/sora.ts:210-227`)

呼び出し側 `options` を mutate しないよう spread でコピーした上で必須値を後置で上書きする:

```ts
messaging(
  channelId: string,
  metadata: JSONType = null,
  options: ConnectionOptions = { audio: false, video: false },
): ConnectionMessaging {
  // 呼び出し側 options を mutate しないよう spread でコピーした上で必須値を上書きする
  const merged: ConnectionOptions = {
    ...options,
    audio: false,
    video: false,
    dataChannelSignaling: true,
  };
  return new ConnectionMessaging(
    this.signalingUrlCandidates,
    "sendonly",
    channelId,
    metadata,
    merged,
    this.debug,
  );
}
```

既存の `// messaging は role sendonly として扱う` コメント (`"sendonly",` の直上) は本修正と無関係のため、上記サンプルでは省略しているが実装ではそのまま残す。

### 2. `ConnectionBase` constructor (`src/base.ts:264`)

`this.options = options;` を `this.options = { ...options };` に変える。直後の `:266-269` の既存ブロック (`skipIceCandidateEvent` のコメント 3 行と `??=` 代入) は本修正と無関係のため一切手を入れない。新規に追加するのは shallow copy のコメント 1 行のみ:

```ts
// 呼び出し側 options を mutate しないよう shallow copy する
this.options = { ...options };

this.options.skipIceCandidateEvent ??= false;
```

`ConnectionBase.options` は public フィールド (`src/base.ts:118` で `options: ConnectionOptions;` と宣言済) のため、テスト側から `sendrecv.options.audio` 等で参照可能。

ネストオブジェクト (`forwardingFilters`, `forwardingFilter`, `dataChannels` 等) は shallow copy で共有参照のまま残す (deep clone しない理由は「スコープ外」参照)。

### 3. テスト (`tests/sora.test.ts` 新規)

既存 `tests/utils.test.ts` のスタイル (Vitest globals 直接利用、ファイル冒頭に必要な型 import のみ) に合わせる。`Sora.connection()` / `connection.sendrecv()` / `connection.messaging()` は `connect()` を呼ばない限りネットワーク I/O が走らず、モック・スタブなしで実構築できる。

```ts
import Sora from "../src/sora";
import type { ConnectionOptions } from "../src/types";

test("messaging() が呼び出し側の options を破壊しない", () => {
  // 設計方針 (1) の修正のみで pass する弁別テスト。messaging() 単独呼び出しは sendrecv の経路を
  // 経由しないため、(2) の有無に関わらず (1) の修正だけが結果を左右する。
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  connection.messaging("ch", null, opts);
  expect(opts.audio).toBe(true);
  expect(opts.video).toBe(true);
  expect(opts.dataChannelSignaling).toBeUndefined();
});

test("messaging() の上書きが他の Connection の options に伝播しない", () => {
  // タイトル後半「他 Connection の this.options まで壊す」の症状を、現実の利用形態
  // (同一 opts を sendrecv() と messaging() に渡す) で再現する regression テスト。
  // (1)(2) のいずれが単独修正されても pass するため、(1)(2) の弁別はテスト 1 / 3 が担う。
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  const sendrecv = connection.sendrecv("ch1", null, opts);
  connection.messaging("ch2", null, opts);
  expect(sendrecv.options.audio).toBe(true);
  expect(sendrecv.options.video).toBe(true);
  expect(sendrecv.options.dataChannelSignaling).toBeUndefined();
});

test("sendrecv() で skipIceCandidateEvent のデフォルト値設定が呼び出し側 options に漏れない", () => {
  // 設計方針 (2) の修正のみで pass する弁別テスト。sendrecv() 自体は options を mutate しないため、
  // (1) の有無に関わらず (2) の shallow copy 修正だけが結果を左右する。
  const opts: ConnectionOptions = { audio: true, video: true };
  const connection = Sora.connection("ws://example.invalid/signaling");
  connection.sendrecv("ch", null, opts);
  expect(opts.skipIceCandidateEvent).toBeUndefined();
});
```

### 4. CHANGES.md

`## develop` 本体の既存 `[FIX]` 群末尾 (`### misc` より前) に下記 2 件を追記する。両方とも SDK 利用者から観測できる挙動修正のため本体側に置く:

```
- [FIX] messaging() が呼び出し側に渡された options を破壊しないように修正する
  - @voluntas
- [FIX] ConnectionBase constructor で options を shallow copy し skipIceCandidateEvent の内部代入が呼び出し側 options に漏れないように修正する
  - 上記 messaging() の修正とあわせて、同一 options を sendrecv() / sendonly() / recvonly() と messaging() に渡したときに先行 Connection の options まで書き換わる問題も解消する
  - @voluntas
```

## スコープ外

- `options` の deep clone とネストプロパティの防御的コピー — 本 issue では行わない
  - 「現状」の検証通り SDK 内部の `this.options.X = Y` 書き込みは `src/base.ts:269` の 1 箇所のみ
  - ネスト (`forwardingFilters` / `forwardingFilter` / `dataChannels`) は `src/utils.ts` の `createSignalingMessage` 内 (`:190-195`, `:327-328` 付近) で signaling message に read してコピーするのみで mutate しない
  - 上記より `ConnectionOptions` のネスト構造に対する deep clone は不要

## マージ順

他 issue との依存なし。単独マージ可。

## 完了条件

- `src/sora.ts:210-227` の `messaging()` を spread copy パターンに置き換える
- `src/base.ts:264` の `this.options = options;` を `this.options = { ...options };` に変更する
- `tests/sora.test.ts` (新規) に「3. テスト」の 3 テストを追加する
- ローカルで `pnpm test` / `pnpm typecheck` / `pnpm lint` が pass し、`pnpm fmt` で差分が出ないこと
- `CHANGES.md` `## develop` 本体の既存 `[FIX]` 群末尾 (`### misc` より前) に `[FIX]` エントリ 2 件を追記する

## 解決方法

設計方針 1 / 2 / 3 / 4 をすべて反映した。

- `src/sora.ts:210-231`: `messaging()` を spread copy パターンに置き換え、`merged: ConnectionOptions = { ...options, audio: false, video: false, dataChannelSignaling: true }` を `ConnectionMessaging` に渡す形に変更
- `src/base.ts:264-265`: `this.options = options;` を「呼び出し側 options を mutate しないよう shallow copy する」コメント付きで `this.options = { ...options };` に変更
- `tests/sora.test.ts`: 新規ファイルを作成し、3 テストを追加
  - `messaging() が呼び出し側の options を破壊しない` (設計方針 1 の弁別テスト)
  - `messaging() の上書きが他の Connection の options に伝播しない` (regression テスト)
  - `sendrecv() で skipIceCandidateEvent のデフォルト値設定が呼び出し側 options に漏れない` (設計方針 2 の弁別テスト)
- ローカル検証: `pnpm test` (85 件 pass) / `pnpm typecheck` / `pnpm lint` / `pnpm fmt` すべて pass・差分なし
- `CHANGES.md` `## develop` 本体の `[FIX]` 群末尾に `[FIX]` エントリ 2 件を追記
