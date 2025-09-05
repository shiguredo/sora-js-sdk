import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type SoraConnection,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    // 音声コーデックの選択を取得
    const audioCodecType = document.getElementById('audio-codec-type') as HTMLSelectElement
    const selectedCodecType = audioCodecType.value === 'OPUS' ? audioCodecType.value : undefined

    // 音声ビットレートの選択を取得
    const audioBitRateSelect = document.getElementById('audio-bit-rate') as HTMLSelectElement
    const selectedBitRate = audioBitRateSelect.value
      ? Number.parseInt(audioBitRateSelect.value, 10)
      : undefined

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    client = new SoraClient(signalingUrl, channelId, secretKey)

    const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
    await client.connect(stream, selectedCodecType, selectedBitRate)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await client.disconnect()
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    const statsReport = await client.getStats()
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    const statsReportJsonDiv = document.querySelector('#stats-report-json')
    if (statsDiv && statsReportJsonDiv) {
      let statsHtml = ''
      const statsReportJson: Record<string, unknown>[] = []
      for (const report of statsReport.values()) {
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
      }
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
  private connection: ConnectionPublisher

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onnotify.bind(this))
  }

  async connect(
    stream: MediaStream,
    audioCodecType?: string,
    audioBitRate?: number,
  ): Promise<void> {
    if (audioCodecType && audioCodecType === 'OPUS') {
      // 音声コーデックを上書きする
      this.connection.options.audioCodecType = audioCodecType
    }
    if (audioBitRate) {
      // 音声ビットレートを上書きする
      this.connection.options.audioBitRate = audioBitRate
    }
    await this.connection.connect(stream)

    const audioElement = document.querySelector<HTMLAudioElement>('#local-audio')
    if (audioElement !== null) {
      audioElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    const audioElement = document.querySelector<HTMLAudioElement>('#local-audio')
    if (audioElement !== null) {
      audioElement.srcObject = null
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector('#connection-id')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }
}
