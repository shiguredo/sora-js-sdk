import { generateJwt } from '../src/misc'

import Sora, {
  type SignalingNotifyMessage,
  type SignalingEvent,
  type ConnectionPublisher,
  type SoraConnection,
  type ConnectionOptions,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY || ''

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

    // channel_name を取得
    const channelName = document.querySelector<HTMLInputElement>('#channel-name')
    if (!channelName) {
      throw new Error('Channel name input element not found')
    }

    const channelId = channelIdPrefix + channelName.value + channelIdSuffix

    let accessToken: string | undefined
    // secretKey が空じゃなければ accessToken を生成
    if (secretKey !== '') {
      accessToken = await generateJwt(channelId, secretKey)
    }

    client = new SoraClient(signalingUrl, channelId, accessToken)

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    })
    await client.connect(stream)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    if (client) {
      await client.disconnect()
    }
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
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionPublisher

  private accessToken: string | undefined

  constructor(signalingUrl: string, channelId: string, accessToken: string | undefined) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId
    this.accessToken = accessToken

    if (this.accessToken) {
      this.metadata = {
        access_token: this.accessToken,
      }
    }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onNotify.bind(this))

    // E2E テスト用のコード
    this.connection.on('signaling', this.onSignaling.bind(this))
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream)

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection is not ready')
    }

    await this.connection.disconnect()

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = null
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

  private onNotify(event: SignalingNotifyMessage): void {
    if (!this.connection) {
      throw new Error('Connection is not ready')
    }

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

  // E2E テスト用のコード
  private onSignaling(event: SignalingEvent): void {
    if (event.type === 'onmessage-switched') {
      console.log('[signaling]', event.type, event.transportType)
    }
  }
}
