import Sora, {
  type ConnectionPublisher,
  type ReconnectErrorEvent,
  type ReconnectedEvent,
  type ReconnectingEvent,
  type SignalingEvent,
  type SignalingNotifyMessage,
  type SoraConnection,
} from 'sora-js-sdk'
import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY
  const apiUrl = import.meta.env.VITE_TEST_API_URL

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    if (client) {
      await client.disconnect()
    }

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    client = new SoraClient(signalingUrl, channelId, secretKey, apiUrl)
    // テスト用にグローバルに公開
    window.testClient = client

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    })
    await client.connect(stream)
  })

  document.querySelector('#disconnect-api')?.addEventListener('click', async () => {
    await client.apiDisconnect()
  })

  document.querySelector('#abnormal-disconnect-api')?.addEventListener('click', async () => {
    await client.apiAbnormalDisconnect()
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

// テスト用にグローバルに公開
declare global {
  interface Window {
    testClient?: SoraClient
  }
}

class SoraClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string } = { access_token: '' }
  // autoReconnect オプションを有効化、WebSocket シグナリングを使用
  private options: object = {
    connectionTimeout: 15000,
    autoReconnect: true,
    maxReconnectAttempts: 3,
    reconnectDelay: 1000,
    reconnectBackoff: 1.5,
    maxReconnectDelay: 5000,
    dataChannelSignaling: false,
  }

  private sora!: SoraConnection
  public connection!: ConnectionPublisher

  private signalingUrl: string
  private secretKey: string
  private apiUrl: string
  private mediaStream: MediaStream | null = null

  private connectionId: string | null = null

  constructor(signalingUrl: string, channelId: string, secretKey: string, apiUrl: string) {
    this.signalingUrl = signalingUrl
    this.channelId = channelId
    this.secretKey = secretKey
    this.apiUrl = apiUrl
    this.sora = Sora.connection(this.signalingUrl, this.debug)

    this.setupConnection()
  }

  private setupConnection(): void {
    // access_token を指定する metadata の生成
    this.metadata = { access_token: this.secretKey }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onNotify.bind(this))
    this.connection.on('disconnect', this.onDisconnect.bind(this))

    // 自動再接続イベントのハンドラを追加
    this.connection.on('reconnecting', this.onReconnecting.bind(this))
    this.connection.on('reconnected', this.onReconnected.bind(this))
    this.connection.on('reconnecterror', this.onReconnectError.bind(this))

    // E2E テスト用のコード
    this.connection.on('signaling', this.onSignaling.bind(this))
  }

  async connect(stream: MediaStream): Promise<void> {
    // MediaStream を保存して再接続時に使用
    this.mediaStream = stream
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
        this.connectionId = event.connection_id
        console.log(
          '[sendonly_auto_reconnect] SignalingNotify self-connectionId',
          this.connectionId,
        )
      }
    }
  }

  // 切断イベントのハンドラ
  private async onDisconnect(): Promise<void> {
    console.log('[sendonly_auto_reconnect] 切断を検知しました')
    console.log('[sendonly_auto_reconnect] connectionId', this.connectionId)

    // 自動再接続が有効な場合は SDK が自動的に再接続を処理する
    // ここでは手動での再接続処理は不要

    this.connectionId = null
  }

  // 再接続開始時のハンドラ
  private onReconnecting(event: ReconnectingEvent): void {
    console.log(
      `[sendonly_auto_reconnect] 再接続開始: 試行 ${event.attempt}回目, 遅延 ${event.delay}ms`,
    )

    const statusElement = document.querySelector('#reconnect-status')
    if (statusElement) {
      statusElement.textContent = 'Reconnecting...'
    }

    const attemptElement = document.querySelector('#reconnect-attempt')
    if (attemptElement) {
      attemptElement.textContent = `Attempt: ${event.attempt}`
    }
  }

  // 再接続成功時のハンドラ
  private onReconnected(event: ReconnectedEvent): void {
    console.log(
      `[sendonly_auto_reconnect] 再接続成功: 試行 ${event.attempt}回目, 総遅延 ${event.totalDelay}ms`,
    )

    const statusElement = document.querySelector('#reconnect-status')
    if (statusElement) {
      statusElement.textContent = 'Reconnected'
    }

    const logElement = document.querySelector('#reconnect-log')
    if (logElement) {
      logElement.textContent = 'Success'
    }
  }

  // 再接続エラー時のハンドラ
  private onReconnectError(event: ReconnectErrorEvent): void {
    console.error(
      `[sendonly_auto_reconnect] 再接続失敗: 試行 ${event.attempt}回目, エラー: ${event.lastError}`,
    )

    const statusElement = document.querySelector('#reconnect-status')
    if (statusElement) {
      statusElement.textContent = 'Reconnect Failed'
    }

    const logElement = document.querySelector('#reconnect-log')
    if (logElement) {
      logElement.textContent = 'Failed'
    }
  }

  // E2E テスト側で実行した方が良い気がする
  async apiDisconnect(): Promise<void> {
    // 切断 API を実行したタイミングで connectionId をクリアする
    const connectionIdElement = document.querySelector('#connection-id')
    if (connectionIdElement) {
      console.log('[sendonly_auto_reconnect] clear connectionId', connectionIdElement)
      connectionIdElement.textContent = ''
    }

    if (!this.apiUrl) {
      throw new Error('VITE_TEST_API_URL is not set')
    }
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
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
  }

  // WebSocket を強制的に切断して異常切断をシミュレートする API を叩く
  async apiAbnormalDisconnect(): Promise<void> {
    if (!this.apiUrl) {
      throw new Error('VITE_TEST_API_URL is not set')
    }

    // Sora の WebSocket 切断 API を呼び出す
    // この API は Tailscale 経由でアクセス可能
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sora-Target': 'Sora_20130308.DisconnectWebSocket',
      },
      body: JSON.stringify({
        channel_id: this.channelId,
        client_id: this.connection.clientId,
        code: 1050,
      }),
    })
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    console.log(
      '[sendonly_auto_reconnect] WebSocket disconnected to simulate abnormal disconnection',
    )
  }

  // E2E テスト用のコード
  private onSignaling(event: SignalingEvent): void {
    if (event.type === 'onmessage-switched') {
      console.log('[sendonly_auto_reconnect]', event.type, event.transportType)
    }
  }
}
