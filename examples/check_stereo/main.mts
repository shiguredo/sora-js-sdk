import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionSubscriber,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', () => {
  // 環境変数の読み込み
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  // Sora クライアントの初期化
  const client = new SoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
  )

  document.querySelector('#start')?.addEventListener('click', async () => {
    await client.connect()
  })

  document.querySelector('#stop')?.addEventListener('click', async () => {
    await client.disconnect()
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    const statsReport = await client.getStats()
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    const statsReportJsonDiv = document.querySelector('#stats-report-json')
    if (statsDiv && statsReportJsonDiv) {
      let statsHtml = ''
      const statsReportJson: Record<string, unknown>[] = []
      // biome-ignore lint/complexity/noForEach: <explanation>
      statsReport.forEach((report) => {
        statsHtml += `<h3>Type: ${report.type}</h3><ul>`
        const reportJson: Record<string, unknown> = { id: report.id, type: report.type }
        for (const [key, value] of Object.entries(report)) {
          if (key !== 'type' && key !== 'id') {
            statsHtml += `<li><strong>${key}:</strong> ${value}</li>`
            reportJson[key] = value
          }
        }
        statsHtml += '</ul>'
        statsReportJson.push(reportJson)
      })
      statsDiv.innerHTML = statsHtml
      // データ属性としても保存（オプション）
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson)
    }
  })
})

class SoraClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  constructor(
    signaling_url: string,
    channel_id_prefix: string,
    channel_id_suffix: string,
    access_token: string,
  ) {
    this.sora = Sora.connection(signaling_url, this.debug)

    // channel_id の生成
    this.channelId = 'stereo_check'
    // access_token を指定する metadata の生成
    this.metadata = { access_token: access_token }

    this.connection = this.sora.recvonly(this.channelId, this.metadata, this.options)
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

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
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
      console.log(isStereo ? 'Stereo' : 'Mono')
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
      const connectionIdElement = document.querySelector<HTMLDivElement>('#connection-id')
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
