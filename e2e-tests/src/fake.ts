// --- 定数の定義 ---
const MIN_FPS = 1
const MAX_FPS = 60
const BASE_WIDTH = 640 // 基準解像度（幅）
const BASE_HEIGHT = 480 // 基準解像度（高さ）
const BASE_INFO_FONT_SIZE = 28
const BASE_MAIN_FONT_SIZE = 100
const BASE_LINE_WIDTH = 3
const BASE_SHADOW_BLUR = 10
const BASE_SHADOW_OFFSET = 5
// --- 定数の定義ここまで ---

// 解像度に基づいて値をスケーリングする関数
const scaleValue = (baseValue: number, currentWidth: number, currentHeight: number): number => {
  const ratio = Math.min(currentWidth / BASE_WIDTH, currentHeight / BASE_HEIGHT)
  return Math.max(1, Math.floor(baseValue * ratio)) // 最小値1を保証
}

// 背景色とそれに対するコントラスト色を生成する関数
const generateColors = (): { bgColor: string; contrastColor: string } => {
  // 中程度の明るさの背景色を生成 (0.3 - 0.7 の範囲)
  const r = Math.floor(Math.random() * 256 * 0.4 + 0.3 * 256)
  const g = Math.floor(Math.random() * 256 * 0.4 + 0.3 * 256)
  const b = Math.floor(Math.random() * 256 * 0.4 + 0.3 * 256)
  const bgColor = `rgb(${r}, ${g}, ${b})`

  // 輝度を計算 (YIQ方式)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  const contrastColor = brightness > 128 ? '#000000' : '#ffffff' // 輝度に基づいて黒か白を選択

  return { bgColor, contrastColor }
}

const createFakeVideoTrack = (
  width = 320, // デフォルト幅 320px
  height = 240, // デフォルト高さ 240px
  frameRate = 30, // デフォルトフレームレート 30fps
): MediaStreamTrack => {
  // フレームレートを制限
  const fps = Math.max(MIN_FPS, Math.min(MAX_FPS, frameRate))

  // キャンバス要素を作成
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  // キャンバスのコンテキストを取得
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get canvas context')
  }

  // 開始時間とフレームカウンター
  const startTime = Date.now()
  let frameCount = 0
  let animationFrameId: number

  // 色を決定
  const { bgColor, contrastColor } = generateColors()

  // 解像度に応じたサイズを計算
  const infoFontSize = scaleValue(BASE_INFO_FONT_SIZE, width, height)
  const mainFontSize = scaleValue(BASE_MAIN_FONT_SIZE, width, height)
  const lineWidth = scaleValue(BASE_LINE_WIDTH, width, height)
  const shadowBlur = scaleValue(BASE_SHADOW_BLUR, width, height)
  const shadowOffset = scaleValue(BASE_SHADOW_OFFSET, width, height)

  // キャンバスを更新する関数 (requestAnimationFrameを使用)
  const updateCanvas = (): void => {
    frameCount++
    const elapsedTime = Date.now() - startTime

    // 1. 背景を描画
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    // 2. 情報テキストを描画 (左上)
    ctx.font = `${infoFontSize}px Arial`
    ctx.fillStyle = contrastColor
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const infoTextYOffset = infoFontSize + 10 // 少し下にずらす
    ctx.fillText(`Frame: ${frameCount}`, 10, 10)
    ctx.fillText(`Size: ${width}x${height}`, 10, 10 + infoTextYOffset)
    ctx.fillText(`FPS: ${fps}`, 10, 10 + infoTextYOffset * 2)

    // 3. メインテキスト（経過時間）を描画 (中央)
    const timeText = `${elapsedTime}`
    ctx.font = `bold ${mainFontSize}px Arial`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle' // 垂直方向も中央揃えに

    const textX = width / 2
    const textY = height / 2

    // 3a. テキストの影
    ctx.shadowColor =
      contrastColor === '#000000' ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'
    ctx.shadowBlur = shadowBlur
    ctx.shadowOffsetX = shadowOffset
    ctx.shadowOffsetY = shadowOffset

    // 3b. テキスト本体を描画
    ctx.fillStyle = contrastColor
    ctx.fillText(timeText, textX, textY)

    // 3c. テキストの縁取り
    ctx.shadowColor = 'transparent' // 縁取りには影をつけない
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.strokeStyle = contrastColor === '#000000' ? '#ffffff' : '#000000' // 逆の色で縁取り
    ctx.lineWidth = lineWidth
    ctx.strokeText(timeText, textX, textY)

    // 次のフレームをリクエスト
    animationFrameId = requestAnimationFrame(updateCanvas)
  }

  // 最初のフレームを描画開始
  updateCanvas()

  // キャンバスからメディアストリームを取得
  const stream = canvas.captureStream(fps)
  const [videoTrack] = stream.getVideoTracks()

  // トラックが停止されたらアニメーションも停止する
  videoTrack.addEventListener('ended', () => {
    cancelAnimationFrame(animationFrameId)
    console.log('Animation stopped because track ended.')
  })

  return videoTrack
}

