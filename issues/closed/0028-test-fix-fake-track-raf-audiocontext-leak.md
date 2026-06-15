# e2e-tests の fake media 生成で connect/disconnect 繰り返し時に RAF / AudioContext が解放されない

- Priority: Medium
- Created: 2026-05-21
- Polished: 2026-06-14
- Completed: 2026-06-15
- Model: Opus 4.7
- Branch: feature/fix-fake-track-cleanup

## 必要性

**必要。** `e2e-tests/src/fake.ts` の `createFakeVideoTrack` / `createFakeAudioTrack` は、生成時に `requestAnimationFrame` / `AudioContext` / `OscillatorNode` を起動するが、これらのリソースは track の `ended` イベントハンドラ内でのみ解放されている。呼び出し元の 5 ファイルは disconnect 時に fake track を停止しておらず、SDK の `disconnect()` も stream の track を停止しない。したがって `ended` イベントが発火せず、RAF / AudioContext / Oscillator が解放されない。同一 page 内で connect / disconnect を繰り返すとこれらのリソースが蓄積する。

## 目的

`getFakeMedia` の戻り値に明示的 `cleanup()` を追加し、呼び出し元が disconnect 時にリソースを解放できるようにする。`cleanup()` は idempotent にし、既存 `ended` ハンドラからも同じ cleanup を呼ぶ。

## 優先度根拠

Medium。現行の Playwright E2E は各 test で新規 page を使用するため CI では顕在化しない。同一 page 内で connect / disconnect を繰り返す手動操作や long-running E2E で顕在化する。

## 現状

### fake.ts

`createFakeVideoTrack` / `createFakeAudioTrack` はいずれも `MediaStreamTrack` のみを返す。リソース解放は各 `ended` イベントハンドラ内に閉じており、呼び出し元からは外部化されていない。

- video: `ended` 時に `cancelAnimationFrame` のみ
- stereo audio: `ended` 時に `oscillatorLeft.stop()` / `oscillatorRight.stop()` / `audioCtx.close()`
- mono audio: `ended` 時に `oscillator.stop()` / `audioCtx.close()`

`getFakeMedia` は `MediaStream` のみを返し、明示的 cleanup 関数を提供していない。

### 呼び出し元

`getFakeMedia` は 5 ファイル / 6 箇所で呼ばれている。リポジトリ全体を grep した結果、それ以外の呼び出しはない。

| ファイル                                       | 用途                            | 自動テスト対象 |
| ---------------------------------------------- | ------------------------------- | -------------- |
| `e2e-tests/fake_stereo_audio/main.ts`          | stereo / mono audio E2E         | はい           |
| `e2e-tests/fake_stereo_audio_sendrecv/main.ts` | sendrecv stereo E2E (2 接続)    | はい           |
| `e2e-tests/fake_sendonly/main.ts`              | sendonly E2E (audio/video 動的) | いいえ         |
| `e2e-tests/sendrecv_webkit/main.ts`            | WebKit sendrecv E2E             | はい           |
| `e2e-tests/simulcast_sendonly_webkit/main.ts`  | simulcast WebKit E2E            | はい           |

5 ファイルすべてで `getFakeMedia` の戻り値は `#connect` クリックハンドラ内の `const stream` に束縛されており、`#disconnect` ハンドラ（別クロージャ）からは参照できない。cleanup を `#disconnect` で呼ぶには保持変数の巻き上げが必要。

`fake_sendonly/main.ts` は自動テストで実行されていない。本 issue では変更対象とするが、CI では検証されないため手動確認とする。

## 設計方針

### fake.ts

`createFakeVideoTrack` / `createFakeAudioTrack` は `{ track, cleanup }` を返す。`cleanup` は実行済みフラグでガードし idempotent にする。`cleanup` 内では `track.stop()` を呼び、`ended` リスナーを除去してから RAF / AudioContext / Oscillator を解放する。

video:

```ts
const createFakeVideoTrack = (...): { track: MediaStreamTrack; cleanup: () => void } => {
  let cleaned = false;
  let animationFrameId: number | undefined = undefined;

  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    videoTrack.removeEventListener("ended", onEnded);
    videoTrack.stop();
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    }
  };
  const onEnded = (): void => cleanup();
  videoTrack.addEventListener("ended", onEnded);

  const updateCanvas = (): void => {
    if (cleaned) return;
    // ... 既存の描画処理 ...
    animationFrameId = requestAnimationFrame(updateCanvas);
  };

  updateCanvas();

  return { track: videoTrack, cleanup };
};
```

