# `e2e-tests/src/fake.ts` の RAF / AudioContext が `track.stop()` で cleanup されず後続テストに残る

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-fake-track-cleanup

## 目的

`createFakeVideoTrack` / `createFakeAudioTrack` は `videoTrack.addEventListener("ended", ...)` で `cancelAnimationFrame` / `audioCtx.close()` を呼んでいるが、`MediaStreamTrack.stop()` は仕様上 `ended` イベントを発火しないため cleanup されない。RAF / AudioContext が止まらず後続テストに残り、Chromium の AudioContext 数上限に到達してフェイク音源が無音化する。SDK のバグではないのに stereo audio E2E が落ちる誤陽性の温床。

## 優先度根拠

High。リリース判定の根拠（E2E 結果）が壊れる。issue 0027 の retries=3 で隠蔽されており、症状を覆い隠している。

## 現状

`e2e-tests/src/fake.ts:54-131` 周辺

```ts
let animationFrameId: number;
...
const updateCanvas = (): void => {
  ...
  animationFrameId = requestAnimationFrame(updateCanvas);
};
updateCanvas();
const stream = canvas.captureStream(fps);
const [videoTrack] = stream.getVideoTracks();
videoTrack.addEventListener("ended", () => {
  cancelAnimationFrame(animationFrameId);
});
```

仕様: `track.stop()` は `ended` を発火しない。`ended` は外的要因（デバイス切断等）でのみ発火。Playwright の `page.close()` 前に明示停止しない経路では RAF が積み上がる。

`createFakeAudioTrack` 側も同じ問題で、`new AudioContext()` が `audioCtx.close()` されない。

## 設計方針

`getFakeMedia` の戻り値に明示 `cleanup()` を生やし、各テストの `afterEach` で `cleanup()` を呼ぶ。または `MediaStream` 側に `stop()` をモンキーパッチして RAF / `audioCtx.close()` を連動させる。

## 完了条件

- 各テスト終了時に RAF と AudioContext が確実に解放される
- 連続実行で AudioContext 数上限に到達しない
- stereo audio E2E が安定する

## 解決方法

```ts
export function getFakeMedia(options: GetFakeMediaOptions): {
  stream: MediaStream;
  cleanup: () => void;
} {
  const tracks: MediaStreamTrack[] = [];
  const cleanups: Array<() => void> = [];
  if (options.video) {
    const { track, cleanup } = createFakeVideoTrack(...);
    tracks.push(track);
    cleanups.push(cleanup);
  }
  if (options.audio) {
    const { track, cleanup } = createFakeAudioTrack(...);
    tracks.push(track);
    cleanups.push(cleanup);
  }
  return {
    stream: new MediaStream(tracks),
    cleanup: () => cleanups.forEach((c) => c()),
  };
}
```

`createFakeVideoTrack` / `createFakeAudioTrack` も `{ track, cleanup }` を返すように変更。`cleanup()` で `cancelAnimationFrame` / `audioCtx.close()` / `track.stop()` を実行する。各テストの `afterEach` で `cleanup()` を必ず呼ぶ。

`getFakeMedia({})` が警告だけで空 MediaStream を返す経路（`fake.ts:299-304`）も throw に変更する（テスト誤用検知）。
