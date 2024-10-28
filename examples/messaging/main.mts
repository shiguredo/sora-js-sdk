import Sora, {
  type SoraConnection,
  type ConnectionSubscriber,
  type SignalingNotifyMessage,
  type DataChannelMessageEvent,
  type DataChannelEvent,
} from 'sora-js-sdk'

const getChannelName = (): string => {
  const channelNameElement = document.querySelector<HTMLInputElement>('#channel-name')
  const channelName = channelNameElement?.value
  if (channelName === '' || channelName === undefined) {
    throw new Error('channelName is empty')
  }
  return channelName
}

document.addEventListener('DOMContentLoaded', async () => {
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelName = getChannelName()
    client = new SoraClient(
      SORA_SIGNALING_URL,
      SORA_CHANNEL_ID_PREFIX,
      SORA_CHANNEL_ID_SUFFIX,
      ACCESS_TOKEN,
      channelName,
    )
    const checkCompress = document.getElementById('check-compress') as HTMLInputElement
    const compress = checkCompress.checked
    const checkHeader = document.getElementById('check-header') as HTMLInputElement
    const header = checkHeader.checked

    await client.connect(compress, header)
  })
  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await client.disconnect()
  })
  document.querySelector('#send-message')?.addEventListener('click', async () => {
    const value = document.querySelector<HTMLInputElement>('input[name=message]')?.value
    if (value !== undefined && value !== '') {
      await client.sendMessage(value)
    }
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    const statsReport = await client.getStats()
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    const statsReportJsonDiv = document.querySelector('#stats-report-json')
    if (statsDiv && statsReportJsonDiv) {
      let statsHtml = ''
      const statsReportJson: Record<string, unknown>[] = []
      // biome-ignore lint/complexity/noForEach: <explanation>
      statsReport.forEach((report) => {
        statsHtml += `<h3>Type: ${report.type}</h3><ul>`
        const reportJson: Record<string, unknown> = { id: report.id, type: report.type }
        for (const [key, value] of Object.entries(report)) {
          if (key !== 'type' && key !== 'id') {
            statsHtml += `<li><strong>${key}:</strong> ${value}</li>`
            reportJson[key] = value
          }
        }
        statsHtml += '</ul>'
        statsReportJson.push(reportJson)
      })
      statsDiv.innerHTML = statsHtml
      // データ属性としても保存（オプション）
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson)
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
    channelName: string,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = `${channelIdPrefix}${channelName}${channelIdSuffix}`
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
    this.connection.on('datachannel', this.ondatachannel.bind(this))
    this.connection.on('message', this.onmessage.bind(this))
  }

  async connect(compress: boolean, header: boolean) {
    // connect ボタンを無効にする
    const connectButton = document.querySelector<HTMLButtonElement>('#connect')
    if (connectButton) {
      connectButton.disabled = true
    }

    // dataChannels の compress の設定を上書きする
    this.connection.options.dataChannels = [
      {
        label: '#example',
        direction: 'sendrecv',
        compress: compress,
        // header が true の場合は sender_connection_id を追加
        header: header ? [{ type: 'sender_connection_id' }] : undefined,
      },
    ]
    await this.connection.connect()

    // disconnect ボタンを有効にする
    const disconnectButton = document.querySelector<HTMLButtonElement>('#disconnect')
    if (disconnectButton) {
      disconnectButton.disabled = false
    }
  }

  async disconnect() {
    await this.connection.disconnect()

    // connect ボタンを有効にする
    const connectButton = document.querySelector<HTMLButtonElement>('#connect')
    if (connectButton) {
      connectButton.disabled = false
    }

    // disconnect ボタンを無効にする
    const disconnectButton = document.querySelector<HTMLButtonElement>('#disconnect')
    if (disconnectButton) {
      disconnectButton.disabled = true
    }

    const receivedMessagesElement = document.querySelector('#received-messages')
    if (receivedMessagesElement) {
      receivedMessagesElement.innerHTML = ''
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  async sendMessage(message: string) {
    if (message !== '') {
      await this.connection.sendMessage('#example', new TextEncoder().encode(message))
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

  private ondatachannel(event: DataChannelEvent) {
    const openDataChannel = document.createElement('li')
    openDataChannel.textContent = new TextDecoder().decode(
      new TextEncoder().encode(event.datachannel.label),
    )
    document.querySelector('#messaging')?.appendChild(openDataChannel)
  }

  private onmessage(event: DataChannelMessageEvent) {
    const message = document.createElement('li')
    message.textContent = new TextDecoder().decode(event.data)
    document.querySelector('#received-messages')?.appendChild(message)
  }
}
