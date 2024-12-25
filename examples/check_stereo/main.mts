import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type ConnectionSubscriber,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  // 環境変数の読み込み
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL

  const uuid = crypto.randomUUID()

  // Sora クライアントの初期化
  const sendonly = new SendonlyClient(signalingUrl, uuid)
  const recvonly = new RecvonlyClient(signalingUrl, uuid)

  // デバイスリストの取得と設定
  await updateDeviceLists()

  // デバイスの変更を監視
  navigator.mediaDevices.addEventListener('devicechange', updateDeviceLists)

  document.querySelector('#sendonly-connect')?.addEventListener('click', async () => {
    const audioInputSelect = document.querySelector<HTMLSelectElement>('#sendonly-audio-input')
    const selectedAudioDeviceId = audioInputSelect?.value
    const stream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        deviceId: selectedAudioDeviceId ? { exact: selectedAudioDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
        sampleSize: 16,
      },
    })
    await sendonly.connect(stream)
  })

  document.querySelector('#recvonly-connect')?.addEventListener('click', async () => {
    await recvonly.connect()
  })
})

// デバイスリストを更新する関数
async function updateDeviceLists() {
  const devices = await navigator.mediaDevices.enumerateDevices()

  const audioInputSelect = document.querySelector<HTMLSelectElement>('#sendonly-audio-input')

  if (audioInputSelect) {
    audioInputSelect.innerHTML = ''
    const audioInputDevices = devices.filter((device) => device.kind === 'audioinput')
    for (const device of audioInputDevices) {
      const option = document.createElement('option')
      option.value = device.deviceId
      option.text = device.label || `マイク ${audioInputSelect.length + 1}`
      audioInputSelect.appendChild(option)
    }
  }
}

class SendonlyClient {
  private debug = false
  private channelId: string
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionPublisher

  private canvas: HTMLCanvasElement | null = null
  private canvasCtx: CanvasRenderingContext2D | null = null

  private channelCheckInterval: number | undefined

  constructor(signalingUrl: string, channelId: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)

    this.channelId = channelId

    this.connection = this.sora.sendonly(this.channelId, undefined, this.options)

    this.connection.on('notify', this.onnotify.bind(this))

