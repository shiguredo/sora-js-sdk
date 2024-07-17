import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  await Sora.initE2EE('https://sora-e2ee-wasm.shiguredo.app/2020.2/wasm.wasm').catch((e) => {
    const errorMessageElement = document.querySelector('#error-message')
    if (errorMessageElement) {
      errorMessageElement.textContent = 'E2EE用 wasm ファイルの読み込みに失敗しました'
    }
  })

  const client = new SoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
  )

  document.querySelector('#start')?.addEventListener('click', async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await client.connect(stream)
  })
  document.querySelector('#stop')?.addEventListener('click', async () => {
    await client.disconnect()
  })
})

class SoraClient {
  private debug = false

  private channelId: string
  private metadata: { access_token: string }
  private options: object

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    accessToken: string,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = `${channelIdPrefix}e2ee${channelIdSuffix}`
    this.metadata = { access_token: accessToken }
    this.options = {
      e2ee: true,
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

    const localConnectionId = document.querySelector<HTMLDivElement>('#local-connection-id')
    if (localConnectionId) {
      localConnectionId.textContent = ''
    }

    const remoteVideos = document.querySelector<HTMLDivElement>('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }
  }

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      event.connection_id === this.connection.connectionId
    ) {
      const localConnectionId = document.querySelector<HTMLDivElement>('#local-connection-id')
      if (localConnectionId) {
        localConnectionId.textContent = this.connection.connectionId
      }

      const localFingerprint = document.querySelector<HTMLDivElement>('#local-fingerprint')
      if (localFingerprint) {
        localFingerprint.textContent = this.connection.e2eeSelfFingerprint || null
      }
    }

    if (event.event_type === 'connection.created') {
      const remoteFingerprints = this.connection.e2eeRemoteFingerprints || {}
      Object.keys(remoteFingerprints).filter((connectionId) => {
        const fingerprintElement = document.querySelector(
          `#remote-video-box-${connectionId}-fingerprint`,
        )
        if (fingerprintElement) {
          fingerprintElement.textContent = `fingerprint: ${remoteFingerprints[connectionId]}`
        }
      })
    }
  }

  private ontrack(event: RTCTrackEvent): void {
    const stream = event.streams[0]
    /*
    <div id="remote-video-box-${stream.id}">
      <div id="remote-video-box-${stream.id}-connection-id">connectionId: ${stream.id}
      <div id="remote-video-box-${stream.id}-fingerprint">fingerprint: ${stream.id}
      <video id="remote-video-${stream.id}" style="border: 1px solid red;" autoplay playsinline controls srcObject="${stream}"></video>
    </div>
    */

    const remoteVideoBoxId = `remote-video-box-${stream.id}`
    const remoteVideos = document.querySelector<HTMLDivElement>('#remote-videos')
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoBoxId}`)) {
      // <div id="remote-video-box-${stream.id}"> を作る
      const remoteVideoBox = document.createElement('div')
      remoteVideoBox.id = remoteVideoBoxId
      // <div id="remote-video-box-${stream.id}-connection-id"> を作る
      const connectionIdElement = document.createElement('div')
      connectionIdElement.id = `${remoteVideoBoxId}-connection-id`
      connectionIdElement.textContent = `connectionId: ${stream.id}`
      remoteVideoBox.appendChild(connectionIdElement)
      // <div id="remote-video-box-${stream.id}-fingerprint"> を作る
      const fingerprintElement = document.createElement('div')
      fingerprintElement.id = `${remoteVideoBoxId}-fingerprint`
      remoteVideoBox.appendChild(fingerprintElement)
      // <video id="remote-video-${stream.id}"> を作る
      const remoteVideo = document.createElement('video')
      remoteVideo.style.border = '1px solid red'
      remoteVideo.autoplay = true
      remoteVideo.playsInline = true
      remoteVideo.controls = true
      remoteVideo.srcObject = stream
      remoteVideoBox.appendChild(remoteVideo)
      remoteVideos.appendChild(remoteVideoBox)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${target.id}`)
    if (remoteVideo) {
      document.querySelector<HTMLDivElement>('#remote-videos')?.removeChild(remoteVideo)
    }
  }
}
