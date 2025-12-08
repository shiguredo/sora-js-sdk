/*
RPC 機能は認証成功時に rpc_methods を払いだす必要がある。
そのためテストサーバー側から JWT に rpc_methods を指定する仕組みを利用している。

ただしこの機能は Sora にはなく、テストサーバー固有の機能であるため、
このテストは通常の Sora では動作しない。
*/

import Sora, {
  type ConnectionPublisher,
  type ConnectionSubscriber,
  type SignalingEvent,
  type SignalingNotifyMessage,
  type SimulcastRid,
  type SoraConnection,
} from 'sora-js-sdk'
import { generateJwt, getChannelId, setSoraJsSdkVersion } from '../src/misc'

// RPC ログを追加する関数
function addRpcLog(message: string): void {
  const rpcLogElement = document.querySelector<HTMLElement>('#rpc-log')
  if (rpcLogElement) {
    const logEntry = document.createElement('div')
    logEntry.textContent = message
    rpcLogElement.appendChild(logEntry)
    // 最新のログが見えるようにスクロール
    rpcLogElement.scrollTop = rpcLogElement.scrollHeight
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let sendonlyClient: SimulcastSendonlyClient
  let recvonlyClient: SimulcastRecvonlyClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    // Sendonly を接続
    const sendonlyAccessToken = await generateJwt(channelId, secretKey, {})
    sendonlyClient = new SimulcastSendonlyClient(signalingUrl, channelId, sendonlyAccessToken)

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { exact: 960 }, height: { exact: 540 } },
    })
    await sendonlyClient.connect(stream)

    // Recvonly を接続 (RPC 用のプライベートクレームを含む JWT を生成する)
    const privateClaims = {
      rpc_methods: ['2025.2.0/RequestSimulcastRid'],
      simulcast: true,
      simulcast_request_rid: 'r2',
      simulcast_rpc_rids: ['none', 'r0', 'r1', 'r2'],
    }
    const recvonlyAccessToken = await generateJwt(channelId, secretKey, privateClaims)
    recvonlyClient = new SimulcastRecvonlyClient(signalingUrl, channelId, recvonlyAccessToken)

    await recvonlyClient.connect()

    // rpcMethods を表示
    const rpcMethodsElement = document.querySelector<HTMLElement>('#rpc-methods')
    if (rpcMethodsElement) {
      const rpcMethods = recvonlyClient.getRpcMethods()
      rpcMethodsElement.textContent = rpcMethods.join(', ')
      rpcMethodsElement.dataset.rpcMethods = JSON.stringify(rpcMethods)
    }
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    if (sendonlyClient) {
      await sendonlyClient.disconnect()
    }
    if (recvonlyClient) {
      await recvonlyClient.disconnect()
    }
    // rpcMethods をクリア
    const rpcMethodsElement = document.querySelector<HTMLElement>('#rpc-methods')
    if (rpcMethodsElement) {
      rpcMethodsElement.textContent = ''
      delete rpcMethodsElement.dataset.rpcMethods
    }
  })

  // RPC で rid を変更するラジオボタンのイベントリスナー
  document.querySelectorAll<HTMLInputElement>('input[name="rid"]').forEach((radio) => {
    radio.addEventListener('change', async () => {
      if (!recvonlyClient) {
        console.error('Recvonly client not initialized')
        return
      }

      const rid = radio.value as SimulcastRid
      const timestamp = new Date().toISOString()
      addRpcLog(`[${timestamp}] Request: rid=${rid}`)

      try {
        const result = await recvonlyClient.requestSimulcastRid(rid)
        const responseTimestamp = new Date().toISOString()
        addRpcLog(`[${responseTimestamp}] Response: ${JSON.stringify(result)}`)
        console.log('RequestSimulcastRid sent successfully', result)
      } catch (error) {
        const errorTimestamp = new Date().toISOString()
        addRpcLog(`[${errorTimestamp}] Error: ${error}`)
        console.error('RPC error:', error)
      }
    })
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    if (!recvonlyClient) {
      console.error('Recvonly client not initialized')
      return
    }

    const statsReport = await recvonlyClient.getStats()
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    if (statsDiv) {
      const statsReportJson: Record<string, unknown>[] = []
      statsDiv.textContent = ''

      for (const report of statsReport.values()) {
        const h3 = document.createElement('h3')
        h3.textContent = `Type: ${report.type}`
        statsDiv.appendChild(h3)

        const ul = document.createElement('ul')
        const reportJson: Record<string, unknown> = { id: report.id, type: report.type }
        for (const [key, value] of Object.entries(report)) {
          if (key !== 'type' && key !== 'id') {
            const li = document.createElement('li')
            const strong = document.createElement('strong')
            strong.textContent = `${key}:`
            li.appendChild(strong)
            li.appendChild(document.createTextNode(` ${value}`))
            ul.appendChild(li)
            reportJson[key] = value
          }
        }
        statsDiv.appendChild(ul)
        statsReportJson.push(reportJson)
      }
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson)
    }
  })
})

