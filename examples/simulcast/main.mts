import Sora, {
  type SoraConnection,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  type ConnectionSubscriber,
  type SimulcastRid,
} from 'sora-js-sdk'

document.addEventListener('DOMContentLoaded', () => {
  const signalingUrl = import.meta.env.VITE_SORA_SIGNALING_URL
  const channelId = import.meta.env.VITE_SORA_CHANNEL_ID || ''
  const accessToken = import.meta.env.VITE_ACCESS_TOKEN || ''

  const sendonly = new SimulcastSendonlySoraClient(signalingUrl, channelId, accessToken)
  const recvonlyR0 = new SimulcastRecvonlySoraClient(signalingUrl, channelId, accessToken, 'r0')
  const recvonlyR1 = new SimulcastRecvonlySoraClient(signalingUrl, channelId, accessToken, 'r1')
  const recvonlyR2 = new SimulcastRecvonlySoraClient(signalingUrl, channelId, accessToken, 'r2')

  document.querySelector('#connect')?.addEventListener('click', async () => {
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

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    await sendonly.disconnect()

    // recvonly r0
    await recvonlyR0.disconnect()
    // recvonly r1
    await recvonlyR1.disconnect()
    // recvonly r2
    await recvonlyR2.disconnect()
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

  constructor(signaling_url: string, channel_id: string, access_token: string) {
    this.channelId = channel_id

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

  constructor(signaling_url: string, channel_id: string, access_token: string, rid: SimulcastRid) {
    this.channelId = channel_id
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
