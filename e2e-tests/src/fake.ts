// --- 定数の定義 ---
const MIN_FPS = 1;
const MAX_FPS = 60;
const BASE_WIDTH = 640; // 基準解像度（幅）
const BASE_HEIGHT = 480; // 基準解像度（高さ）
const BASE_INFO_FONT_SIZE = 28;
const BASE_MAIN_FONT_SIZE = 100;
const BASE_LINE_WIDTH = 3;
const BASE_SHADOW_BLUR = 10;
const BASE_SHADOW_OFFSET = 5;
// --- 定数の定義ここまで ---

// 解像度に基づいて値をスケーリングする関数
const scaleValue = (baseValue: number, currentWidth: number, currentHeight: number): number => {
  const ratio = Math.min(currentWidth / BASE_WIDTH, currentHeight / BASE_HEIGHT);
  return Math.max(1, Math.floor(baseValue * ratio)); // 最小値1を保証
};

// 背景色とそれに対するコントラスト色を生成する関数
const generateColors = (): { bgColor: string; contrastColor: string } => {
  // 中程度の明るさの背景色を生成 (0.3 - 0.7 の範囲)
  const r = Math.floor(Math.random() * 256 * 0.4 + 0.3 * 256);
  const g = Math.floor(Math.random() * 256 * 0.4 + 0.3 * 256);
  const b = Math.floor(Math.random() * 256 * 0.4 + 0.3 * 256);
  const bgColor = `rgb(${r}, ${g}, ${b})`;

  // 輝度を計算 (YIQ方式)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const contrastColor = brightness > 128 ? "#000000" : "#ffffff"; // 輝度に基づいて黒か白を選択

  return { bgColor, contrastColor };
};

// AudioContext.close() の Promise rejection を処理する。
// 既に closed の場合は InvalidStateError が投げられるため、ここだけ無視して
// それ以外は console.error に出すことで cleanup の異常を可視化する。
const handleAudioContextCloseError = (error: unknown): void => {
  if (error instanceof DOMException && error.name === "InvalidStateError") {
    return;
  }
  console.error("AudioContext.close() の実行に失敗しました:", error);
};

export type StereoAudioMode = "both" | "left" | "right";

type StereoAudioPattern = "constant" | "both-left-right";

export interface StereoAudioModeGains {
  left: number;
  right: number;
}

export const STEREO_AUDIO_MODE_DURATION_SECONDS = 5;

const STEREO_AUDIO_MODE_SEQUENCE: readonly StereoAudioMode[] = ["both", "left", "right"];
const STEREO_AUDIO_MODE_FADE_SECONDS = 0.02;
const STEREO_AUDIO_PATTERN_SCHEDULER_LEAD_SECONDS = 0.1;

export const getStereoAudioMode = (elapsedSeconds: number): StereoAudioMode => {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new RangeError("elapsedSeconds must be a finite non-negative number");
  }

  const modeIndex =
    Math.floor(elapsedSeconds / STEREO_AUDIO_MODE_DURATION_SECONDS) %
    STEREO_AUDIO_MODE_SEQUENCE.length;
  const mode = STEREO_AUDIO_MODE_SEQUENCE[modeIndex];
  if (mode === undefined) {
    throw new Error("Stereo audio mode sequence is empty");
  }
  return mode;
};

export const getStereoAudioModeGains = (
  mode: StereoAudioMode,
  volume: number,
): StereoAudioModeGains => {
  switch (mode) {
    case "both":
      return { left: volume, right: volume };
    case "left":
      return { left: volume, right: 0 };
    case "right":
      return { left: 0, right: volume };
    default:
      throw new Error("Unsupported stereo audio mode");
  }
};