audio (stereo / mono とも同型):

```ts
let cleaned = false;
const cleanup = (): void => {
  if (cleaned) return;
  cleaned = true;
  audioTrack.removeEventListener("ended", onEnded);
  audioTrack.stop();
  oscillator.stop(); // stereo は oscillatorLeft / oscillatorRight の両方
  void audioCtx.close().catch((error: unknown) => {
    // 既に closed の場合の InvalidStateError 以外は再 throw しないが console.error に残す
    if (error instanceof DOMException && error.name === "InvalidStateError") {
      return;
    }
    console.error("AudioContext.close() に失敗しました:", error);
  });
};
const onEnded = (): void => cleanup();
audioTrack.addEventListener("ended", onEnded);
return { track: audioTrack, cleanup };
```

- `cleaned` フラグにより 2 回目の `cleanup()` は no-op になる
- `updateCanvas()` 冒頭でも `cleaned` をチェックし、`cleanup()` 直後に RAF コールバックが発火しても再スケジュールされないようにする
- `track.stop()` を含めることで、ブラウザ内の track リソースも解放する
- `removeEventListener` により、cleanup 後のトラックオブジェクトの GC を助ける
- `audioCtx.close()` のエラーは `InvalidStateError` のみ無視し、それ以外は `console.error` に出力する
- 既存の `console.log("... because track ended.")` は削除する
- `fake.ts` 内の残りの英語 `console.log` / `console.warn` / `console.error` も日本語に変更する
  - `"Created stereo audio track:"` → 日本語のデバッグログに変更または削除
  - `"getFakeMedia called with no tracks requested."` → 日本語に変更

`getFakeMedia` は `{ stream, cleanup }` を返し、生成した全 track の cleanup を集約する。

```ts
export const getFakeMedia = (
  constraints: FakeMediaStreamConstraints,
): { stream: MediaStream; cleanup: () => void } => {
  const tracks: MediaStreamTrack[] = [];
  const cleanups: Array<() => void> = [];
  if (constraints.video) {
    const { track, cleanup } = createFakeVideoTrack(...);
    tracks.push(track);
    cleanups.push(cleanup);
  }
  if (constraints.audio) {
    const { track, cleanup } = createFakeAudioTrack(...);
    tracks.push(track);
    cleanups.push(cleanup);
  }
  if (tracks.length === 0) {
    console.warn("getFakeMedia: 要求されたトラックがありません。");
  }
  return {
    stream: new MediaStream(tracks),
    cleanup: () => {
      for (const fn of cleanups) fn();
    },
  };
};
```

`getFakeMedia` の JSDoc `@returns` 注釈も `{ stream, cleanup }` に更新する。

空 constraints は現状どおり `console.warn` + 空 stream を維持する (throw 化は別関心であり本 issue スコープ外。下記スコープ外参照)。

### 呼び出し側 (5 ファイル / 6 箇所)

各 fixture の `client` / `analyzer` を宣言している `DOMContentLoaded` コールバックスコープに cleanup 保持変数を `let` で追加し、`#connect` で代入、`#disconnect` の末尾で呼んで null 化する。`#connect` 冒頭でも既存 cleanup を呼んでから新しい stream を生成する。これは手動操作時の同一 page 再接続を防御するためである。現行の Playwright テストは各 test で新規 page を使用するため、同一 page 内での再接続は発生しない。

- analyzer を持つ fixture (`fake_stereo_audio` / `fake_stereo_audio_sendrecv`): `RealtimeAudioAnalyzer` は fake とは別の独立した AudioContext + RAF を生成するが、これは既存の `analyzer.stop()` で解放済み (本 issue のスコープ外)。fake 側 cleanup は `#disconnect` で `analyzer.stop()` を呼んだ後に実行すれば衝突しない
- analyzer を持たない fixture (`fake_sendonly` / `sendrecv_webkit` / `simulcast_sendonly_webkit`): `#disconnect` ハンドラ末尾 (ハンドラ内の最後の文として) に `if (fakeCleanup) { fakeCleanup(); fakeCleanup = null; }` を置く。fake cleanup は client の有無と独立させるため、`fake_sendonly` では `if (client) { ... }` ブロックの**外側** (ハンドラ末尾) に置くこと (`fakeCleanup` 自体が null ガード済みなので一度も connect していない場合も安全)
- `fake_sendonly` の `#connect` 冒頭は既に `if (client) await client.disconnect()` を持つ。その後・getFakeMedia の直前に `if (fakeCleanup) { fakeCleanup(); fakeCleanup = null; }` を置く