// Simulcast Sendonly クライアント
class SimulcastSendonlyClient {
  private debug = false

  private channelId: string
  private metadata: { access_token: string }

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(signalingUrl: string, channelId: string, accessToken: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId
    this.metadata = { access_token: accessToken }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, {
      connectionTimeout: 15000,
      audio: false,
      video: true,
      videoCodecType: 'VP8',
      videoBitRate: 3000,
      simulcast: true,
    })

    this.connection.on('notify', this.onnotify.bind(this))
  }

  async connect(stream: MediaStream) {
    await this.connection.connect(stream)
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = stream
    }
  }

  async disconnect() {
    await this.connection.disconnect()
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = null
    }
  }

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector('#sendonly-connection-id')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }
}

// Simulcast Recvonly クライアント (RPC 機能付き)
class SimulcastRecvonlyClient {
  private debug = false

  private channelId: string
  private metadata: { access_token: string }

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  constructor(signalingUrl: string, channelId: string, accessToken: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId
    this.metadata = { access_token: accessToken }

    this.connection = this.sora.recvonly(this.channelId, this.metadata, {
      connectionTimeout: 15000,
      simulcast: true,
      simulcastRid: 'r2',
    })

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
    this.connection.on('signaling', this.onsignaling.bind(this))
  }

  async connect() {
    await this.connection.connect()
  }

  async disconnect() {
    await this.connection.disconnect()
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }
  }

  // type offer から取得した rpcMethods を返す
  getRpcMethods(): string[] {
    return this.connection.rpcMethods
  }

  // RPC で simulcast rid を変更する
  async requestSimulcastRid(rid: SimulcastRid): Promise<unknown> {
    const rpcMethod = '2025.2.0/RequestSimulcastRid'
    const rpcParams = {
      receiver_connection_id: this.connection.connectionId,
      rid: rid,
    }
    return await this.connection.rpc(rpcMethod, rpcParams)
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
      const connectionIdElement = document.querySelector('#recvonly-connection-id')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }

    // simulcast.switched イベントで current_rid と rpc_rids を表示
    if (event.event_type === 'simulcast.switched') {
      const currentRidElement = document.querySelector<HTMLElement>('#current-rid')
      if (currentRidElement) {
        currentRidElement.textContent = event.current_rid
        currentRidElement.dataset.currentRid = event.current_rid
      }

      // rpc_rids を表示
      const rpcRidsElement = document.querySelector<HTMLElement>('#rpc-rids')
      if (rpcRidsElement && event.rpc_rids) {
        rpcRidsElement.textContent = event.rpc_rids.join(', ')
        rpcRidsElement.dataset.rpcRids = JSON.stringify(event.rpc_rids)
      }
    }
  }

  private ontrack(event: RTCTrackEvent): void {
    const stream = event.streams[0]
    const remoteVideoId = `remote-video-${stream.id}`
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement('video')
      remoteVideo.id = remoteVideoId
      remoteVideo.style.border = '1px solid red'
      remoteVideo.autoplay = true
      remoteVideo.playsInline = true
      remoteVideo.controls = true
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)

      // 解像度を表示するための resize イベントリスナー
      remoteVideo.addEventListener('resize', () => {
        const resolutionElement = document.querySelector<HTMLElement>('#video-resolution')
        if (resolutionElement) {
          resolutionElement.textContent = `${remoteVideo.videoWidth}x${remoteVideo.videoHeight}`
          resolutionElement.dataset.width = String(remoteVideo.videoWidth)
          resolutionElement.dataset.height = String(remoteVideo.videoHeight)
        }
      })
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos')?.removeChild(remoteVideo)
    }
  }

  private onsignaling(event: SignalingEvent): void {
    // type: onmessage-switched メッセージを受け取ったらフラグを立てる
    if (event.type === 'onmessage-switched') {
      const switchedElement = document.querySelector<HTMLElement>('#switched')
      if (switchedElement) {
        switchedElement.textContent = 'true'
        switchedElement.dataset.switched = 'true'
      }
    }
  }
}
