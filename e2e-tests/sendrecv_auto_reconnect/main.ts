import Sora, {
  type ConnectionBase,
  type ReconnectErrorEvent,
  type ReconnectedEvent,
  type ReconnectingEvent,
  type SignalingEvent,
  type SignalingNotifyMessage,
  type SoraConnection,
} from 'sora-js-sdk'
import { setSoraJsSdkVersion } from '../src/misc'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const _channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const _channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY
  const apiUrl = import.meta.env.VITE_TEST_API_URL

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    if (client) {
      await client.disconnect()
    }

    // const channelId = getChannelId(channelIdPrefix, channelIdSuffix)
    const channelId = 'sora'

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
    maxReconnectAttempts: 10,
    reconnectDelay: 1000,
    reconnectBackoff: 2.0,
    maxReconnectDelay: 5000,
    dataChannelSignaling: false,
  }

  private sora!: SoraConnection
  public connection!: ConnectionBase
  private mediaStream?: MediaStream

  private signalingUrl: string
  private secretKey: string
  private apiUrl: string

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

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onNotify.bind(this))
    this.connection.on('disconnect', this.onDisconnect.bind(this))
    this.connection.on('track', this.onTrack.bind(this))
    this.connection.on('removetrack', this.onRemoveTrack.bind(this))

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
    await (this.connection as any).connect(stream)

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    // ローカルビデオをクリア
    const localVideoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideoElement !== null) {
      localVideoElement.srcObject = null
    }

    // リモートビデオをすべてクリア
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
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
          '[sendrecv_auto_reconnect] SignalingNotify self-connectionId',
          this.connectionId,
        )
      }
    }
  }

  // 切断イベントのハンドラ
  private async onDisconnect(): Promise<void> {
    console.log('[sendrecv_auto_reconnect] 切断を検知しました')
    console.log('[sendrecv_auto_reconnect] connectionId', this.connectionId)

    // 切断時にリモートビデオをクリア
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      console.log('[sendrecv_auto_reconnect] Clearing remote videos on disconnect')
      remoteVideos.innerHTML = ''
    }

    // 自動再接続が有効な場合は SDK が自動的に再接続を処理する
    // ここでは手動での再接続処理は不要

    this.connectionId = null
  }

  // 再接続開始時のハンドラ
  private onReconnecting(event: ReconnectingEvent): void {
    console.log(
      `[sendrecv_auto_reconnect] 再接続開始: 試行 ${event.attempt}回目, 遅延 ${event.delay}ms`,
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
      `[sendrecv_auto_reconnect] 再接続成功: 試行 ${event.attempt}回目, 総遅延 ${event.totalDelay}ms`,
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
      `[sendrecv_auto_reconnect] 再接続失敗: 試行 ${event.attempt}回目, エラー: ${event.lastError}`,
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

  // track イベントのハンドラ
  private onTrack(event: RTCTrackEvent): void {
    console.log(
      '[sendrecv_auto_reconnect] Track received:',
      event.track.kind,
      'id:',
      event.track.id,
    )

    const stream = event.streams[0]
    if (!stream) {
      console.log('[sendrecv_auto_reconnect] No stream in track event')
      return
    }

    console.log('[sendrecv_auto_reconnect] Stream ID:', stream.id)

    const remoteVideoId = `remote-video-${stream.id}`
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      let remoteVideo = remoteVideos.querySelector<HTMLVideoElement>(`#${remoteVideoId}`)

      if (!remoteVideo) {
        console.log('[sendrecv_auto_reconnect] Creating new video element for stream:', stream.id)
        remoteVideo = document.createElement('video')
        remoteVideo.id = remoteVideoId
        remoteVideo.style.border = '1px solid red'
        remoteVideo.autoplay = true
        remoteVideo.playsInline = true
        remoteVideo.controls = true
        remoteVideo.width = 320
        remoteVideo.height = 240
        remoteVideos.appendChild(remoteVideo)
      } else {
        console.log(
          '[sendrecv_auto_reconnect] Updating existing video element for stream:',
          stream.id,
        )
      }

      // 常に srcObject を更新（再接続時の対応）
      remoteVideo.srcObject = stream
    }
  }

  // removetrack イベントのハンドラ
  private onRemoveTrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`)
    if (remoteVideo) {
      console.log('[sendrecv_auto_reconnect] Removing video:', target.id)
      document.querySelector('#remote-videos')?.removeChild(remoteVideo)
    }
  }

  // E2E テスト側で実行した方が良い気がする
  async apiDisconnect(): Promise<void> {
    // 切断 API を実行したタイミングで connectionId をクリアする
    const connectionIdElement = document.querySelector('#connection-id')
    if (connectionIdElement) {
      console.log('[sendrecv_auto_reconnect] clear connectionId', connectionIdElement)
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
      '[sendrecv_auto_reconnect] WebSocket disconnected to simulate abnormal disconnection',
    )
  }

  // E2E テスト用のコード
  private onSignaling(event: SignalingEvent): void {
    if (event.type === 'onmessage-switched') {
      console.log('[sendrecv_auto_reconnect]', event.type, event.transportType)
    }
  }
}
