import { getChannelId, getVideoBitRate, getVideoCodecType, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SoraConnection,
  type VideoCodecType,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  type ConnectionOptions,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let sendonly: SimulcastSendonlySoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)
    const videoCodecType = getVideoCodecType()
    const videoBitRate = getVideoBitRate()

    sendonly = new SimulcastSendonlySoraClient(
      signalingUrl,
      channelId,
      videoCodecType,
      videoBitRate,
      secretKey,
    )

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { exact: 960 }, height: { exact: 540 } },
    })
    await sendonly.connect(stream)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await sendonly.disconnect()
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    const statsReport = await sendonly.getStats()
    const statsDiv = document.querySelector('#stats-report') as HTMLElement
    const statsReportJsonDiv = document.querySelector('#stats-report-json')
    if (statsDiv && statsReportJsonDiv) {
      let statsHtml = ''
      const statsReportJson: Record<string, unknown>[] = []
      for (const report of statsReport.values()) {
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
      }
      statsDiv.innerHTML = statsHtml
      // データ属性としても保存（オプション）
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson)
    }
  })
})

class SimulcastSendonlySoraClient {
  private debug = false
  private channelId: string

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    signalingUrl: string,
    channelId: string,
    videoCodecType: VideoCodecType | undefined,
    videoBitRate: number | undefined,
    secretKey: string,
  ) {
    this.channelId = channelId

    const options: ConnectionOptions = {
      audio: false,
      video: true,
      simulcast: true,
    }

    if (videoCodecType) {
      options.videoCodecType = videoCodecType
    }

    if (videoBitRate) {
      options.videoBitRate = videoBitRate
    }

    this.sora = Sora.connection(signalingUrl, this.debug)
    this.connection = this.sora.sendonly(this.channelId, { access_token: secretKey }, options)

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

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === 'connection.created' &&
      event.connection_id === this.connection.connectionId
    ) {
      const localVideoConnectionId = document.querySelector('#connection-id')
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = `${event.connection_id}`
      }
    }
  }
}
