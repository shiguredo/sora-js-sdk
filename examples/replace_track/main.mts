import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type VideoCodecType,
  type ConnectionOptions,
} from 'sora-js-sdk'

const getChannelName = (): string => {
  const channelNameElement = document.querySelector<HTMLInputElement>('#channel-name')
  const channelName = channelNameElement?.value
  if (channelName === '' || channelName === undefined) {
    throw new Error('channelName is empty')
  }
  return channelName
}

const getVideoCodecType = (): VideoCodecType | undefined => {
  const videoCodecTypeElement = document.querySelector<HTMLSelectElement>('#video-codec-type')
  const videoCodecType = videoCodecTypeElement?.value
  if (videoCodecType === '') {
    return undefined
  }
  return videoCodecType as VideoCodecType
}

document.addEventListener('DOMContentLoaded', async () => {
  const SORA_SIGNALING_URL = import.meta.env.VITE_SORA_SIGNALING_URL
  const SORA_CHANNEL_ID_PREFIX = import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const SORA_CHANNEL_ID_SUFFIX = import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''
  const ACCESS_TOKEN = import.meta.env.VITE_ACCESS_TOKEN || ''

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelName = getChannelName()
    const videoCodecType = getVideoCodecType()

    client = new SoraClient(
      SORA_SIGNALING_URL,
      SORA_CHANNEL_ID_PREFIX,
      SORA_CHANNEL_ID_SUFFIX,
      ACCESS_TOKEN,
      channelName,
      videoCodecType,
    )

    await client.connect()
  })

  document.querySelector('#replace-stream')?.addEventListener('click', async () => {
    // audio: true, video: true なので要注意
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
    await client.replaceStream(stream)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await client.disconnect()
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
  private options: ConnectionOptions

  private sora: SoraConnection
  private connection: ConnectionPublisher

  private stream: MediaStream

  constructor(
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    accessToken: string,
    channelName: string,
    videoCodecType: VideoCodecType | undefined,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = `${channelIdPrefix}${channelName}${channelIdSuffix}`
    this.metadata = { access_token: accessToken }
    this.options = {}

    if (videoCodecType !== undefined) {
      this.options = { ...this.options, videoCodecType: videoCodecType }
    }

    this.stream = new MediaStream()

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
  }

  async connect() {
    await this.connection.connect(this.stream)
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = this.stream
    }
  }

  async replaceStream(stream: MediaStream) {
    if (stream.getAudioTracks().length > 0) {
      await this.connection.replaceAudioTrack(this.stream, stream.getAudioTracks()[0])
    }
    if (stream.getVideoTracks().length > 0) {
      await this.connection.replaceVideoTrack(this.stream, stream.getVideoTracks()[0])
    }
    this.stream = stream
  }

  async disconnect() {
    await this.connection.disconnect()

    // お掃除
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = null
    }
    // お掃除
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos) {
      remoteVideos.innerHTML = ''
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
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
    const remoteVideos = document.querySelector('#remote-videos')
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement('video')
      remoteVideo.id = remoteVideoId
      remoteVideo.style.border = '1px solid red'
      remoteVideo.autoplay = true
      remoteVideo.playsInline = true
      remoteVideo.controls = true
      remoteVideo.width = 320
      remoteVideo.height = 240
      remoteVideo.srcObject = stream
      remoteVideos.appendChild(remoteVideo)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`)
    if (remoteVideo) {
      document.querySelector('#remote-videos')?.removeChild(remoteVideo)
    }
  }
}
