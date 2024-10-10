import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type ConnectionSubscriber,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  // 環境変数の読み込み
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL

  const uuid = crypto.randomUUID()

  // Sora クライアントの初期化
  const sendonly1 = new SendonlyClient(SORA_SIGNALING_URL, uuid, 1)
  const sendonly2 = new SendonlyClient(SORA_SIGNALING_URL, uuid, 2)

  const recvonly = new RecvonlyClient(SORA_SIGNALING_URL, uuid)

  // デバイスリストの取得と設定
  await updateDeviceLists()

  // デバイスの変更を監視
  navigator.mediaDevices.addEventListener('devicechange', updateDeviceLists)

  document.querySelector('#sendonly-connect-1')?.addEventListener('click', async () => {
    const audioInputSelect = document.querySelector<HTMLSelectElement>('#sendonly-audio-input-1')
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
    await sendonly1.connect(stream)
  })

  document.querySelector('#sendonly-connect-2')?.addEventListener('click', async () => {
    const audioInputSelect = document.querySelector<HTMLSelectElement>('#sendonly-audio-input-2')
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
    await sendonly2.connect(stream)
  })

  document.querySelector('#recvonly-connect')?.addEventListener('click', async () => {
    await recvonly.connect()
  })
})

// デバイスリストを更新する関数
async function updateDeviceLists() {
  const devices = await navigator.mediaDevices.enumerateDevices()

  for (let i = 0; i < 2; i++) {
    const audioInputSelect = document.querySelector<HTMLSelectElement>(`#sendonly-audio-input-${i + 1}`)

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

  private sendonlyClientId: number

  constructor(signaling_url: string, channel_id: string, sendonlyClientId: number) {
    this.sora = Sora.connection(signaling_url, this.debug)

    this.channelId = channel_id

    this.sendonlyClientId = sendonlyClientId

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
    this.canvas = document.querySelector<HTMLCanvasElement>(`#sendonly-waveform-${this.sendonlyClientId}`)
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
      const differenceElement = document.querySelector<HTMLDivElement>(`#sendonly-difference-value-${this.sendonlyClientId}`)
      if (differenceElement) {
        differenceElement.textContent = `Difference: ${difference.toFixed(6)}`
      }

      // sendonly-stereo 要素に結果を反映
      const sendonlyStereoElement = document.querySelector<HTMLDivElement>(`#sendonly-stereo-${this.sendonlyClientId}`)
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
      const connectionIdElement = document.querySelector<HTMLDivElement>(`#sendonly-connection-id-${this.sendonlyClientId}`)
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }

  private startChannelCheck() {
    this.channelCheckInterval = window.setInterval(async () => {
      const channels = await this.getChannels()
      const channelElement = document.querySelector<HTMLDivElement>(`#sendonly-channels-${this.sendonlyClientId}`)
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

  //private canvases: HTMLCanvasElement[] = []
  //private canvasCtxs: CanvasRenderingContext2D[] = []
  private canvases = new Map<string, HTMLCanvasElement>()
  private canvasCtxs = new Map<string, CanvasRenderingContext2D | null>()

  constructor(signaling_url: string, channel_id: string) {
    this.channelId = channel_id

    this.sora = Sora.connection(signaling_url, this.debug)

    this.connection = this.sora.recvonly(this.channelId, undefined, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
  }

  async connect(): Promise<void> {
    const forceStereoOutputElement = document.querySelector<HTMLInputElement>('#forceStereoOutput')
    const forceStereoOutput = forceStereoOutputElement ? forceStereoOutputElement.checked : false
    this.connection.options.forceStereoOutput = forceStereoOutput

    await this.connection.connect()
  }

  private initializeCanvas(streamId: string) {
    const canvas = document.querySelector<HTMLCanvasElement>(`#recvonly-waveform-canvas-${streamId}`)
    if (canvas) {
      this.canvases.set(streamId, canvas)
      this.canvasCtxs.set(streamId, canvas.getContext('2d'))
    }
  }

  analyzeAudioStream(stream: MediaStream, streamId: string) {
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

      this.drawWaveforms(dataArrayL, dataArrayR, streamId)

      let difference = 0
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i])
      }

      const isStereo = difference !== 0
      const result = isStereo ? 'Stereo' : 'Mono'

      // differenceの値を表示する要素を追加
      const differenceElement = document.querySelector<HTMLDivElement>(`#recvonly-difference-value-${stream.id}`)
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

  private drawWaveforms(dataArrayL: Float32Array, dataArrayR: Float32Array, streamId: string) {
    const canvasCtx = this.canvasCtxs.get(streamId)
    const canvas = this.canvases.get(streamId)
    if (!canvasCtx || !canvas) return

    const width = canvas.width
    const height = canvas.height
    const bufferLength = dataArrayL.length

    canvasCtx.fillStyle = 'rgb(240, 240, 240)'
    canvasCtx.fillRect(0, 0, width, height)
    const drawChannel = (dataArray: Float32Array, color: string, offset: number) => {
      if (!canvasCtx) return

      canvasCtx.lineWidth = 3
      canvasCtx.strokeStyle = color
      canvasCtx.beginPath()

      const sliceWidth = (width * 1.0) / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i]
        const y = height / 2 + v * height * 0.8 + offset

        if (i === 0) {
          canvasCtx?.moveTo(x, y)
        } else {
          canvasCtx?.lineTo(x, y)
        }

        x += sliceWidth
      }

      canvasCtx?.lineTo(width, height / 2 + offset)
      canvasCtx?.stroke()
    }

    canvasCtx.globalAlpha = 0.7
    drawChannel(dataArrayL, 'rgb(0, 0, 255)', -10)
    drawChannel(dataArrayR, 'rgb(255, 0, 0)', 10)

    const isMonaural = this.isMonaural(dataArrayL, dataArrayR)
    canvasCtx.fillStyle = 'black'
    canvasCtx.font = '20px Arial'
    canvasCtx.fillText(isMonaural ? 'Monaural' : 'Stereo', 10, 30)
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
      this.analyzeAudioStream(new MediaStream([event.track]), stream.id)
      const remoteAudioId = `remoteaudio-${stream.id}`
      const remoteAudios = document.querySelector<HTMLDivElement>('#remote-audios')
      if (remoteAudios && !remoteAudios.querySelector(`#${remoteAudioId}`)) {
        const remoteAudioDiv = document.createElement('div')
        remoteAudioDiv.id = `remote-audio-${remoteAudioId}`

        const waveformDiv = document.createElement('div')
        waveformDiv.id = `recvonly-waveform-${stream.id}`

        const h3 = document.createElement('h3')
        h3.innerText = 'Waveform'
        const differenceValueDiv = document.createElement('div')
        differenceValueDiv.id = `recvonly-difference-value-${stream.id}`
        const waveformCanvas = document.createElement('canvas')
        waveformCanvas.id = `recvonly-waveform-canvas-${stream.id}`
        waveformCanvas.width = 800
        waveformCanvas.height = 400
        
        waveformDiv.appendChild(h3)
        waveformDiv.appendChild(differenceValueDiv)
        waveformDiv.appendChild(waveformCanvas)

        const remoteAudio = document.createElement('audio')
        remoteAudio.id = remoteAudioId
        remoteAudio.style.border = '1px solid red'
        remoteAudio.autoplay = true
        remoteAudio.controls = true
        remoteAudio.muted = true
        remoteAudio.srcObject = stream

        remoteAudioDiv.appendChild(waveformDiv)
        remoteAudioDiv.appendChild(remoteAudio)

        remoteAudios.appendChild(remoteAudioDiv)

        this.initializeCanvas(stream.id)
      }
    }
  }
}
