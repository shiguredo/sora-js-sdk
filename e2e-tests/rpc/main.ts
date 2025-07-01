import Sora, {
  type ConnectionOptions,
  type ConnectionPublisher,
  type SignalingNotifyMessage,
  type SignalingPushMessage,
  type SoraConnection,
  type VideoCodecType,
} from 'sora-js-sdk'
import { getChannelId, getVideoCodecType, setSoraJsSdkVersion } from '../src/misc'

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let client: SoraClient

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)
    const videoCodecType = getVideoCodecType()

    client = new SoraClient(signalingUrl, channelId, secretKey, videoCodecType)

    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    await client.connect(stream)
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

class SoraClient {
  private debug = false

  private channelId: string
  private metadata: { access_token: string }
  private options: ConnectionOptions

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    videoCodecType: VideoCodecType | undefined,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId

    this.metadata = { access_token: secretKey }
    this.options = {}

    if (videoCodecType !== undefined) {
      this.options = { ...this.options, videoCodecType: videoCodecType }
    }

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)

    this.connection.on('notify', this.onnotify.bind(this))
    this.connection.on('track', this.ontrack.bind(this))
    this.connection.on('removetrack', this.onremovetrack.bind(this))
    this.connection.on('push', this.onpush.bind(this))
  }

  async connect(stream: MediaStream) {
    await this.connection.connect(stream)
    const localVideo = document.querySelector<HTMLVideoElement>('#local-video')
    if (localVideo) {
      localVideo.srcObject = stream
    }

    // 接続後にRPCボタンのイベントリスナーを設定
    this.rpc()
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

  private onpush(event: SignalingPushMessage): void {
    // https://sora-doc.shiguredo.jp/EXPERIMENTAL_API_SIGNALING_NOTIFY_METADATA_EXT#387c9c
    const pushResultDiv = document.querySelector('#push-result')
    if (pushResultDiv) {
      // {
      //     "type": "push",
      //     "data": {
      //         "action": "PutMetadataItem",
      //         "connection_id": "0FQE5EA5YN3FS13P01QZ1JG8R0",
      //         "key": "abc",
      //         "value": "efg",
      //         "type": "signaling_notify_metadata_ext"
      //     }
      // }
      pushResultDiv.innerHTML = `
        <p>Action: ${event.data.action}</p> 
        <p>Connection ID: ${event.data.connection_id}</p>
        <p>Key: ${event.data.key}</p>
        <p>Value: ${event.data.value}</p>
        <p>Type: ${event.data.type}</p>
      `
    }
  }

  private rpc(): void {
    const rpcButton = document.querySelector('#rpc-button')
    if (rpcButton) {
      // 既存のイベントリスナーを削除してから新しいものを追加
      const newButton = rpcButton.cloneNode(true) as HTMLElement
      rpcButton.parentNode?.replaceChild(newButton, rpcButton)

      newButton.addEventListener('click', async () => {
        const rpcInput = document.querySelector<HTMLInputElement>('#rpc-input')
        if (!rpcInput) {
          console.error('RPC input element not found')
          return
        }

        const rpcMethod = 'Sora_20201124.PutSignalingNotifyMetadataItem'
        const rpcParams = {
          key: 'abc',
          value: rpcInput.value,
          push: true,
        }
        const rpcOptions = {
          notification: true,
        }

        // 実際に送信されるRPCメッセージの構造
        const actualRpcMessage = {
          id: crypto.randomUUID(), // 実際のRPCではIDが付与される
          jsonrpc: '2.0',
          method: rpcMethod,
          params: rpcParams,
        }

        const messageString = JSON.stringify(actualRpcMessage)
        const originalSize = new TextEncoder().encode(messageString).length

        // CompressionStream APIを使用した実際の圧縮（サポートされている場合）
        let compressedSize = originalSize
        let compressionInfo = 'Compression not available'

        if ('CompressionStream' in window) {
          try {
            const encoder = new TextEncoder()
            const input = encoder.encode(messageString)

            // gzip圧縮
            const cs = new CompressionStream('gzip')
            const writer = cs.writable.getWriter()
            writer.write(input)
            writer.close()

            const compressed = []
            const reader = cs.readable.getReader()
            let result = await reader.read()
            while (!result.done) {
              compressed.push(...result.value)
              result = await reader.read()
            }

            compressedSize = compressed.length
            compressionInfo = 'gzip compressed'
          } catch {
            compressionInfo = 'Compression failed'
          }
        }

        const sizeInfoDiv = document.querySelector('#rpc-size-info')
        if (sizeInfoDiv) {
          const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1)
          const reductionNum = Number.parseFloat(reduction)
          const worthCompressing = reductionNum > 10 // 10%以上削減できれば圧縮の価値あり

          sizeInfoDiv.innerHTML = `
            <strong>Message Size Analysis:</strong><br>
            Original: ${originalSize} bytes<br>
            Compressed: ${compressedSize} bytes (${compressionInfo})<br>
            Reduction: ${reduction}%<br>
            <strong>Recommendation:</strong> ${worthCompressing ? 'Compression beneficial' : 'Compression overhead may exceed benefit'}<br>
            <br>
            <strong>Actual RPC Message:</strong><br>
            <pre style="font-size: 12px; overflow: auto;">${JSON.stringify(actualRpcMessage, null, 2)}</pre>
          `
        }

        const rpcResultDiv = document.querySelector('#rpc-result')
        try {
          await this.connection.rpc(rpcMethod, rpcParams, rpcOptions)
          if (rpcResultDiv) {
            rpcResultDiv.textContent = 'RPC sent successfully'
          }
        } catch (error) {
          console.error('RPC error:', error)
          if (rpcResultDiv) {
            rpcResultDiv.textContent = `Error: ${error}`
          }
        }
      })
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
