import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SoraConnection,
  type SignalingNotifyMessage,
  type ConnectionSubscriber,
  type SimulcastRid,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let recvonly: SimulcastRecvonlySoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const simulcastRidElement = document.querySelector<HTMLSelectElement>('#simulcast-rid')
    const simulcastRid =
      simulcastRidElement?.value === '' ? undefined : (simulcastRidElement?.value as SimulcastRid)

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    recvonly = new SimulcastRecvonlySoraClient(signalingUrl, channelId, secretKey)

    await recvonly.connect(simulcastRid)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await recvonly.disconnect()
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    const statsReport = await recvonly.getStats()
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

class SimulcastRecvonlySoraClient {
  private debug = false

  private channelId: string
  private rid: SimulcastRid | undefined

  private sora: SoraConnection
  private connection: ConnectionSubscriber

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId

    this.sora = Sora.connection(signalingUrl, this.debug)
    this.connection = this.sora.recvonly(
      this.channelId,
      { access_token: secretKey },
      { simulcast: true },
    )

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
  }

  async connect(simulcastRid?: SimulcastRid) {
    if (simulcastRid) {
      this.rid = simulcastRid
      this.connection.options.simulcastRid = simulcastRid
    }

    await this.connection.connect()
  }

  async disconnect() {
    await this.connection.disconnect()
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`)
    if (remoteVideo) {
      remoteVideo.srcObject = null
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

  private ontrack(event: RTCTrackEvent) {
    const remoteVideos = document.querySelector<HTMLDivElement>('#remote-videos')
    const stream = event.streams[0]
    const remoteVideoId = `remote-video-${stream.id}`
    if (remoteVideos && !remoteVideos.querySelector<HTMLVideoElement>(`#${remoteVideoId}`)) {
      const videoElement = document.createElement('video')
      videoElement.id = remoteVideoId
      videoElement.autoplay = true
      videoElement.playsInline = true
      videoElement.controls = true
      videoElement.srcObject = stream
      remoteVideos.appendChild(videoElement)
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    const stream = event.target as MediaStream
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${stream.id}`)
    if (remoteVideo) {
      remoteVideo.srcObject = null
    }
  }
}