代表例 (`fake_stereo_audio/main.ts`):

```ts
// DOMContentLoaded スコープ (let sendClient ... の近く) に追加
let fakeCleanup: (() => void) | null = null;

// #connect 内
if (fakeCleanup) {
  fakeCleanup();
  fakeCleanup = null;
}
const { stream, cleanup } = getFakeMedia({
  audio: { frequency: 440, stereo: useStereo, volume: 0.1 },
});
fakeCleanup = cleanup;
// 以降は従来どおり stream を analyzer / connect に渡す

// #disconnect 末尾 (analyzer.stop / client.disconnect の後)
if (fakeCleanup) {
  fakeCleanup();
  fakeCleanup = null;
}
```

`fake_stereo_audio_sendrecv/main.ts` は 2 接続分あるため、`fakeCleanup1` / `fakeCleanup2` を個別に宣言する。`#connect` 内では stream1 生成直前に `fakeCleanup1` を、stream2 生成直前に `fakeCleanup2` を呼ぶ。`#disconnect` 末尾では両方を呼ぶ。

```ts
let fakeCleanup1: (() => void) | null = null;
let fakeCleanup2: (() => void) | null = null;

// #connect 内 (stream1 生成直前)
if (fakeCleanup1) {
  fakeCleanup1();
  fakeCleanup1 = null;
}
const { stream: stream1, cleanup: cleanup1 } = getFakeMedia({
  audio: { frequency: 440, stereo: useStereo1, volume: 0.1 },
});
fakeCleanup1 = cleanup1;

// ...

// #connect 内 (stream2 生成直前)
if (fakeCleanup2) {
  fakeCleanup2();
  fakeCleanup2 = null;
}
const { stream: stream2, cleanup: cleanup2 } = getFakeMedia({
  audio: { frequency: 880, stereo: useStereo2, volume: 0.1 },
});
fakeCleanup2 = cleanup2;

// #disconnect 末尾
if (fakeCleanup1) {
  fakeCleanup1();
  fakeCleanup1 = null;
}
if (fakeCleanup2) {
  fakeCleanup2();
  fakeCleanup2 = null;
}
```

`sendrecv_webkit/main.ts` / `simulcast_sendonly_webkit/main.ts` / `fake_sendonly/main.ts` も同じパターンで、`#connect` 冒頭 (既存 client 切断があればその後) と `#disconnect` 末尾に cleanup 呼び出しを追加する。

`#connect` 内で `client.connect(stream)` が例外を投げた場合、fake stream は解放されない。リソースリークを防ぐため、`client.connect(stream)` は try/finally で囲み、finally 内で `fakeCleanup()` を呼ぶ。または、catch 内で `fakeCleanup()` を呼んだ上でエラーを再 throw する。

```ts
// sendrecv_webkit/main.ts の例
document.querySelector("#connect")?.addEventListener("click", async () => {
  const channelId = getChannelId(channelIdPrefix, channelIdSuffix);
  const videoCodecType = getVideoCodecType();

  if (fakeCleanup) {
    fakeCleanup();
    fakeCleanup = null;
  }
  if (client) {
    await client.disconnect();
  }

  client = new SoraClient(signalingUrl, channelId, secretKey, videoCodecType);

  const { stream, cleanup } = getFakeMedia({
    audio: true,
    video: true,
  });
  fakeCleanup = cleanup;

  try {
    await client.connect(stream);
  } catch (error) {
    if (fakeCleanup) {
      fakeCleanup();
      fakeCleanup = null;
    }
    throw error;
  }
});
```

```ts
// simulcast_sendonly_webkit/main.ts の例
document.querySelector("#connect")?.addEventListener("click", async () => {
  // ... 既存のオプション取得 ...

  if (fakeCleanup) {
    fakeCleanup();
    fakeCleanup = null;
  }
  if (sendonly) {
    await sendonly.disconnect();
  }

  sendonly = new SimulcastSendonlySoraClient(...);

  const { stream, cleanup } = getFakeMedia({
    audio: false,
    video: { height: 540, width: 960 },
  });
  fakeCleanup = cleanup;

  try {
    await sendonly.connect(stream);
  } catch (error) {
    if (fakeCleanup) {
      fakeCleanup();
      fakeCleanup = null;
    }
    throw error;
  }
});
```

`#disconnect` 内では `client.disconnect()` が例外を投げても `fakeCleanup` が実行されるよう、`client.disconnect()` の後に `fakeCleanup()` を呼ぶ。`client.disconnect()` 自体の例外処理は既存コードのままとし、本 issue ではその後の `fakeCleanup()` 呼び出しを追加する。

