import { setSoraJsSdkVersion } from '../src/misc'

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
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY
  const apiUrl = import.meta.env.VITE_TEST_API_URL

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

    // channelName
    const channelName = document.querySelector<HTMLInputElement>('#channel-name')?.value
    if (!channelName) {
      throw new Error('channelName is required')
    }

    client = new SoraClient(
      signalingUrl,
      channelIdPrefix,
      channelIdSuffix,
      secretKey,
      channelName,
      apiUrl,
    )
    await client.connect(stream)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await client.disconnect()
  })

  document.querySelector('#disconnect-api')?.addEventListener('click', async () => {
    await client.apiDisconnect()
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
  private options: ConnectionOptions = {
    connectionTimeout: 15000,
    dataChannelSignaling: true,
    ignoreDisconnectWebSocket: true,
  }

  private sora: SoraConnection
  private connection: ConnectionPublisher

  private apiUrl: string

  constructor(
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    secretKey: string,
    channelName: string,
    apiUrl: string,
  ) {
    this.apiUrl = apiUrl

    this.sora = Sora.connection(signalingUrl, this.debug)

    // channel_id の生成
    this.channelId = `${channelIdPrefix}${channelName}${channelIdSuffix}`
    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

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
    await this.connection.disconnect()

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = null
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onNotify(event: SignalingNotifyMessage): void {
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
      const switchedStatusElement = document.querySelector('#switched-status')
      if (switchedStatusElement) {
        switchedStatusElement.textContent = event.transportType
      }
    }
    if (event.type === 'onmessage-close') {
      console.log('[signaling]', event.type, event.transportType)
      const signalingCloseTypeElement = document.querySelector('#signaling-close-type')
      if (signalingCloseTypeElement) {
        signalingCloseTypeElement.textContent = event.transportType
      }
    }
  }

  // E2E テスト側で実行した方が良い気がする
  async apiDisconnect(): Promise<void> {
    const statusElement = document.querySelector('#api-disconnect-status')

    if (!this.apiUrl) {
      console.log('[data_channel_signaling_only] apiDisconnect error: VITE_TEST_API_URL is not set')
      if (statusElement) {
        statusElement.textContent = 'error'
      }
      throw new Error('VITE_TEST_API_URL is not set')
    }

    console.log('[data_channel_signaling_only] apiDisconnect start', {
      apiUrl: this.apiUrl,
      channelId: this.channelId,
      connectionId: this.connection.connectionId,
    })

    // fetch にタイムアウトを設定する
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('[data_channel_signaling_only] apiDisconnect timeout after 10000ms')
      controller.abort()
    }, 10000)

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sora-Target': 'Sora_20151104.DisconnectConnection',
        },
        body: JSON.stringify({
          channel_id: this.channelId,
          connection_id: this.connection.connectionId,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      console.log('[data_channel_signaling_only] apiDisconnect response', {
        status: response.status,
        ok: response.ok,
      })
      if (!response.ok) {
        if (statusElement) {
          statusElement.textContent = 'error'
        }
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      if (statusElement) {
        statusElement.textContent = 'success'
      }
      console.log('[data_channel_signaling_only] apiDisconnect success')
    } catch (e) {
      clearTimeout(timeoutId)
      console.log('[data_channel_signaling_only] apiDisconnect error', e)
      if (statusElement) {
        statusElement.textContent = 'error'
      }
      throw e
    }
  }
}
