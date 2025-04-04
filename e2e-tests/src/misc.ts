import { SignJWT } from 'jose'
import type { VideoCodecType } from 'sora-js-sdk'

import Sora from 'sora-js-sdk'

export const generateJwt = async (
  channelId: string,
  secretKey: string,
  privateClaims: Record<string, unknown> = {},
): Promise<string> => {
  console.log('privateClaims:', privateClaims)
  const payload = {
    channel_id: channelId,
    ...privateClaims,
  }
  console.log('payload:', payload)
  return (
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      // 30 秒後に有効期限切れ
      .setExpirationTime('30s')
      .sign(new TextEncoder().encode(secretKey))
  )
}

export const setSoraJsSdkVersion = (id = 'sora-js-sdk-version'): void => {
  const sdkVersionElement = document.querySelector<HTMLDivElement>(`#${id}`)
  if (sdkVersionElement) {
    sdkVersionElement.textContent = `${Sora.version()}`
  }
}

export const getChannelId = (
  channelIdPrefix: string,
  channelIdSuffix: string,
  id = 'channel-name',
): string => {
  const channelNameElement = document.querySelector<HTMLInputElement>(`#${id}`)
  const channelName = channelNameElement?.value
  if (channelName === '' || channelName === undefined) {
    throw new Error('channelName is empty')
  }
  return `${channelIdPrefix}${channelName}${channelIdSuffix}`
}

export const getVideoCodecType = (id = 'video-codec-type'): VideoCodecType => {
  const videoCodecTypeElement = document.querySelector<HTMLSelectElement>(`#${id}`)
  const videoCodecType = videoCodecTypeElement?.value
  if (videoCodecType === '') {
    throw new Error('videoCodecType is empty')
  }
  return videoCodecType as VideoCodecType
}

// fake video track を作成する

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

export const createFakeVideoTrack = (
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

export const createFakeAudioTrack = (
  frequency = 440, // デフォルト周波数 A4 (440Hz)
  volume = 0.1, // デフォルト音量 (0.0 - 1.0)
): MediaStreamTrack => {
  // AudioContextを作成
  const audioCtx = new AudioContext()

  // OscillatorNode（音源）を作成
  const oscillator = audioCtx.createOscillator()
  oscillator.type = 'sine' // サイン波（不快感の少ない波形）
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime)

  // GainNode（音量調整）を作成
  const gainNode = audioCtx.createGain()
  gainNode.gain.setValueAtTime(volume, audioCtx.currentTime)

  // MediaStreamAudioDestinationNode（出力先）を作成
  const destination = audioCtx.createMediaStreamDestination()

  // ノードを接続: Oscillator -> Gain -> Destination
  oscillator.connect(gainNode)
  gainNode.connect(destination)

  // Oscillatorを開始
  oscillator.start()

  // MediaStreamからAudioTrackを取得
  const [audioTrack] = destination.stream.getAudioTracks()

  // トラックが停止されたらAudioContextを閉じる
  audioTrack.addEventListener('ended', () => {
    oscillator.stop()
    audioCtx.close().then(() => {
      console.log('AudioContext closed because track ended.')
    })
  })

  return audioTrack
}
