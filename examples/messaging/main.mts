import Sora, {
  type SoraConnection,
  type ConnectionSubscriber,
  type SignalingNotifyMessage,
  type DataChannelMessageEvent,
} from '../../dist/sora'

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

  document.querySelector('#start')?.addEventListener('click', async () => {
    await client.connect()
  })
  document.querySelector('#stop')?.addEventListener('click', async () => {
    await client.disconnect()
  })
  document.querySelector('#send-message')?.addEventListener('click', () => {
    const value = document.querySelector<HTMLInputElement>('input[name=message]')?.value
    if (value !== undefined && value !== '') {
      client.send_message(value)
    }
  })
})

class SoraClient {
  private debug = false

  private channelId: string
  private metadata: { access_token: string }
  private options: object

  private sora: SoraConnection
  private connection: ConnectionSubscriber
  constructor(
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    accessToken: string,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = `${channelIdPrefix}messaging${channelIdSuffix}`
    this.metadata = { access_token: accessToken }

    this.options = {
      dataChannelSignaling: true,
      dataChannels: [
        {
          label: '#example',
          direction: 'sendrecv',
          compress: true,
        },
      ],
    }

    this.connection = this.sora.recvonly(this.channelId, this.metadata, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('message', this.onmessage.bind(this))
  }

  async connect() {
    // start ボタンを無効にする
    const startButton = document.querySelector<HTMLButtonElement>('#start')
    if (startButton) {
      startButton.disabled = true
    }

    await this.connection.connect()

    // stop ボタンを有効にする
    const stopButton = document.querySelector<HTMLButtonElement>('#stop')
    if (stopButton) {
      stopButton.disabled = false
    }
  }

  async disconnect() {
    await this.connection.disconnect()

    // start ボタンを有効にする
    const startButton = document.querySelector<HTMLButtonElement>('#start')
    if (startButton) {
      startButton.disabled = false
    }

    // stop ボタンを無効にする
    const stopButton = document.querySelector<HTMLButtonElement>('#stop')
    if (stopButton) {
      stopButton.disabled = true
    }

    const receivedMessagesElement = document.querySelector('#received-messages')
    if (receivedMessagesElement) {
      receivedMessagesElement.innerHTML = ''
    }
  }

  send_message(message: string) {
    if (message !== '') {
      this.connection.sendMessage('#example', new TextEncoder().encode(message))
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

      // 送信ボタンを有効にする
      const sendMessageButton = document.querySelector<HTMLButtonElement>('#send-message')
      if (sendMessageButton) {
        sendMessageButton.disabled = false
      }
    }
  }

  private onmessage(event: DataChannelMessageEvent) {
    const message = document.createElement('li')
    message.textContent = new TextDecoder().decode(event.data)
    document.querySelector('#received-messages')?.appendChild(message)
  }
}
