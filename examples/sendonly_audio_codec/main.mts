import Sora, {
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type SoraConnection,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', async () => {
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  const client = new SoraClient(
    SORA_SIGNALING_URL,
    SORA_CHANNEL_ID_PREFIX,
    SORA_CHANNEL_ID_SUFFIX,
    ACCESS_TOKEN,
  )
})

class SoraClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    signaling_url: string,
    channel_id_prefix: string,
    channel_id_suffix: string,
    access_token: string,
  ) {
    this.sora = Sora.connection(signaling_url, this.debug)

    // channel_id の生成
    this.channelId = `${channel_id_prefix}sendonly_audio_codec${channel_id_suffix}`
    // access_token を指定する metadata の生成
    this.metadata = { access_token: access_token }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onnotify.bind(this))
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