ファイル別の保持変数:

| ファイル                             | 保持変数                        |
| ------------------------------------ | ------------------------------- |
| `fake_stereo_audio/main.ts`          | `fakeCleanup` 1 本              |
| `fake_stereo_audio_sendrecv/main.ts` | `fakeCleanup1` / `fakeCleanup2` |
| `fake_sendonly/main.ts`              | `fakeCleanup` 1 本              |
| `sendrecv_webkit/main.ts`            | `fakeCleanup` 1 本              |
| `simulcast_sendonly_webkit/main.ts`  | `fakeCleanup` 1 本              |

## 完了条件

### コード変更

- [ ] `e2e-tests/src/fake.ts` の `createFakeVideoTrack` / `createFakeAudioTrack` を `{ track, cleanup }` 返却に変更し、`cleanup` を `cleaned` フラグでガードする
- [ ] `createFakeVideoTrack` の `animationFrameId` を `number | undefined` にし、`updateCanvas()` 冒頭で `cleaned` をチェックする
- [ ] `cleanup` 内で `track.stop()` を呼び、`ended` リスナーを除去する
- [ ] `audioCtx.close()` に `.catch` を付け、`InvalidStateError` 以外は `console.error` に出力する
- [ ] `ended` ハンドラから同じ `cleanup` を呼ぶよう共通化する。既存の `console.log("... because track ended.")` は削除する
- [ ] `fake.ts` 内の残りの英語 `console.log` / `console.warn` / `console.error` を日本語に変更する
- [ ] `getFakeMedia` を `{ stream, cleanup }` 返却に変更し全 track の cleanup を集約する
- [ ] `getFakeMedia` の JSDoc `@returns` 注釈を更新する
- [ ] 呼び出し元 5 ファイル / 6 箇所を上表のとおり cleanup 保持変数 + `#connect` 代入 + `#disconnect` 呼び出しに更新する
- [ ] `#connect` 内で `client.connect(stream)` が失敗した場合も `fakeCleanup()` を呼ぶ (try/catch または try/finally)
- [ ] `e2e-tests/tsconfig.json` に `skipLibCheck: true` を追加し、`pnpm --dir e2e-tests run check` が通るようにする (e2e コードの型検証を有効化するため)

### 検証

- [ ] `pnpm run fmt` が通る (e2e-tests も対象)
- [ ] `pnpm run build` で `dist/` が生成された状態で `pnpm --dir e2e-tests run check` が通る (`e2e-tests/tsconfig.json` の `skipLibCheck: true` 追加後)
- [ ] `pnpm test` が通る (SDK 単体テストに影響なし)
- [ ] ローカル: 以下の Playwright テストが通る (回帰なし)
  - `e2e-tests/tests/stereo_audio.test.ts`
  - `e2e-tests/tests/stereo_audio_sendrecv.test.ts`
  - `e2e-tests/tests/webkit.test.ts`
- [ ] CI: 以下 workflow が green であること
  - `e2e-test.yml`
  - `e2e-test-webkit.yml`
- [ ] `fake_sendonly/main.ts` は自動テスト対象外のため手動確認: DevTools の Sources で `fake_sendonly/main.ts` の `#disconnect` ハンドラ末尾の `fakeCleanup()` に breakpoint を仕掛け、connect → disconnect を 1 回以上行い、breakpoint がヒットすることを確認する
- [ ] リーク解消の手動確認 (best-effort): fake.ts の AudioContext 生成・close 箇所に一時的な計数ログを仕込み、`fake_stereo_audio` を DevTools で開いて同一 page で connect → disconnect を 10 回以上繰り返し、fake 由来の AudioContext の生成数と close 数が一致することを確認する。RAF は計数する標準 API が無いため `cleaned` フラグと `cancelAnimationFrame` 呼び出しのコードレビューで担保する
- [ ] idempotent の確認: `cleanup()` を 2 回呼んでも例外が出ないこと (`cleaned` フラグと `.catch` による。コードレビューで担保)

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` の末尾 (種別順 CHANGE → ADD → UPDATE → FIX を守る) に追記する (e2e-tests 内部限定の変更で SDK 利用者への影響はないため `[FIX]`)

  ```
  - [FIX] e2e-tests の fake media 生成に明示的 cleanup() を追加し connect/disconnect 繰り返し時の RAF / AudioContext リークを防ぐ
    - @voluntas
  ```

## スコープ外

- SDK 本体 (`src/`) の変更
- `getFakeMedia({})` を throw に変える入力検証 (資源 cleanup と別関心。`fake_sendonly` は audio / video をチェックボックスで動的に決めるため、両 false で throw すると挙動が変わる。別 issue で扱う)
- stereo ネゴ検証 (issue 0029)
- `MediaStreamTrack.stop()` 仕様変更の議論

## マージ順

**0029 の前を必須。** 0029 は `fake_stereo_audio` 系 fixture の `getFakeMedia` 呼び出しと `#disconnect` ハンドラを変更するが、それらは本 issue で `getFakeMedia` の戻り値を `{ stream, cleanup }` に変更した後でないとコンパイルできない。0028 を先にマージし、0029 は 0028 マージ後に rebase してから作業を進める。