const createFakeAudioTrack = (
  frequency = 440, // デフォルト周波数 A4 (440Hz)
  volume = 0.1, // デフォルト音量 (0.0 - 1.0)
  stereo = false, // ステレオかモノラルか
): MediaStreamTrack => {
  // ========== Chrome 140対策開始 ==========
  // Chrome 140 (140.0.7339.5) で発生する問題:
  // - 複数のAudioContextが連続で作成されると、ステレオ音源生成が失敗する
  // - ChannelMergerの右チャンネル接続が無視され、左右が同じ音になる
  // - 特に3番目以降のAudioContext作成時に頻発
  //
  // 対策内容:
  // 1. sampleRateを明示的に48000Hzに固定（一貫性確保）
  // 2. ダミーOscillatorで内部状態を初期化
  // 3. 50ms待機で前のAudioContextの影響を回避
  // 4. ノード作成順序の最適化（Destination→Merger→Oscillator）
  // 5. channelCountMode='explicit'とchannelInterpretation='discrete'
  // 6. トラック終了時の完全なクリーンアップ
  //
  // この対策はChrome 139では不要で、Chrome 141以降で修正される可能性があるため、
  // 将来的にrevertできるようにまとめている

  // AudioContextを作成（sampleRateを明示的に指定 - Chrome 140対策）
  const audioCtx = new AudioContext({ sampleRate: 48000 })

  // Chrome 140対策: AudioContextの初期化を確実にする
  // 無音のOscillatorを一瞬作成して破棄（内部状態を安定化）
  const dummyOsc = audioCtx.createOscillator()
  const dummyGain = audioCtx.createGain()
  dummyGain.gain.value = 0
  dummyOsc.connect(dummyGain)
  dummyGain.connect(audioCtx.destination)
  dummyOsc.start()
  dummyOsc.stop(audioCtx.currentTime + 0.001)

  // Chrome 140追加対策: 少し待機してから本処理を開始
  // 前のAudioContextの影響を避ける
  const delay = 50 // 50ms待機
  const startTime = performance.now()
  while (performance.now() - startTime < delay) {
    // ビジーウェイト（同期処理の制約内）
  }
  // ========== Chrome 140対策終了 ==========

  if (stereo) {
    // ========== Chrome 140対策: ステレオ音源生成 ==========
    // Chrome 140では、ノード作成と接続の順序が重要
    // 1. Destinationを最初に作成（channelCount=2を確実に設定）
    // 2. ChannelMergerを作成
    // 3. 各チャンネルのOscillator/Gainを作成
    // 4. 左チャンネル→右チャンネルの順で接続
    // 5. 最後にmerger→destinationを接続

    // 1. まずDestinationを作成して設定（Chrome 140対策: 最初に行うことが重要）
    const destination = audioCtx.createMediaStreamDestination()
    destination.channelCount = 2
    destination.channelCountMode = 'explicit' // Chrome 140対策: 自動変換を防ぐ
    destination.channelInterpretation = 'discrete' // Chrome 140対策: チャンネル間混合を防ぐ

    // 2. ChannelMergerを作成（明示的に2チャンネル）
    const merger = audioCtx.createChannelMerger(2)

    // 3. 左チャンネル用のチェーンを作成
    const oscillatorLeft = audioCtx.createOscillator()
    oscillatorLeft.type = 'sine'
    oscillatorLeft.frequency.setValueAtTime(frequency, audioCtx.currentTime)

    const gainLeft = audioCtx.createGain()
    gainLeft.gain.setValueAtTime(volume, audioCtx.currentTime)

    // 4. 右チャンネル用のチェーンを作成
    const oscillatorRight = audioCtx.createOscillator()
    oscillatorRight.type = 'sine'
    oscillatorRight.frequency.setValueAtTime(frequency * 1.5, audioCtx.currentTime)

    const gainRight = audioCtx.createGain()
    gainRight.gain.setValueAtTime(volume, audioCtx.currentTime)

    // 5. 接続を順番に行う（Chrome 140対策）
    // まず左チャンネルを完全に接続
    oscillatorLeft.connect(gainLeft)
    gainLeft.connect(merger, 0, 0)

    // 次に右チャンネルを完全に接続
    oscillatorRight.connect(gainRight)
    gainRight.connect(merger, 0, 1)

    // 最後にmergerをdestinationに接続
    merger.connect(destination)

    // Oscillatorを開始
    oscillatorLeft.start()
    oscillatorRight.start()

    // MediaStreamからAudioTrackを取得
    const [audioTrack] = destination.stream.getAudioTracks()

    // デバッグ情報
    console.log('Created stereo audio track:', {
      channelCount: destination.channelCount,
      leftFreq: frequency,
      rightFreq: frequency * 1.5,
    })

    // トラックが停止されたら完全にクリーンアップ（Chrome 140対策）
    audioTrack.addEventListener('ended', () => {
      try {
        // Oscillatorを停止
        oscillatorLeft.stop()
        oscillatorRight.stop()
      } catch (_e) {
        // 既に停止している場合はエラーを無視
      }

      // 全ノードを明示的に切断
      oscillatorLeft.disconnect()
      oscillatorRight.disconnect()
      gainLeft.disconnect()
      gainRight.disconnect()
      merger.disconnect()
      destination.disconnect()

      // AudioContextを閉じる
      audioCtx.close().then(() => {
        console.log('Stereo AudioContext fully cleaned up.')
      })
    })

    return audioTrack
  }
  // ========== Chrome 140対策: モノラル音源生成 ==========
  // モノラルでも同様の対策を適用（将来の一貫性のため）

  // 1. まずDestinationを作成して設定（Chrome 140対策: 最初に行うことが重要）
  const destination = audioCtx.createMediaStreamDestination()
  destination.channelCount = 1
  destination.channelCountMode = 'explicit' // Chrome 140対策: 自動変換を防ぐ
  destination.channelInterpretation = 'discrete' // Chrome 140対策: チャンネル間混合を防ぐ

  // 2. OscillatorNode（音源）を作成
  const oscillator = audioCtx.createOscillator()
  oscillator.type = 'sine' // サイン波（不快感の少ない波形）
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime)

  // 3. GainNode（音量調整）を作成
  const gainNode = audioCtx.createGain()
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime)

  // 4. ノードを接続: Oscillator -> Gain -> Destination
  oscillator.connect(gainNode)
  gainNode.connect(destination)

  // Oscillatorを開始
  oscillator.start()

  // MediaStreamからAudioTrackを取得
  const [audioTrack] = destination.stream.getAudioTracks()

  // トラックが停止されたら完全にクリーンアップ（Chrome 140対策）
  audioTrack.addEventListener('ended', () => {
    try {
      // Oscillatorを停止
      oscillator.stop()
    } catch (_e) {
      // 既に停止している場合はエラーを無視
    }

    // 全ノードを明示的に切断
    oscillator.disconnect()
    gainNode.disconnect()
    destination.disconnect()

    // AudioContextを閉じる
    audioCtx.close().then(() => {
      console.log('Mono AudioContext fully cleaned up.')
    })
  })

  return audioTrack
}

