import Sora, {
  type ConnectionOptions,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  type SignalingPushMessage,
  type SoraConnection,
  type VideoCodecType,
} from 'sora-js-sdk'
import { getChannelId, getVideoCodecType, setSoraJsSdkVersion } from '../src/misc'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)
    const videoCodecType = getVideoCodecType()

    client = new SoraClient(signalingUrl, channelId, secretKey, videoCodecType)

    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    await client.connect(stream)
  })
  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await client.disconnect()
  })

  // RPCボタンのイベントリスナーを最初から設定
  document.querySelector('#rpc')?.addEventListener('click', async () => {
    if (!client) {
      console.error('Client not initialized')
      return
    }

    const rpcInput = document.querySelector<HTMLInputElement>('#rpc-input')
    if (!rpcInput) {
      console.error('RPC input element not found')
      return
    }

    try {
      const result = await client.sendRpc(rpcInput.value)
      console.log('RPC sent successfully', result)
    } catch (error) {
      console.error('RPC error:', error)
    }
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    const statsReport = await client.getStats()
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    const statsReportJsonDiv = document.querySelector('#stats-report-json')
    if (statsDiv && statsReportJsonDiv) {
      const statsReportJson: Record<string, unknown>[] = []
      // XSS対策: innerHTMLは使わない
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
      // データ属性としても保存（オプション）
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson)
    }
  })
})

class SoraClient {
  private debug = false

  private channelId: string
  private metadata: { access_token: string }
  private options: ConnectionOptions

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    videoCodecType: VideoCodecType | undefined,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId

    this.metadata = { access_token: secretKey }
    this.options = { connectionTimeout: 15000 }

    if (videoCodecType !== undefined) {
      this.options = { ...this.options, videoCodecType: videoCodecType }
    }

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
    this.connection.on('push', this.onpush.bind(this))
  }

  async connect(stream: MediaStream) {
    await this.connection.connect(stream)
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = stream
    }
  }

  isConnected(): boolean {
    return this.connection.pc !== null && this.connection.pc.connectionState === 'connected'
  }

  async sendRpc(value: string): Promise<void> {
    const rpcMethod = '2025.2.0/PutSignalingNotifyMetadataItem'
    const rpcParams = {
      key: 'abc',
      value: value,
      push: true,
    }
    const rpcOptions = {
      notification: true,
    }

    return await this.connection.rpc(rpcMethod, rpcParams, rpcOptions)
  }

  async disconnect() {
    await this.connection.disconnect()

    // お掃除
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = null
    }
    // お掃除
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

  private onpush(event: SignalingPushMessage): void {
    // https://sora-doc.shiguredo.jp/EXPERIMENTAL_API_SIGNALING_NOTIFY_METADATA_EXT#387c9c
    const pushResultDiv = document.querySelector('#push-result') as HTMLElement
    if (pushResultDiv) {
      // JSONデータをdata属性に保存
      pushResultDiv.dataset.pushData = JSON.stringify(event.data)

      // 表示用のHTMLも更新
      pushResultDiv.textContent = ''

      const createParagraph = (text: string) => {
        const p = document.createElement('p')
        p.textContent = text
        return p
      }

      pushResultDiv.appendChild(createParagraph(`Action: ${event.data.action}`))
      pushResultDiv.appendChild(createParagraph(`Connection ID: ${event.data.connection_id}`))
      pushResultDiv.appendChild(createParagraph(`Key: ${event.data.key}`))
      pushResultDiv.appendChild(createParagraph(`Value: ${event.data.value}`))
      pushResultDiv.appendChild(createParagraph(`Type: ${event.data.type}`))
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
      remoteVideo.width = 320
      remoteVideo.height = 240
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos')?.removeChild(remoteVideo)
    }
  }
}
