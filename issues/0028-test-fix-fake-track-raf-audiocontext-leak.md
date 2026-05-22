# `e2e-tests/src/fake.ts` の RAF / AudioContext が `track.stop()` で cleanup されない

- Priority: High
- Created: 2026-05-21
- Model: Opus 4.7
- Branch: feature/fix-fake-track-cleanup

## 目的

`e2e-tests/src/fake.ts` の `createFakeVideoTrack` (`:34-134`) と `createFakeAudioTrack` (`:136-237` 周辺) は、`videoTrack.addEventListener("ended", ...)` (`:128-131`)・`audioTrack.addEventListener("ended", ...)` (`:197-202, :231-236`) で `cancelAnimationFrame` / `audioCtx.close()` を呼ぶ仕組みになっている。しかし W3C MediaStream Capture 仕様 §4.4.1 では `MediaStreamTrack.stop()` は `ended` イベントを発火しない (`ended` はデバイス切断などの外的要因でのみ発火する)。E2E テスト内で `track.stop()` を明示的に呼んでも `ended` ハンドラが走らず、`requestAnimationFrame` ループと `AudioContext` が残ったまま次のテストに移る。Chromium の `AudioContext` 同時生成数上限 (実装依存だが概ね 6-12 程度) に到達すると、フェイク音源が無音化し stereo audio E2E などが SDK のバグではなく fake 側の枯渇で誤陽性 fail する。

`getFakeMedia` の戻り値に明示の `cleanup()` 関数を生やし、各テストの `afterEach` で必ず呼ぶ形に変える。

## 優先度根拠

High。E2E テスト結果がフェイクメディアの枯渇で偽陽性 fail する → issue 0027 の `retries: 3` で隠蔽される → リリース判定の信頼性が失われる、という連鎖の起点。0027 で retries を下げる修正と並行して本 issue を進めないと、本 issue の修正前は SDK のバグでないテスト failure が頻発する可能性がある。

## 現状

`e2e-tests/src/fake.ts:128-131`

```ts
videoTrack.addEventListener("ended", () => {
  cancelAnimationFrame(animationFrameId);
  console.log("Animation stopped because track ended.");
});
```

`createFakeAudioTrack` 内 (`:197-202` および `:231-236`) も同様に `ended` ハンドラで `audioCtx.close()` を呼ぶ実装になっている。

W3C MediaStream Capture §4.4.1.2 `stop()` algorithm: `track.stop()` は `[[ReadyState]]` を `"ended"` に遷移させるが `ended` event は dispatch しない。`ended` event は §4.4.4.4 で「ソース側からの停止 (デバイス切断、外的終了)」でのみ発火と規定されている。E2E テストから明示的に `track.stop()` を呼んでも上記 cleanup ハンドラは走らない。

`getFakeMedia` (`e2e-tests/src/fake.ts:265-305`) は単に `MediaStream` を返すのみで、cleanup の手立てを呼び出し側に渡していない。`e2e-tests/tests/` 配下のテストファイル (`stereo_audio.test.ts`、`stereo_audio_sendrecv.test.ts`、`sendrecv.test.ts` 等) は `getFakeMedia(...)` を main.ts 経由で間接呼び出ししているが、`afterEach` で明示的に cleanup を行っていない。

`getFakeMedia({})` (constraints に何も指定なし) の経路 (`:298-301`) は `console.warn` を出して空 MediaStream を返す。テスト誤用を見逃す経路で、本 issue でついでに throw に変える。

## 完了条件

- `createFakeVideoTrack` (`e2e-tests/src/fake.ts:34-134`) の戻り値型を `{ track: MediaStreamTrack; cleanup: () => void }` に変更する。`cleanup()` 内で `cancelAnimationFrame(animationFrameId)` と `videoTrack.stop()` を呼ぶ。`addEventListener("ended", ...)` は残しておく (外的 ended ケースの保険)
- `createFakeAudioTrack` (`e2e-tests/src/fake.ts:136-237` 周辺) も同じ形に変更する。`cleanup()` 内で `await audioCtx.close()` (および必要なら `track.stop()`) を呼ぶ
- `getFakeMedia` (`e2e-tests/src/fake.ts:265-305`) の戻り値型を `{ stream: MediaStream; cleanup: () => Promise<void> }` に変更する。`cleanup()` で video / audio それぞれの cleanup を逐次呼ぶ (`Promise.all` でも可)
- `getFakeMedia({})` (`:298-301`) の警告経路を `throw new Error("getFakeMedia called with no tracks requested")` に変更する
- 上記変更に伴い、`e2e-tests/tests/` 配下で `getFakeMedia` を間接利用する全テストファイルで `afterEach` を追加して `cleanup()` を呼ぶ。`grep -rln "getFakeMedia" e2e-tests/` で該当ファイルを網羅的に確認する。テスト本体ではなく `e2e-tests/data_channel_signaling_only/main.ts` 等の example ページ内で `getFakeMedia` を呼んでいる場合は、example 側に `cleanup` を `window` 経由で露出して Playwright から呼べるようにする
- CHANGES.md `## develop` の `### misc` セクションに次のエントリを追記する

  ```
  ### misc

  - [FIX] e2e-tests の fake track が track.stop() で cleanup されず RAF / AudioContext が残っていたのを明示 cleanup() で解放するようにする
    - @voluntas
  ```