// --- getFakeMedia のための型定義 ---
interface FakeMediaTrackConstraints {
  width?: number
  height?: number
  frameRate?: number
  frequency?: number
  volume?: number
  stereo?: boolean
}

interface FakeMediaStreamConstraints {
  video?: boolean | FakeMediaTrackConstraints
  audio?: boolean | FakeMediaTrackConstraints
}

/**
 * Fake な MediaStream を生成する関数。getUserMedia に似たインターフェースを提供します。
 *
 * @param constraints - 生成するトラックの種類と設定を指定するオブジェクト。
 *   - video: true または { width, height, frameRate } 形式のオブジェクトでビデオトラックを要求します。
 *   - audio: true または { frequency, volume } 形式のオブジェクトでオーディオトラックを要求します。
 * @returns 指定されたトラックを含む MediaStream。要求されたトラックがない場合は空の MediaStream を返します。
 */
export const getFakeMedia = (constraints: FakeMediaStreamConstraints): MediaStream => {
  const tracks: MediaStreamTrack[] = []

  if (constraints.video) {
    // デフォルトのビデオ設定
    let videoOptions = { width: 320, height: 240, frameRate: 30 }
    // オブジェクトで設定が渡された場合はマージ
    if (typeof constraints.video === 'object') {
      videoOptions = { ...videoOptions, ...constraints.video }
    }
    const videoTrack = createFakeVideoTrack(
      videoOptions.width,
      videoOptions.height,
      videoOptions.frameRate,
    )
    tracks.push(videoTrack)
  }

  if (constraints.audio) {
    // デフォルトのオーディオ設定
    let audioOptions = { frequency: 440, volume: 0.1, stereo: false }
    // オブジェクトで設定が渡された場合はマージ
    if (typeof constraints.audio === 'object') {
      audioOptions = { ...audioOptions, ...constraints.audio }
    }
    const audioTrack = createFakeAudioTrack(
      audioOptions.frequency,
      audioOptions.volume,
      audioOptions.stereo,
    )
    tracks.push(audioTrack)
  }

  // 要求されたトラックがない場合、警告を出力（エラーをスローする代わりに）
  if (tracks.length === 0) {
    console.warn('getFakeMedia called with no tracks requested.')
  }

  // 生成されたトラックで MediaStream を作成して返す
  return new MediaStream(tracks)
}
