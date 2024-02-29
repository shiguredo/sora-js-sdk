import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  ConnectionPublisher,
} from '../../dist/sora'

document.addEventListener('DOMContentLoaded', async () => {
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  const sendrecv1 = new SoraClient(
    'sendrecv1',
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
  )

  const sendrecv2 = new SoraClient(
    'sendrecv2',
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
  )

  document.querySelector('#sendrecv1-start')?.addEventListener('click', async () => {
    // sendrecv1
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await sendrecv1.connect(stream)
  })
  document.querySelector('#sendrecv1-stop')?.addEventListener('click', async () => {
    await sendrecv1.disconnect()
  })

  document.querySelector('#sendrecv2-start')?.addEventListener('click', async () => {
    // sendrecv2
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await sendrecv2.connect(stream)
  })
  document.querySelector('#sendrecv2-stop')?.addEventListener('click', async () => {
    await sendrecv2.disconnect()
  })
})

class SoraClient {
  // sendrecv1 or sendrecv2
  private label: string

  private debug = false

  private channelId: string
  private metadata: { access_token: string }
  private options: object

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    label: string,
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    accessToken: string,
  ) {
    this.label = label

    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = `${channelIdPrefix}sendrecv${channelIdSuffix}`
    this.metadata = { access_token: accessToken }
    this.options = {}

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
  }

  async connect(stream: MediaStream) {
    await this.connection.connect(stream)
    const localVideo = document.querySelector<HTMLVideoElement>(`#${this.label}-local-video`)
    if (localVideo) {
      localVideo.srcObject = stream
    }
  }

  async disconnect() {
    await this.connection.disconnect()

    // お掃除
    const localVideo = document.querySelector<HTMLVideoElement>(`#${this.label}-local-video`)
    if (localVideo) {
      localVideo.srcObject = null
    }
    // お掃除
    const remoteVideos = document.querySelector(`#${this.label}-remote-videos`)
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }
  }

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector(`#${this.label}-connection-id`)
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }

  private ontrack(event: RTCTrackEvent): void {
    const stream = event.streams[0]
    const remoteVideoId = `${this.label}-remotevideo-${stream.id}`
    const remoteVideos = document.querySelector(`#${this.label}-remote-videos`)
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
    const remoteVideo = document.querySelector(`#${this.label}-remotevideo-${target.id}`)
    if (remoteVideo) {
      document.querySelector(`#${this.label}-remote-videos`)?.removeChild(remoteVideo)
    }
  }
}