const startStereoAudioPattern = (
  audioContext: AudioContext,
  gainLeft: GainNode,
  gainRight: GainNode,
  volume: number,
): { stop: () => void } => {
  const patternStartTime = audioContext.currentTime + STEREO_AUDIO_PATTERN_SCHEDULER_LEAD_SECONDS;
  let nextTransitionIndex = 1;
  let timeoutId: number | undefined;
  let stopped = false;

  const initialGains = getStereoAudioModeGains(getStereoAudioMode(0), volume);
  gainLeft.gain.setValueAtTime(initialGains.left, audioContext.currentTime);
  gainLeft.gain.setValueAtTime(initialGains.left, patternStartTime);
  gainRight.gain.setValueAtTime(initialGains.right, audioContext.currentTime);
  gainRight.gain.setValueAtTime(initialGains.right, patternStartTime);

  const scheduleNextTransition = (): void => {
    if (stopped) {
      return;
    }

    const transitionTime =
      patternStartTime + nextTransitionIndex * STEREO_AUDIO_MODE_DURATION_SECONDS;
    const delayMilliseconds = Math.max(
      0,
      (transitionTime - audioContext.currentTime - STEREO_AUDIO_PATTERN_SCHEDULER_LEAD_SECONDS) *
        1000,
    );

    timeoutId = window.setTimeout(() => {
      timeoutId = undefined;
      if (stopped) {
        return;
      }

      const previousMode = getStereoAudioMode(
        (nextTransitionIndex - 1) * STEREO_AUDIO_MODE_DURATION_SECONDS,
      );
      const nextMode = getStereoAudioMode(nextTransitionIndex * STEREO_AUDIO_MODE_DURATION_SECONDS);
      const previousGains = getStereoAudioModeGains(previousMode, volume);
      const nextGains = getStereoAudioModeGains(nextMode, volume);
      const transitionStartTime = Math.max(
        audioContext.currentTime + 0.005,
        transitionTime - STEREO_AUDIO_MODE_FADE_SECONDS / 2,
      );
      const transitionEndTime = Math.max(
        transitionStartTime,
        transitionTime + STEREO_AUDIO_MODE_FADE_SECONDS / 2,
      );

      gainLeft.gain.cancelScheduledValues(transitionStartTime);
      gainLeft.gain.setValueAtTime(previousGains.left, transitionStartTime);
      gainLeft.gain.linearRampToValueAtTime(nextGains.left, transitionEndTime);
      gainRight.gain.cancelScheduledValues(transitionStartTime);
      gainRight.gain.setValueAtTime(previousGains.right, transitionStartTime);
      gainRight.gain.linearRampToValueAtTime(nextGains.right, transitionEndTime);

      nextTransitionIndex += 1;
      scheduleNextTransition();
    }, delayMilliseconds);
  };

  scheduleNextTransition();

  return {
    stop: (): void => {
      stopped = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      const stopTime = audioContext.currentTime;
      gainLeft.gain.cancelScheduledValues(stopTime);
      gainRight.gain.cancelScheduledValues(stopTime);
    },
  };
};

