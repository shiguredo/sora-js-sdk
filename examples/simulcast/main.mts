import Sora, {
  type SoraConnection,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  ConnectionSubscriber,
  SimulcastRid,
} from '../../dist/sora'

document.addEventListener('DOMContentLoaded', () => {
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  const sendonly = new SimulcastSendonlySoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
  )

  const recvonlyR0 = new SimulcastRecvonlySoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
    'r0',
  )

  const recvonlyR1 = new SimulcastRecvonlySoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
    'r1',
  )

  const recvonlyR2 = new SimulcastRecvonlySoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
    'r2',
  )

  document.querySelector('#start')?.addEventListener('click', async () => {
    // sendonly
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { exact: 1280 }, height: { exact: 720 } },
    })
    await sendonly.connect(stream)

    // recvonly r0
    await recvonlyR0.connect()
    // recvonly r1
    await recvonlyR1.connect()
    // recvonly r2
    await recvonlyR2.connect()
  })

  document.querySelector('#stop')?.addEventListener('click', async () => {
    await sendonly.disconnect()

    // recvonly r0
    await recvonlyR0.disconnect()
    // recvonly r1
    await recvonlyR1.disconnect()
    // recvonly r2
    await recvonlyR2.disconnect()
  })
})

class SimulcastSendonlySoraClient {
  private debug = false
  private channelId: string

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    signaling_url: string,
    channel_id_prefix: string,
    channel_id_suffix: string,
    access_token: string,
  ) {
    this.channelId = `${channel_id_prefix}simulcast${channel_id_suffix}`

    this.sora = Sora.connection(signaling_url, this.debug)
    this.connection = this.sora.sendonly(
      this.channelId,
      { access_token },
      { audio: false, video: true, videoCodecType: 'VP8', videoBitRate: 2500, simulcast: true },
    )

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

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === 'connection.created' &&
      event.connection_id === this.connection.connectionId
    ) {
      const localVideoConnectionId = document.querySelector('#local-video-connection-id')
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = `${event.connection_id}`
      }
    }
  }
}

class SimulcastRecvonlySoraClient {
  private debug = false

  private channelId: string
  private rid: SimulcastRid

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  constructor(
    signaling_url: string,
    channel_id_prefix: string,
    channel_id_suffix: string,
    access_token: string,
    rid: SimulcastRid,
  ) {
    this.channelId = `${channel_id_prefix}simulcast${channel_id_suffix}`
    this.rid = rid

    this.sora = Sora.connection(signaling_url, this.debug)
    this.connection = this.sora.recvonly(
      this.channelId,
      { access_token },
      { simulcastRid: this.rid, simulcast: true },
    )

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
  }

  async connect() {
    await this.connection.connect()
  }

  async disconnect() {
    await this.connection.disconnect()
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`)
    if (remoteVideo) {
      remoteVideo.srcObject = null
    }
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === 'connection.created' &&
      event.connection_id === this.connection.connectionId
    ) {
      const localVideoConnectionId = document.querySelector(
        `#remote-video-connection-id-${this.rid}`,
      )
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = `${event.connection_id}`
      }
    }
  }

  private ontrack(event: RTCTrackEvent) {
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`)
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0]
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`)
    if (remoteVideo) {
      remoteVideo.srcObject = null
    }
  }
}
