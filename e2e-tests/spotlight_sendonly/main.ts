import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type SoraConnection,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    client = new SoraClient(signalingUrl, channelId, secretKey)

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    await client.connect(stream)
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
  private connection: ConnectionPublisher

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId

    this.sora = Sora.connection(signalingUrl, this.debug)

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.options = {
      connectionTimeout: 15000,
      simulcast: true,
      spotlight: true,
    }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onnotify.bind(this))
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream)

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    const videoElement = document.querySelector<HTMLVideoElement>('#local-video')
    if (videoElement !== null) {
      videoElement.srcObject = null
    }

    const connectionIdElement = document.querySelector<HTMLDivElement>('#connection-id')
    if (connectionIdElement) {
      connectionIdElement.textContent = null
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
}