    this.initializeCanvas()
  }

  async connect(stream: MediaStream): Promise<void> {
    const audioTrack = stream.getAudioTracks()[0]
    if (!audioTrack) {
      throw new Error('Audio track not found')
    }

    await this.connection.connect(stream)
    this.analyzeAudioStream(new MediaStream([audioTrack]))

    // チャネル数の定期チェックを開始
    this.startChannelCheck()
  }

  async getChannels(): Promise<number | undefined> {
    if (!this.connection.pc) {
      return undefined
    }
    const sender = this.connection.pc.getSenders().find((sender) => sender.track?.kind === 'audio')
    if (!sender) {
      return undefined
    }
    return sender.getParameters().codecs[0].channels
  }

  private initializeCanvas() {
    this.canvas = document.querySelector<HTMLCanvasElement>('#sendonly-waveform')
    if (this.canvas) {
      this.canvasCtx = this.canvas.getContext('2d')
    }
  }

  analyzeAudioStream(stream: MediaStream) {
    const audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    const source = audioContext.createMediaStreamSource(stream)
    const splitter = audioContext.createChannelSplitter(2)
    const analyserL = audioContext.createAnalyser()
    const analyserR = audioContext.createAnalyser()

    source.connect(splitter)
    splitter.connect(analyserL, 0)
    splitter.connect(analyserR, 1)

    analyserL.fftSize = 2048
    analyserR.fftSize = 2048

    const bufferLength = analyserL.frequencyBinCount
    const dataArrayL = new Float32Array(bufferLength)
    const dataArrayR = new Float32Array(bufferLength)

    const analyze = () => {
      analyserL.getFloatTimeDomainData(dataArrayL)
      analyserR.getFloatTimeDomainData(dataArrayR)

      this.drawWaveforms(dataArrayL, dataArrayR)

      let difference = 0
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i])
      }

      const isStereo = difference !== 0
      const result = isStereo ? 'Stereo' : 'Mono'

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>('#sendonly-difference-value')
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`
      }

      // sendonly-stereo 要素に結果を反映
      const sendonlyStereoElement = document.querySelector<HTMLDivElement>('#sendonly-stereo')
      if (sendonlyStereoElement) {
        sendonlyStereoElement.textContent = result
      }

      requestAnimationFrame(analyze)
    }

    analyze()

    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
  }

  private drawWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array) {
    if (!this.canvasCtx || !this.canvas) return

    const width = this.canvas.width
    const height = this.canvas.height
    const bufferLength = dataArrayL.length

    this.canvasCtx.fillStyle = 'rgb(240, 240, 240)'
    this.canvasCtx.fillRect(0, 0, width, height)
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!this.canvasCtx) return

      this.canvasCtx.lineWidth = 3
      this.canvasCtx.strokeStyle = color
      this.canvasCtx.beginPath()

      const sliceWidth = (width * 1.0) / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i]
        const y = height / 2 + v * height * 0.8 + offset

        if (i === 0) {
          this.canvasCtx?.moveTo(x, y)
        } else {
          this.canvasCtx?.lineTo(x, y)
        }

        x += sliceWidth
      }

      this.canvasCtx?.lineTo(width, height / 2 + offset)
      this.canvasCtx?.stroke()
    }

    // 左チャンネル（青）を少し上にずらして描画
    this.canvasCtx.globalAlpha = 0.7
    drawChannel(dataArrayL, 'rgb(0, 0, 255)', -10)

    // 右チャンネル（赤）を少し下にずらして描画
    this.canvasCtx.globalAlpha = 0.7
    drawChannel(dataArrayR, 'rgb(255, 0, 0)', 10)

    // モノラルかステレオかを判定して表示
    const isMonaural = this.isMonaural(dataArrayL, dataArrayR)
    this.canvasCtx.fillStyle = 'black'
    this.canvasCtx.font = '20px Arial'
    this.canvasCtx.fillText(isMonaural ? 'Monaural' : 'Stereo', 10, 30)
  }

  private isMonaural(dataArrayL: Float32Array, dataArrayR: Float32Array): boolean {
    const threshold = 0.001
    for (let i = 0; i < dataArrayL.length; i++) {
      if (Math.abs(dataArrayL[i] - dataArrayR[i]) > threshold) {
        return false
      }
    }
    return true
  }

  private onnotify(event: SignalingNotifyMessage) {
    // 自分の connection_id を取得する
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector<HTMLDivElement>('#sendonly-connection-id')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }

  private startChannelCheck() {
    this.channelCheckInterval = window.setInterval(async () => {
      const channels = await this.getChannels()
      const channelElement = document.querySelector<HTMLDivElement>('#sendonly-channels')
      if (channelElement) {
        channelElement.textContent =
          channels !== undefined ? `getParameters codecs channels: ${channels}` : 'undefined'
      }
    }, 1000) // 1秒ごとにチェック
  }
}

class RecvonlyClient {
  private debug = false
  private channelId: string
  private options: object = {
    video: false,
    audio: true,
  }

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  private canvas: HTMLCanvasElement | null = null
  private canvasCtx: CanvasRenderingContext2D | null = null

  constructor(signalingUrl: string, channelId: string) {
    this.channelId = channelId

    this.sora = Sora.connection(signalingUrl, this.debug)

    this.connection = this.sora.recvonly(this.channelId, undefined, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))

    this.initializeCanvas()
  }

  async connect(): Promise<void> {
    const forceStereoOutputElement = document.querySelector<HTMLInputElement>('#forceStereoOutput')
    const forceStereoOutput = forceStereoOutputElement ? forceStereoOutputElement.checked : false
    this.connection.options.forceStereoOutput = forceStereoOutput

    await this.connection.connect()
  }

  private initializeCanvas() {
    this.canvas = document.querySelector<HTMLCanvasElement>('#recvonly-waveform')
    if (this.canvas) {
      this.canvasCtx = this.canvas.getContext('2d')
    }
  }

  analyzeAudioStream(stream: MediaStream) {
    const audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    const source = audioContext.createMediaStreamSource(stream)
    const splitter = audioContext.createChannelSplitter(2)
    const analyserL = audioContext.createAnalyser()
    const analyserR = audioContext.createAnalyser()

    source.connect(splitter)
    splitter.connect(analyserL, 0)
    splitter.connect(analyserR, 1)

    analyserL.fftSize = 2048
    analyserR.fftSize = 2048

    const bufferLength = analyserL.frequencyBinCount
    const dataArrayL = new Float32Array(bufferLength)
    const dataArrayR = new Float32Array(bufferLength)

    const analyze = () => {
      analyserL.getFloatTimeDomainData(dataArrayL)
      analyserR.getFloatTimeDomainData(dataArrayR)

      this.drawWaveforms(dataArrayL, dataArrayR)

      let difference = 0
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i])
      }

      const isStereo = difference !== 0
      const result = isStereo ? 'Stereo' : 'Mono'

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>('#recvonly-difference-value')
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`
      }

      // 既存のコード
      const recvonlyStereoElement = document.querySelector<HTMLDivElement>('#recvonly-stereo')
      if (recvonlyStereoElement) {
        recvonlyStereoElement.textContent = result
      }

      requestAnimationFrame(analyze)
    }

    analyze()

    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
  }

  private drawWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array) {
    if (!this.canvasCtx || !this.canvas) return

    const width = this.canvas.width
    const height = this.canvas.height
    const bufferLength = dataArrayL.length

    this.canvasCtx.fillStyle = 'rgb(240, 240, 240)'
    this.canvasCtx.fillRect(0, 0, width, height)
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!this.canvasCtx) return

      this.canvasCtx.lineWidth = 3
      this.canvasCtx.strokeStyle = color
      this.canvasCtx.beginPath()

      const sliceWidth = (width * 1.0) / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i]
        const y = height / 2 + v * height * 0.8 + offset

        if (i === 0) {
          this.canvasCtx?.moveTo(x, y)
        } else {
          this.canvasCtx?.lineTo(x, y)
        }

        x += sliceWidth
      }

      this.canvasCtx?.lineTo(width, height / 2 + offset)
      this.canvasCtx?.stroke()
    }

    this.canvasCtx.globalAlpha = 0.7
    drawChannel(dataArrayL, 'rgb(0, 0, 255)', -10)
    drawChannel(dataArrayR, 'rgb(255, 0, 0)', 10)

    const isMonaural = this.isMonaural(dataArrayL, dataArrayR)
    this.canvasCtx.fillStyle = 'black'
    this.canvasCtx.font = '20px Arial'
    this.canvasCtx.fillText(isMonaural ? 'Monaural' : 'Stereo', 10, 30)
  }

  private isMonaural(dataArrayL: Float32Array, dataArrayR: Float32Array): boolean {
    const threshold = 0.001
    for (let i = 0; i < dataArrayL.length; i++) {
      if (Math.abs(dataArrayL[i] - dataArrayR[i]) > threshold) {
        return false
      }
    }
    return true
  }

  private onnotify(event: SignalingNotifyMessage) {
    // 自分の connection_id を取得する
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector<HTMLDivElement>('#recvonly-connection-id')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }

  private ontrack(event: RTCTrackEvent) {
    // Sora の場合、event.streams には MediaStream が 1 つだけ含まれる
    const stream = event.streams[0]
    if (event.track.kind === 'audio') {
      this.analyzeAudioStream(new MediaStream([event.track]))

      // <audio> 要素に音声ストリームを設定
      const audioElement = document.querySelector<HTMLAudioElement>('#recvonly-audio')
      if (audioElement) {
        audioElement.srcObject = stream
        audioElement.play().catch((error) => console.error('音声の再生に失敗しました:', error))
      }
    }
  }
}