- 本 issue は issue 0027 (`retries` 削減と flaky 検出) と並行して進める。0027 が先にマージされると本 issue 修正前は fake 枯渇による誤陽性 fail が顕在化する。0028 が先にマージされても 0027 の retry 削減効果が出るまで隠蔽は続く。両 issue を同時期にマージするのが望ましい
- `e2e-tests/src/fake.ts` の Public API シグネチャが変わるため、`e2e-tests/src/` を import する全箇所の追従が必要。型エラーが出るので `vp check` で検出する

## 解決方法

`e2e-tests/src/fake.ts:34-134` (`createFakeVideoTrack`) を次の通り書き換える。

```ts
const createFakeVideoTrack = (
  width = 320,
  height = 240,
  fps = 30,
): { track: MediaStreamTrack; cleanup: () => void } => {
  // (canvas / ctx 取得、updateCanvas 関数定義、最初のフレーム描画、stream 取得は既存)
  const [videoTrack] = stream.getVideoTracks();
  const cleanup = (): void => {
    cancelAnimationFrame(animationFrameId);
    videoTrack.stop();
  };
  // 外的 ended イベント (デバイス切断等) の保険として addEventListener も残す
  videoTrack.addEventListener("ended", () => {
    cancelAnimationFrame(animationFrameId);
  });
  return { track: videoTrack, cleanup };
};
```

`createFakeAudioTrack` (`:136-237` 周辺) も同じパターンで `{ track, cleanup }` を返す。`cleanup` 内で `audioCtx.close()` を `void` ハンドラから呼び出す (`await` は型上 sync な cleanup で扱えないため `audioCtx.close().catch(() => {})` で発火だけする、もしくは `cleanup` を `() => Promise<void>` にする。本 issue では非同期版に統一する)。

```ts
const createFakeAudioTrack = (
  frequency = 440,
  volume = 0.1,
  stereo = false,
): { track: MediaStreamTrack; cleanup: () => Promise<void> } => {
  // (audioCtx 作成、oscillator / gain 接続、destination から track 取得は既存)
  const cleanup = async (): Promise<void> => {
    audioTrack.stop();
    await audioCtx.close();
  };
  audioTrack.addEventListener("ended", () => {
    void audioCtx.close();
  });
  return { track: audioTrack, cleanup };
};
```

`getFakeMedia` (`:265-305`) を次の通り書き換える。

```ts
export const getFakeMedia = (
  constraints: FakeMediaStreamConstraints,
): { stream: MediaStream; cleanup: () => Promise<void> } => {
  const tracks: MediaStreamTrack[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];

  if (constraints.video) {
    let videoOptions = { frameRate: 30, height: 240, width: 320 };
    if (typeof constraints.video === "object") {
      videoOptions = { ...videoOptions, ...constraints.video };
    }
    const { track, cleanup } = createFakeVideoTrack(
      videoOptions.width,
      videoOptions.height,
      videoOptions.frameRate,
    );
    tracks.push(track);
    cleanups.push(cleanup);
  }

  if (constraints.audio) {
    let audioOptions = { frequency: 440, stereo: false, volume: 0.1 };
    if (typeof constraints.audio === "object") {
      audioOptions = { ...audioOptions, ...constraints.audio };
    }
    const { track, cleanup } = createFakeAudioTrack(
      audioOptions.frequency,
      audioOptions.volume,
      audioOptions.stereo,
    );
    tracks.push(track);
    cleanups.push(cleanup);
  }

  if (tracks.length === 0) {
    throw new Error("getFakeMedia called with no tracks requested");
  }

  return {
    stream: new MediaStream(tracks),
    cleanup: async () => {
      for (const c of cleanups) {
        await c();
      }
    },
  };
};
```

`e2e-tests/` 配下の `getFakeMedia` 呼び出し側 (example page main.ts / テストファイル) でも戻り値型の変更に追従する。main.ts 内では `cleanup` を `window` 経由で露出する (例: `(window as any).fakeMediaCleanup = cleanup`) ことで Playwright のテストから `await page.evaluate(() => (window as any).fakeMediaCleanup())` で呼べるようにする。各テストの `afterEach` で必ず cleanup を呼ぶ。
