import { generateJwt } from '../src/misc'

import Sora, {
  type SoraConnection,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  type ConnectionOptions,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  let sendrecv: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    // channelName を取得
    const channelName = document.querySelector<HTMLInputElement>('#channel-name')?.value
    if (!channelName) {
      throw new Error('channelName is empty')
    }

    let accessToken: string | undefined
    // secretKey が空じゃなければ accessToken を生成
    if (secretKey !== '') {
      accessToken = await generateJwt(channelIdPrefix + channelName + channelIdSuffix, secretKey)
    }

    const channelId = channelIdPrefix + channelName + channelIdSuffix
    sendrecv = new SoraClient(signalingUrl, channelId, accessToken)

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await sendrecv.connect(stream)
  })
  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await sendrecv.disconnect()
  })
})

class SoraClient {
  private debug = false

  private channelId: string
  private metadata: Record<string, string> = {}
  private options: ConnectionOptions = {}

  private sora: SoraConnection
  private connection: ConnectionPublisher

  private accessToken: string | undefined

  constructor(signalingUrl: string, channelId: string, accessToken: string | undefined) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId
    this.accessToken = accessToken

    this.options = {
      audio: true,
      video: true,
      simulcast: true,
      spotlight: true,
      spotlightNumber: 1,
    }

    if (this.accessToken) {
      this.metadata = {
        access_token: this.accessToken,
      }
    }

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
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

    // お掃除
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = null
    }
    // お掃除
    const remoteVideos = document.querySelector<HTMLDivElement>('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }
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

  private ontrack(event: RTCTrackEvent): void {
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
      remoteVideo.width = 160
      remoteVideo.height = 120
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`)
    if (remoteVideo) {
      document.querySelector<HTMLDivElement>('#remote-videos')?.removeChild(remoteVideo)
    }
  }
}
