import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SignalingNotifyMessage,
  type SignalingEvent,
  type ConnectionPublisher,
  type SoraConnection,
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
    if (client) {
      await client.disconnect()
    }

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    client = new SoraClient(signalingUrl, channelId, secretKey, apiUrl)

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    })
    await client.connect(stream)
  })

  document.querySelector('#disconnect-api')?.addEventListener('click', async () => {
    await client.apiDisconnect()
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
  private metadata: { access_token: string } = { access_token: '' }
  private options: object = {}

  private sora!: SoraConnection
  private connection!: ConnectionPublisher

  private mediaStream: MediaStream | null = null
  private signalingUrl: string
  private secretKey: string
  private apiUrl: string
  private autoReconnect = true

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

    // E2E テスト用のコード
    this.connection.on('signaling', this.onSignaling.bind(this))
  }

  async connect(stream: MediaStream): Promise<void> {
    // MediaStreamを保存して再接続時に使用
    this.mediaStream = stream

    await this.connection.connect(stream)

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    // 自動再接続を無効化してから切断する
    this.autoReconnect = false
    await this.connection.disconnect()

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = null
    }
  }

  setAutoReconnect(value: boolean): void {
    this.autoReconnect = value
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
        console.log('[connect] connectionId', this.connectionId)
      }
    }
  }

  // 切断イベントのハンドラ
  private async onDisconnect(): Promise<void> {
    console.log('[disconnect] 切断を検知しました')
    console.log('[disconnect] connectionId', this.connectionId)

    // 切断時に connectionId をクリアする
    const connectionIdElement = document.querySelector('#connection-id')
    if (connectionIdElement) {
      console.log('[disconnect] clear connectionId', connectionIdElement)
      connectionIdElement.textContent = ''
    }

    this.connectionId = null

    if (this.autoReconnect && this.mediaStream) {
      console.log('[reconnect] 再接続を試みています...')
      // 少し待機してから再接続
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 新しいコネクションを準備
      this.setupConnection()

      try {
        // 保存したストリームで再接続
        await this.connection.connect(this.mediaStream)
        console.log('[reconnect] 再接続に成功しました')
        const reconnectLogElement = document.querySelector('#reconnect-log')
        if (reconnectLogElement) {
          reconnectLogElement.textContent = 'Success'
        }
      } catch (error) {
        console.error('[reconnect] 再接続に失敗しました', error)
        const reconnectLogElement = document.querySelector('#reconnect-log')
        if (reconnectLogElement) {
          reconnectLogElement.textContent = 'Failed'
        }
      }
    }
  }

  // E2E テスト側で実行した方が良い気がする
  async apiDisconnect(): Promise<void> {
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

  // E2E テスト用のコード
  private onSignaling(event: SignalingEvent): void {
    if (event.type === 'onmessage-switched') {
      console.log('[signaling]', event.type, event.transportType)
    }
  }
}
