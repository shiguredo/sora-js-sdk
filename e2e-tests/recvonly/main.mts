import { generateJwt } from '../src/misc'

import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionSubscriber,
  type ConnectionOptions,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', () => {
  // 環境変数の読み込み
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  // Sora クライアントの初期化
  let client: SoraClient

  // SDK バージョンの表示
  const sdkVersionElement = document.querySelector('#sdk-version')
  if (sdkVersionElement) {
    sdkVersionElement.textContent = `${Sora.version()}`
  }

  document.querySelector('#connect')?.addEventListener('click', async () => {
    if (client) {
      await client.disconnect()
    }

    // channelName を取得
    const channelName = document.querySelector('#channel-name') as HTMLInputElement
    if (!channelName) {
      throw new Error('Channel name input element not found')
    }

    client = new SoraClient(
      signalingUrl,
      channelIdPrefix,
      channelIdSuffix,
      secretKey,
      channelName.value,
    )

    await client.connect()
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    if (!client) {
      return
    }

    await client.disconnect()
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    if (!client) {
      return
    }

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
  private metadata: Record<string, string> = {}
  private options: ConnectionOptions = {}

  private sora: SoraConnection
  private connection: ConnectionSubscriber | undefined

  private secretKey: string

  constructor(
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    secretKey: string,
    channelName: string,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.secretKey = secretKey

    // channel_id の生成
    this.channelId = `${channelIdPrefix}${channelName}${channelIdSuffix}`
  }

  async connect(): Promise<void> {
    // SecretKey が空文字列じゃなければ JWT を生成して metadata に設定する
    if (this.secretKey !== '') {
      const jwt = await generateJwt(this.channelId, this.secretKey)
      // access_token を指定する metadata の生成
      this.metadata = {
        access_token: jwt,
      }
    }

    this.connection = this.sora.recvonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))

    await this.connection.connect()
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection is not ready')
    }

    await this.connection.disconnect()
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (!this.connection) {
      throw new Error('Connection is not ready')
    }

    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (!this.connection) {
      throw new Error('Connection is not ready')
    }

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
    const remoteVideoId = `remote-video-${stream.id}`
    const remoteVideos = document.querySelector<HTMLDivElement>('#remote-videos')
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement('video')
      remoteVideo.id = remoteVideoId
      remoteVideo.style.border = '1px solid red'
      remoteVideo.autoplay = true
      remoteVideo.playsInline = true
      remoteVideo.controls = true
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    // このトラックが属している MediaStream の id を取得する
    const stream = event.target as MediaStream
    const remoteVideo = document.querySelector(`#remote-video-${stream.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos')?.removeChild(remoteVideo)
    }
  }
}
