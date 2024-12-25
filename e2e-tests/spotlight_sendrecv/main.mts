import Sora, {
  type SoraConnection,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  const sendrecv1 = new SoraClient(
    'sendrecv1',
    signalingUrl,
    channelIdPrefix,
    channelIdSuffix,
    secretKey,
  )

  const sendrecv2 = new SoraClient(
    'sendrecv2',
    signalingUrl,
    channelIdPrefix,
    channelIdSuffix,
    secretKey,
  )

  document.querySelector('#sendrecv1-connect')?.addEventListener('click', async () => {
    // sendrecv1
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await sendrecv1.connect(stream)
  })
  document.querySelector('#sendrecv1-disconnect')?.addEventListener('click', async () => {
    await sendrecv1.disconnect()
  })

  document.querySelector('#sendrecv2-connect')?.addEventListener('click', async () => {
    // sendrecv2
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await sendrecv2.connect(stream)
  })
  document.querySelector('#sendrecv2-disconnect')?.addEventListener('click', async () => {
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
    secretKey: string,
  ) {
    this.label = label

    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = `${channelIdPrefix}spotlight_sendrecv${channelIdSuffix}`
    this.metadata = { access_token: secretKey }
    this.options = {
      audio: true,
      video: true,
      simulcast: true,
      spotlight: true,
      spotlightNumber: 1,
    }

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
    const remoteVideoId = `${this.label}-remote-video-${stream.id}`
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
    const remoteVideo = document.querySelector(`#${this.label}-remote-video-${target.id}`)
    if (remoteVideo) {
      document.querySelector(`#${this.label}-remote-videos`)?.removeChild(remoteVideo)
    }
  }
}