const createFakeVideoTrack = (
  width = 320, // デフォルト幅 320px
  height = 240, // デフォルト高さ 240px
  frameRate = 30, // デフォルトフレームレート 30fps
): { track: MediaStreamTrack; cleanup: () => void } => {
  // フレームレートを制限
  const fps = Math.max(MIN_FPS, Math.min(MAX_FPS, frameRate));

  // キャンバス要素を作成
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  // キャンバスのコンテキストを取得
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // 開始時間とフレームカウンター
  const startTime = Date.now();
  let frameCount = 0;
  // cleanup 済みのとき RAF のキャンセル対象が無いケースを表せるよう undefined を初期値にする。
  let animationFrameId: number | undefined;
  // cleanup が 2 回以上呼ばれても no-op にするためのガード。
  let cleaned = false;

  // 色を決定
  const { bgColor, contrastColor } = generateColors();

  // 解像度に応じたサイズを計算
  const infoFontSize = scaleValue(BASE_INFO_FONT_SIZE, width, height);
  const mainFontSize = scaleValue(BASE_MAIN_FONT_SIZE, width, height);
  const lineWidth = scaleValue(BASE_LINE_WIDTH, width, height);
  const shadowBlur = scaleValue(BASE_SHADOW_BLUR, width, height);
  const shadowOffset = scaleValue(BASE_SHADOW_OFFSET, width, height);

  // キャンバスを更新する関数 (requestAnimationFrameを使用)
  const updateCanvas = (): void => {
    // cleanup() 直後に RAF コールバックがすでにキューされている場合があるため、
    // 冒頭でフラグをチェックして再スケジュールしないようにする。
    if (cleaned) {
      return;
    }
    frameCount++;
    const elapsedTime = Date.now() - startTime;

    // 1. 背景を描画
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // 2. 情報テキストを描画 (左上)
    ctx.font = `${infoFontSize}px Arial`;
    ctx.fillStyle = contrastColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const infoTextYOffset = infoFontSize + 10; // 少し下にずらす
    ctx.fillText(`Frame: ${frameCount}`, 10, 10);
    ctx.fillText(`Size: ${width}x${height}`, 10, 10 + infoTextYOffset);
    ctx.fillText(`FPS: ${fps}`, 10, 10 + infoTextYOffset * 2);

    // 3. メインテキスト（経過時間）を描画 (中央)
    const timeText = `${elapsedTime}`;
    ctx.font = `bold ${mainFontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle"; // 垂直方向も中央揃えに

    const textX = width / 2;
    const textY = height / 2;

    // 3a. テキストの影
    ctx.shadowColor =
      contrastColor === "#000000" ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = shadowOffset;
    ctx.shadowOffsetY = shadowOffset;

    // 3b. テキスト本体を描画
    ctx.fillStyle = contrastColor;
    ctx.fillText(timeText, textX, textY);

    // 3c. テキストの縁取り
    ctx.shadowColor = "transparent"; // 縁取りには影をつけない
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = contrastColor === "#000000" ? "#ffffff" : "#000000"; // 逆の色で縁取り
    ctx.lineWidth = lineWidth;
    ctx.strokeText(timeText, textX, textY);

    // 次のフレームをリクエスト
    animationFrameId = requestAnimationFrame(updateCanvas);
  };

  // 最初のフレームを描画開始
  updateCanvas();

  // キャンバスからメディアストリームを取得
  const stream = canvas.captureStream(fps);
  const [videoTrack] = stream.getVideoTracks();

  // cleanup は idempotent。複数回呼んでも 1 回目以外は no-op にする。
  // ended ハンドラと #disconnect 経由の明示 cleanup の両方から呼ばれることを想定している。
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    videoTrack.removeEventListener("ended", onEnded);
    videoTrack.stop();
    if (animationFrameId !== undefined) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = undefined;
    }
  };

  // ended イベントから cleanup を呼ぶことで、track.stop() を外部から呼ばれた場合にも
  // RAF / リスナーが解放されるようにする。
  const onEnded = (): void => {
    cleanup();
  };
  videoTrack.addEventListener("ended", onEnded);

  return { track: videoTrack, cleanup };
};

const createFakeAudioTrack = (
  frequency = 440, // デフォルト周波数 A4 (440Hz)
  volume = 0.1, // デフォルト音量 (0.0 - 1.0)
  stereo = false, // ステレオかモノラルか
  stereoPattern: StereoAudioPattern = "constant",
): { track: MediaStreamTrack; cleanup: () => void } => {
  // AudioContextを作成
  const audioCtx = new AudioContext();

  if (stereo) {
    // ステレオの場合: L/Rチャンネルに異なる周波数の音を設定
    // 左チャンネル用のOscillator
    const oscillatorLeft = audioCtx.createOscillator();
    oscillatorLeft.type = "sine";
    oscillatorLeft.frequency.setValueAtTime(frequency, audioCtx.currentTime);

    // 右チャンネル用のOscillator（周波数を少しずらす）
    const oscillatorRight = audioCtx.createOscillator();
    oscillatorRight.type = "sine";
    oscillatorRight.frequency.setValueAtTime(frequency * 1.5, audioCtx.currentTime); // 1.5倍の周波数

    // 各チャンネル用のGainNode
    const gainLeft = audioCtx.createGain();
    gainLeft.gain.setValueAtTime(volume, audioCtx.currentTime);

    const gainRight = audioCtx.createGain();
    gainRight.gain.setValueAtTime(volume, audioCtx.currentTime);

    const stereoAudioPattern =
      stereoPattern === "both-left-right"
        ? startStereoAudioPattern(audioCtx, gainLeft, gainRight, volume)
        : null;

    // ChannelMergerNodeでステレオに結合
    const merger = audioCtx.createChannelMerger(2);

    // MediaStreamAudioDestinationNode（出力先）を作成
    // channelCountを2に明示的に設定
    const destination = audioCtx.createMediaStreamDestination();
    destination.channelCount = 2;
    destination.channelCountMode = "explicit";

    // 接続: 左チャンネル -> merger の入力0
    oscillatorLeft.connect(gainLeft);
    gainLeft.connect(merger, 0, 0);

    // 接続: 右チャンネル -> merger の入力1
    oscillatorRight.connect(gainRight);
    gainRight.connect(merger, 0, 1);

    // merger -> destination
    merger.connect(destination);

    // Oscillatorを開始
    oscillatorLeft.start();
    oscillatorRight.start();

    // MediaStreamからAudioTrackを取得
    const [audioTrack] = destination.stream.getAudioTracks();

    // cleanup は idempotent。複数回呼んでも 1 回目以外は no-op にする。
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      audioTrack.removeEventListener("ended", onEnded);
      audioTrack.stop();
      oscillatorLeft.stop();
      oscillatorRight.stop();
      stereoAudioPattern?.stop();
      // AudioContext.close() は Promise を返すが await すると cleanup の同期性が崩れる。
      // 失敗時は handleAudioContextCloseError が InvalidStateError 以外を console.error に出す。
      void audioCtx.close().catch(handleAudioContextCloseError);
    };

    const onEnded = (): void => {
      cleanup();
    };
    audioTrack.addEventListener("ended", onEnded);

    return { track: audioTrack, cleanup };
  }
  // モノラルの場合（既存の実装）
  // OscillatorNode（音源）を作成
  const oscillator = audioCtx.createOscillator();
  oscillator.type = "sine"; // サイン波（不快感の少ない波形）
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

  // GainNode（音量調整）を作成
  const gainNode = audioCtx.createGain();
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);

  // MediaStreamAudioDestinationNode（出力先）を作成
  const destination = audioCtx.createMediaStreamDestination();

  // ノードを接続: Oscillator -> Gain -> Destination
  oscillator.connect(gainNode);
  gainNode.connect(destination);

  // Oscillatorを開始
  oscillator.start();

  // MediaStreamからAudioTrackを取得
  const [audioTrack] = destination.stream.getAudioTracks();

  // cleanup は idempotent。複数回呼んでも 1 回目以外は no-op にする。
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    audioTrack.removeEventListener("ended", onEnded);
    audioTrack.stop();
    oscillator.stop();
    void audioCtx.close().catch(handleAudioContextCloseError);
  };

  const onEnded = (): void => {
    cleanup();
  };
  audioTrack.addEventListener("ended", onEnded);

  return { track: audioTrack, cleanup };
};

// --- getFakeMedia のための型定義 ---
interface FakeMediaTrackConstraints {
  width?: number;
  height?: number;
  frameRate?: number;
  frequency?: number;
  volume?: number;
  stereo?: boolean;
  stereoPattern?: StereoAudioPattern;
}

interface FakeMediaStreamConstraints {
  video?: boolean | FakeMediaTrackConstraints;
  audio?: boolean | FakeMediaTrackConstraints;
}

/**
 * Fake な MediaStream を生成する関数。getUserMedia に似たインターフェースを提供します。
 *
 * @param constraints - 生成するトラックの種類と設定を指定するオブジェクト。
 *   - video: true または { width, height, frameRate } 形式のオブジェクトでビデオトラックを要求します。
 *   - audio: true または { frequency, volume, stereo, stereoPattern } 形式のオブジェクトでオーディオトラックを要求します。
 * @returns
 *   - stream: 指定されたトラックを含む MediaStream。要求されたトラックがない場合は空の MediaStream を返します。
 *   - cleanup: 生成したトラックの RAF / AudioContext / Oscillator 等のリソースを解放する関数。
 *     呼び出し元は disconnect 時に必ず呼ぶこと。cleanup は idempotent。
 */
export const getFakeMedia = (
  constraints: FakeMediaStreamConstraints,
): { stream: MediaStream; cleanup: () => void } => {
  const tracks: MediaStreamTrack[] = [];
  const cleanups: Array<() => void> = [];

  if (constraints.video) {
    // デフォルトのビデオ設定
    let videoOptions = { frameRate: 30, height: 240, width: 320 };
    // オブジェクトで設定が渡された場合はマージ
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
    // デフォルトのオーディオ設定
    let audioOptions = {
      frequency: 440,
      stereo: false,
      stereoPattern: "constant" as StereoAudioPattern,
      volume: 0.1,
    };
    // オブジェクトで設定が渡された場合はマージ
    if (typeof constraints.audio === "object") {
      audioOptions = { ...audioOptions, ...constraints.audio };
    }
    const { track, cleanup } = createFakeAudioTrack(
      audioOptions.frequency,
      audioOptions.volume,
      audioOptions.stereo,
      audioOptions.stereoPattern,
    );
    tracks.push(track);
    cleanups.push(cleanup);
  }

  // 要求されたトラックがない場合、警告を出力（エラーをスローする代わりに）
  if (tracks.length === 0) {
    console.warn("getFakeMedia: 要求されたトラックがありません。");
  }

  // 生成されたトラックで MediaStream を作成して返す
  return {
    stream: new MediaStream(tracks),
    cleanup: (): void => {
      for (const fn of cleanups) {
        fn();
      }
    },
  };
};