## 解決方法

### fake.ts

- `createFakeVideoTrack` / `createFakeAudioTrack` の戻り値を `MediaStreamTrack` から `{ track: MediaStreamTrack; cleanup: () => void }` に変更した。`cleanup` は `cleaned` フラグで idempotent にガードし、`videoTrack.removeEventListener("ended", onEnded)` → `videoTrack.stop()` → `cancelAnimationFrame(animationFrameId)` の順で解放する。`updateCanvas()` 冒頭でも `cleaned` をチェックし、`cleanup()` 直後にキューされた RAF コールバックが再スケジュールされないようにした。
- `createFakeAudioTrack` の stereo / mono 双方で `cleanup` 内に `audioTrack.stop()` / `oscillator.stop()` / `audioCtx.close().catch(handleAudioContextCloseError)` を含めた。`handleAudioContextCloseError` は `InvalidStateError` のみ無視し、それ以外は `console.error` で可視化する共通ヘルパとして抽出した。
- `getFakeMedia` の戻り値を `MediaStream` から `{ stream: MediaStream; cleanup: () => void }` に変更し、JSDoc の `@returns` にも `cleanup` の責務 (idempotent、disconnect 時に必ず呼ぶ) を明記した。生成した全 track の cleanup を内部で集約する。
- 既存の `console.log("... because track ended.")` 系のデバッグログを削除し、残りの英語 `console.warn` / `console.error` を日本語化した。

### 呼び出し元 5 ファイル

- `e2e-tests/fake_stereo_audio/main.ts` / `e2e-tests/fake_stereo_audio_sendrecv/main.ts` / `e2e-tests/fake_sendonly/main.ts` / `e2e-tests/sendrecv_webkit/main.ts` / `e2e-tests/simulcast_sendonly_webkit/main.ts` の 5 ファイルに `let fakeCleanup: (() => void) | null = null;` (sendrecv は 2 本) を追加し、`#connect` の `getFakeMedia` 直前で既存 cleanup を解放、`getFakeMedia` の `cleanup` を保持、`#disconnect` 末尾で解放する構造に統一した。
- `#connect` で `client.connect(stream)` (sendrecv は接続 1 / 接続 2) を try/catch で囲み、connect 失敗時にも `fakeCleanup` を解放して再 throw する。
- `#disconnect` ハンドラは try/finally で囲み、`client.disconnect` (analyzer の `stop()` を含む) が throw しても finally で `fakeCleanup` が必ず解放されるようにした。`fake_sendonly/main.ts` の `#connect` 冒頭の `if (client) await client.disconnect()` も try/finally で囲んで対称性を取った。

### tsconfig.json

- `e2e-tests/tsconfig.json` に `skipLibCheck: true` を追加して `pnpm --dir e2e-tests run check` が通るようにした。

### 検証

- `pnpm run fmt` / `pnpm run lint` / `pnpm run typecheck` / `pnpm test` / `pnpm run build` / `pnpm --dir e2e-tests run check` がすべて通ることを確認した。
- `/review-diff-code` を 2 周回し、致命的・重要な指摘 (`ignoreAudioContextCloseError` から `handleAudioContextCloseError` への rename 漏れコメント修正、`fake_stereo_audio_sendrecv/main.ts` の disconnect で analyzer 系を try ブロックに入れる修正、`fake_sendonly/main.ts` の #connect 冒頭を try/finally で囲む修正、コメント表現の小修正) を反映した。
- ローカル Playwright (signaling URL が必要) と CI workflow `e2e-test.yml` / `e2e-test-webkit.yml` の green 確認は CI に委ねる。
- リーク解消の手動確認 / `fake_sendonly` の手動確認は本コミットでは未実施。issue 完了条件には残しており、後続でフォローアップ可能。
