# `e2e-tests/src/fake.ts` の RAF / AudioContext が `track.stop()` で cleanup されない

- Priority: Medium
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-fake-track-cleanup

## 必要性

**必要。** `createFakeVideoTrack` / `createFakeAudioTrack` は `ended` イベントでのみ RAF / AudioContext を cleanup するが、W3C Media Capture and Streams 仕様では `MediaStreamTrack.stop()` は `ended` イベントを dispatch しない。`track.stop()` だけでは cleanup ハンドラが走らず、同一 page 内で connect / disconnect を繰り返すと RAF / AudioContext が蓄積しうる。

## 目的

`getFakeMedia` の戻り値に明示的 `cleanup()` を追加し、disconnect 後または page teardown 前に呼び出してリソースを解放する。

## 優先度根拠

Medium。現行 E2E は `browser.newPage()` → `page.close()` でページごと破棄するケースが多く、CI では再現しにくい。同一 page 内で connect / disconnect を繰り返すテストや将来の long-running E2E では顕在化しうる。0027 完了後に fake 枯渇由来 fail が増えた場合は High に引き上げる。

## 現状

`e2e-tests/src/fake.ts`:

- `:128-131` — video: `ended` ハンドラのみで `cancelAnimationFrame`
- `:197-204` — stereo audio: `ended` ハンドラのみで oscillator stop + `audioCtx.close()`
- `:231-237` — mono audio: 同上
- `:298-301` — `getFakeMedia({})` は `console.warn` のみ (空 MediaStream を返す)

`getFakeMedia` 呼び出し元 (着手時 grep):

| ファイル                                       | 用途                    |
| ---------------------------------------------- | ----------------------- |
| `e2e-tests/fake_stereo_audio/main.ts`          | stereo / mono audio E2E |
| `e2e-tests/fake_stereo_audio_sendrecv/main.ts` | sendrecv stereo E2E     |
| `e2e-tests/fake_sendonly/main.ts`              | sendonly E2E            |
| `e2e-tests/sendrecv_webkit/main.ts`            | WebKit sendrecv E2E     |
| `e2e-tests/simulcast_sendonly_webkit/main.ts`  | simulcast WebKit E2E    |

`createFakeVideoTrack` / `createFakeAudioTrack` は export されていない (内部関数)。公開 API 変更は `getFakeMedia` の戻り値型のみ。

## 再現手順 (限定的)

1. Playwright または DevTools で `fake_stereo_audio` 等を開き、**同一 `page` 内**で `#connect` → `#disconnect` を 10 回以上繰り返す (`page.close()` しない)
2. 各 disconnect 後に Memory プロファイラで `AudioContext` / `OscillatorNode` が残ることを確認する
3. 現行 `stereo_audio.test.ts` はテスト末尾で `page.close()` するため CI では再現しにくい

## 設計方針

### fake.ts

- `createFakeVideoTrack` / `createFakeAudioTrack` は内部で cleanup 関数を生成し、戻り値を `{ track, cleanup }` に変更する
- `getFakeMedia` は `{ stream, cleanup }` を返し、生成した全 track の cleanup を順に呼ぶ
- `cleanup()` は idempotent (2 回呼んでも安全)
- `getFakeMedia({})` (video / audio 両方 false / 未指定) は `throw new Error("getFakeMedia called with no tracks requested.")` に変更する
- 既存 `ended` ハンドラは残してよい (ended 経路でも cleanup されるように cleanup 本体を共通化)

```ts
export const getFakeMedia = (
  constraints: FakeMediaStreamConstraints,
): { stream: MediaStream; cleanup: () => void } => {
  const cleanups: Array<() => void> = [];
  // track 生成時に cleanups に push
  if (tracks.length === 0) {
    throw new Error("getFakeMedia called with no tracks requested.");
  }
  return {
    stream: new MediaStream(tracks),
    cleanup: () => {
      for (const fn of cleanups) fn();
    },
  };
};
```

### 呼び出し側 (5 ファイル)

```ts
const { stream, cleanup } = getFakeMedia({ audio: { stereo: true } });
// ...
await sendClient.disconnect();
cleanup(); // disconnect 後、または connect 前の古い stream 破棄時
```

各 fixture の `#disconnect` ハンドラ内、または connect 前の stream 差し替え時に `cleanup()` を呼ぶ。video track を使う fixture も同様。

## 完了条件

### コード変更

- [ ] `e2e-tests/src/fake.ts` に上記 API を実装する
- [ ] 呼び出し元 5 ファイルを `{ stream, cleanup }` 分解に更新し、disconnect 後 (または stream 差し替え前) に `cleanup()` を呼ぶ
- [ ] `getFakeMedia({})` が throw する (空 constraints を渡している呼び出しが無いことを grep で確認)

### 検証

- [ ] `pnpm test` が通る
- [ ] `pnpm run lint` / `pnpm run typecheck` が通る (e2e-tests TS 変更)
- [ ] ローカル: `pnpm exec playwright test --project="Chromium" e2e-tests/tests/stereo_audio.test.ts` が通る
- [ ] CI: e2e-test workflow が green であること

### 変更履歴

- [ ] `CHANGES.md` `## develop` の `### misc` に追記する

  ```
  - [FIX] e2e-tests の fake media 生成で track.stop() 後も RAF / AudioContext が残らないよう cleanup() を追加する
    - @voluntas
  ```

## スコープ外

- SDK 本体 (`src/`) の変更
- stereo ネゴ検証 (issue 0029)
- Playwright retries / flaky 検出 (issue 0027)
- `MediaStreamTrack.stop()` 仕様変更の議論

## マージ順

**0027 とは独立。** 0027 → 0028 → 0029 を推奨する (0027 で flaky が surface 化してから cleanup 修正の方が regression 検知しやすい)。0028 単体でもマージ可能。
