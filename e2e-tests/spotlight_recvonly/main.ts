import { getChannelId, setSdkVersion } from '../src/misc'

import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionSubscriber,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    client = new SoraClient(signalingUrl, channelId, secretKey)
    await client.connect()
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await client.disconnect()
  })
})

class SoraClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId
    this.sora = Sora.connection(signalingUrl, this.debug)

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.options = {
      simulcast: true,
      spotlight: true,
    }

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
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }

    const connectionIdElement = document.querySelector<HTMLDivElement>('#connection-id')
    if (connectionIdElement) {
      connectionIdElement.textContent = null
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
    const remoteVideoId = `remotevideo-${stream.id}`
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
    const remoteVideo = document.querySelector(`#remotevideo-${stream.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos')?.removeChild(remoteVideo)
    }
  }
}
