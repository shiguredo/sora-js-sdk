import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type ConnectionSubscriber,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  // 環境変数の読み込み
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL

  // Sora クライアントの初期化
  const sendonly = new SendonlyClient(SORA_SIGNALING_URL, 'stereo_check')

  const recvonly = new RecvonlyClient(SORA_SIGNALING_URL, 'stereo_check')

  // デバイスリストの取得と設定
  await updateDeviceLists()

  // デバイスの変更を監視
  navigator.mediaDevices.addEventListener('devicechange', updateDeviceLists)

  document.querySelector('#sendonly-start')?.addEventListener('click', async () => {
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

  document.querySelector('#sendonly-stop')?.addEventListener('click', async () => {
    await sendonly.disconnect()
  })

  document.querySelector('#recvonly-start')?.addEventListener('click', async () => {
    await recvonly.connect()
  })

  document.querySelector('#recvonly-stop')?.addEventListener('click', async () => {
    await recvonly.disconnect()
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

  constructor(signaling_url: string, channel_id: string) {
    this.sora = Sora.connection(signaling_url, this.debug)

    this.channelId = channel_id

    this.connection = this.sora.sendonly(this.channelId, undefined, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream)
    const audioTrack = stream.getAudioTracks()[0]
    this.analyzeAudioStream(new MediaStream([audioTrack]))
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()
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

    const dataArrayL = new Float32Array(2048)
    const dataArrayR = new Float32Array(2048)

    const analyze = () => {
      analyserL.getFloatTimeDomainData(dataArrayL)
      analyserR.getFloatTimeDomainData(dataArrayR)

      let difference = 0
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i])
      }

      const isStereo = difference !== 0
      const result = isStereo ? 'Stereo' : 'Mono'

      // sendonly-stereo 要素に結果を反映
      const sendonlyStereoElement = document.querySelector<HTMLDivElement>('#sendonly-stereo')
      if (sendonlyStereoElement) {
        sendonlyStereoElement.textContent = result
      }
    }

    setInterval(analyze, 1000)

    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
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
}

class RecvonlyClient {
  private debug = false
  private channelId: string
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  constructor(signaling_url: string, channel_id: string) {
    this.channelId = channel_id

    this.sora = Sora.connection(signaling_url, this.debug)

    this.connection = this.sora.recvonly(this.channelId, undefined, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
  }

  async connect(): Promise<void> {
    await this.connection.connect()
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()
    const remoteAudios = document.querySelector('#remote-videos')
    if (remoteAudios) {
      remoteAudios.innerHTML = ''
    }
  }

  analyzeAudioStream(stream: MediaStream) {
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const splitter = audioContext.createChannelSplitter(2)
    const analyserL = audioContext.createAnalyser()
    const analyserR = audioContext.createAnalyser()

    source.connect(splitter)
    splitter.connect(analyserL, 0)
    splitter.connect(analyserR, 1)

    const dataArrayL = new Float32Array(2048)
    const dataArrayR = new Float32Array(2048)

    const analyze = () => {
      analyserL.getFloatTimeDomainData(dataArrayL)
      analyserR.getFloatTimeDomainData(dataArrayR)

      let difference = 0
      for (let i = 0; i < dataArrayL.length; i++) {
        difference += Math.abs(dataArrayL[i] - dataArrayR[i])
      }

      const isStereo = difference > 0.1
      const result = isStereo ? 'Stereo' : 'Mono'

      // recvonly-stereo 要素に結果を反映
      const recvonlyStereoElement = document.querySelector<HTMLDivElement>('#recvonly-stereo')
      if (recvonlyStereoElement) {
        recvonlyStereoElement.textContent = result
      }
    }

    setInterval(analyze, 1000)

    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }
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
      this.analyzeAudioStream(stream)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    // このトラックが属している MediaStream の id を取得する
    const stream = event.target as MediaStream
    const remoteAudio = document.querySelector(`#remote-audio-${stream.id}`)
    if (remoteAudio) {
      document.querySelector('#remote-audios')?.removeChild(remoteAudio)
    }
  }
}
