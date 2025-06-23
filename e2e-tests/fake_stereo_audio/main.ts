import { getFakeMedia } from '../src/fake'
import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SignalingNotifyMessage,
  type ConnectionPublisher,
  type ConnectionSubscriber,
  type SoraConnection,
} from 'sora-js-sdk'

// リアルタイム音声解析クラス
class RealtimeAudioAnalyzer {
  private audioContext: AudioContext
  private source: MediaStreamAudioSourceNode
  private splitter: ChannelSplitterNode
  private analyserLeft: AnalyserNode
  private analyserRight: AnalyserNode
  private animationId: number | null = null
  private channelCount: number

  constructor(
    stream: MediaStream,
    private prefix: string,
  ) {
    this.audioContext = new AudioContext()
    this.source = this.audioContext.createMediaStreamSource(stream)
    this.channelCount = this.source.channelCount

    // チャンネル分離
    this.splitter = this.audioContext.createChannelSplitter(2)
    this.source.connect(this.splitter)

    // 左チャンネルのアナライザー
    this.analyserLeft = this.audioContext.createAnalyser()
    this.analyserLeft.fftSize = 2048
    this.analyserLeft.smoothingTimeConstant = 0.8
    this.splitter.connect(this.analyserLeft, 0)

    // 右チャンネルのアナライザー
    this.analyserRight = this.audioContext.createAnalyser()
    this.analyserRight.fftSize = 2048
    this.analyserRight.smoothingTimeConstant = 0.8

    if (this.channelCount >= 2) {
      this.splitter.connect(this.analyserRight, 1)
    }
  }

  private detectDominantFrequency(analyser: AnalyserNode): number {
    const dataArray = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(dataArray)

    let maxValue = Number.NEGATIVE_INFINITY
    let maxIndex = 0

    // 100Hz以上の周波数のみを対象にする（ノイズ除去）
    const minIndex = Math.floor((100 * analyser.fftSize) / this.audioContext.sampleRate)

    for (let i = minIndex; i < dataArray.length; i++) {
      if (dataArray[i] > maxValue) {
        maxValue = dataArray[i]
        maxIndex = i
      }
    }

    return (maxIndex * this.audioContext.sampleRate) / analyser.fftSize
  }

  private updateDisplay(): void {
    const leftFreq = this.detectDominantFrequency(this.analyserLeft)
    const rightFreq =
      this.channelCount >= 2 ? this.detectDominantFrequency(this.analyserRight) : leftFreq

    const isStereo = this.channelCount >= 2 && Math.abs(leftFreq - rightFreq) > 50

    // 表示更新
    const channelCountEl = document.querySelector(`#${this.prefix}-channel-count`)
    const leftFreqEl = document.querySelector(`#${this.prefix}-left-frequency`)
    const rightFreqEl = document.querySelector(`#${this.prefix}-right-frequency`)
    const isStereoEl = document.querySelector(`#${this.prefix}-is-stereo`)

    if (channelCountEl) channelCountEl.textContent = this.channelCount.toString()
    if (leftFreqEl) leftFreqEl.textContent = leftFreq.toFixed(1)
    if (rightFreqEl) rightFreqEl.textContent = rightFreq.toFixed(1)
    if (isStereoEl) isStereoEl.textContent = isStereo ? 'Yes' : 'No'

    // 次のフレーム
    this.animationId = requestAnimationFrame(() => this.updateDisplay())
  }

  start(): void {
    this.updateDisplay()
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    this.source.disconnect()
    this.audioContext.close()
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY

  setSoraJsSdkVersion()

  let sendClient: SoraSendClient | null = null
  let recvClient: SoraRecvClient | null = null
  let sendrecvClient1: SoraSendrecvClient | null = null
  let sendrecvClient2: SoraSendrecvClient | null = null
  let localAnalyzer: RealtimeAudioAnalyzer | null = null
  let remoteAnalyzer: RealtimeAudioAnalyzer | null = null

  document.querySelector('#connect')?.addEventListener('click', async () => {
    // connection IDをクリア
    const elem1 = document.querySelector('#connection-id-1')
    const elem2 = document.querySelector('#connection-id-2')
    if (elem1) elem1.textContent = ''
    if (elem2) elem2.textContent = ''

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)
    const roleMode = (document.querySelector('#role-mode') as HTMLSelectElement).value
    const forceStereoOutput = (document.querySelector('#force-stereo-output') as HTMLInputElement)
      .checked
    const useStereo = (document.querySelector('#use-stereo') as HTMLInputElement).checked

    const stream = getFakeMedia({
      audio: {
        frequency: 440,
        volume: 0.1,
        stereo: useStereo,
      },
    })

    // ローカル音声のリアルタイム解析を開始
    if (localAnalyzer) {
      localAnalyzer.stop()
    }
    localAnalyzer = new RealtimeAudioAnalyzer(stream, 'local')
    localAnalyzer.start()

    if (roleMode === 'sendonly-recvonly') {
      // sendonly/recvonlyモード
      // 受信側を先に接続
      recvClient = new SoraRecvClient(signalingUrl, channelId, secretKey)
      recvClient.setForceStereoOutput(forceStereoOutput)

      // リモートストリーム受信時のコールバックを設定
      recvClient.setOnStreamCallback((stream: MediaStream) => {
        if (remoteAnalyzer) {
          remoteAnalyzer.stop()
        }
        remoteAnalyzer = new RealtimeAudioAnalyzer(stream, 'remote')
        remoteAnalyzer.start()
      })

      await recvClient.connect()

      // 送信側を接続
      sendClient = new SoraSendClient(signalingUrl, channelId, secretKey)
      await sendClient.connect(stream)
    } else {
      // sendrecv×2モード
      // 1つ目のsendrecvクライアント（送信側）
      sendrecvClient1 = new SoraSendrecvClient(signalingUrl, channelId, secretKey)
      sendrecvClient1.setForceStereoOutput(forceStereoOutput)
      await sendrecvClient1.connect(stream)

      // 2つ目のsendrecvクライアント（受信側）
      const stream2 = getFakeMedia({
        audio: {
          frequency: 880, // 異なる周波数
          volume: 0.1,
          stereo: false, // モノラル
        },
      })

      sendrecvClient2 = new SoraSendrecvClient(signalingUrl, channelId, secretKey)
      sendrecvClient2.setForceStereoOutput(forceStereoOutput)

      // リモートストリーム受信時のコールバックを設定
      sendrecvClient2.setOnStreamCallback((stream: MediaStream) => {
        if (remoteAnalyzer) {
          remoteAnalyzer.stop()
        }
        remoteAnalyzer = new RealtimeAudioAnalyzer(stream, 'remote')
        remoteAnalyzer.start()
      })

      await sendrecvClient2.connect(stream2)
    }
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    if (localAnalyzer) {
      localAnalyzer.stop()
      localAnalyzer = null
    }
    if (remoteAnalyzer) {
      remoteAnalyzer.stop()
      remoteAnalyzer = null
    }
    if (sendClient) {
      await sendClient.disconnect()
      sendClient = null
    }
    if (recvClient) {
      await recvClient.disconnect()
      recvClient = null
    }
    if (sendrecvClient1) {
      await sendrecvClient1.disconnect()
      sendrecvClient1 = null
    }
    if (sendrecvClient2) {
      await sendrecvClient2.disconnect()
      sendrecvClient2 = null
    }
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    if (!sendClient) {
      return
    }

    const statsReport = await sendClient.getStats()
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
      // データ属性としても保存
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson)
    }

    // 受信側の統計情報も取得してステレオかどうか確認
    if (recvClient) {
      const recvStatsReport = await recvClient.getStats()
      const recvStatsReportJson: Record<string, unknown>[] = []
      for (const report of recvStatsReport.values()) {
        const reportJson: Record<string, unknown> = { id: report.id, type: report.type }
        for (const [key, value] of Object.entries(report)) {
          reportJson[key] = value
        }
        recvStatsReportJson.push(reportJson)
      }
      // 受信側の統計情報をデータ属性に保存
      const recvStatsDiv = document.createElement('div')
      recvStatsDiv.dataset.recvStatsReportJson = JSON.stringify(recvStatsReportJson)
      statsDiv.appendChild(recvStatsDiv)

      // テスト用のデータ属性を保存
      const localChannelCount = document.querySelector('#local-channel-count')?.textContent || '0'
      const localLeftFreq = document.querySelector('#local-left-frequency')?.textContent || '0'
      const localRightFreq = document.querySelector('#local-right-frequency')?.textContent || '0'
      const localIsStereo = document.querySelector('#local-is-stereo')?.textContent || 'No'

      const remoteChannelCount = document.querySelector('#remote-channel-count')?.textContent || '0'
      const remoteLeftFreq = document.querySelector('#remote-left-frequency')?.textContent || '0'
      const remoteRightFreq = document.querySelector('#remote-right-frequency')?.textContent || '0'
      const remoteIsStereo = document.querySelector('#remote-is-stereo')?.textContent || 'No'

      const analysisDiv = document.createElement('div')
      analysisDiv.id = 'audio-analysis'
      analysisDiv.dataset.analysis = JSON.stringify({
        local: {
          channelCount: Number.parseInt(localChannelCount),
          leftFrequency: Number.parseFloat(localLeftFreq),
          rightFrequency: Number.parseFloat(localRightFreq),
          isStereo: localIsStereo === 'Yes',
        },
        remote: {
          channelCount: Number.parseInt(remoteChannelCount),
          leftFrequency: Number.parseFloat(remoteLeftFreq),
          rightFrequency: Number.parseFloat(remoteRightFreq),
          isStereo: remoteIsStereo === 'Yes',
        },
      })
      statsDiv.appendChild(analysisDiv)
    }
  })
})

class SoraSendClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionPublisher

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onNotify.bind(this))
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream)

    const audioElement = document.querySelector<HTMLAudioElement>('#local-audio')
    if (audioElement !== null) {
      audioElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    const audioElement = document.querySelector<HTMLAudioElement>('#local-audio')
    if (audioElement !== null) {
      audioElement.srcObject = null
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onNotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector('#connection-id-1')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }
}

class SoraSendrecvClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionPublisher
  private onStreamCallback: ((stream: MediaStream) => void) | null = null

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)
    this.connection.on('notify', this.onNotify.bind(this))
    this.connection.on('track', this.onTrack.bind(this))
  }

  setForceStereoOutput(forceStereo: boolean): void {
    if (forceStereo) {
      this.connection.options.forceStereoOutput = true
    }
  }

  setOnStreamCallback(callback: (stream: MediaStream) => void): void {
    this.onStreamCallback = callback
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream)

    const audioElement = document.querySelector<HTMLAudioElement>('#local-audio')
    if (audioElement !== null) {
      audioElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    const audioElement = document.querySelector<HTMLAudioElement>('#local-audio')
    if (audioElement !== null) {
      audioElement.srcObject = null
    }

    const remoteAudioElement = document.querySelector<HTMLAudioElement>('#remote-audio')
    if (remoteAudioElement !== null) {
      remoteAudioElement.srcObject = null
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onNotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      // 空いているconnection-idスロットに表示
      const elem1 = document.querySelector('#connection-id-1')
      const elem2 = document.querySelector('#connection-id-2')

      if (elem1 && !elem1.textContent) {
        elem1.textContent = event.connection_id
      } else if (elem2 && !elem2.textContent) {
        elem2.textContent = event.connection_id
      }
    }
  }

  private onTrack(event: RTCTrackEvent): void {
    const audioElement = document.querySelector<HTMLAudioElement>('#remote-audio')
    if (audioElement !== null) {
      audioElement.srcObject = event.streams[0]
    }

    // ストリームコールバックを実行
    if (this.onStreamCallback && event.streams[0]) {
      this.onStreamCallback(event.streams[0])
    }
  }
}

class SoraRecvClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: ConnectionSubscriber
  private onStreamCallback: ((stream: MediaStream) => void) | null = null

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.connection = this.sora.recvonly(this.channelId, this.metadata, this.options)
    this.connection.on('track', this.onTrack.bind(this))
    this.connection.on('notify', this.onNotify.bind(this))
  }

  setForceStereoOutput(forceStereo: boolean): void {
    if (forceStereo) {
      this.connection.options.forceStereoOutput = true
    }
  }

  setOnStreamCallback(callback: (stream: MediaStream) => void): void {
    this.onStreamCallback = callback
  }

  async connect(): Promise<void> {
    await this.connection.connect()
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    const audioElement = document.querySelector<HTMLAudioElement>('#remote-audio')
    if (audioElement !== null) {
      audioElement.srcObject = null
    }
  }

  getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      return Promise.reject(new Error('PeerConnection is not ready'))
    }
    return this.connection.pc.getStats()
  }

  private onTrack(event: RTCTrackEvent): void {
    const audioElement = document.querySelector<HTMLAudioElement>('#remote-audio')
    if (audioElement !== null) {
      audioElement.srcObject = event.streams[0]
    }

    // ストリームコールバックを実行
    if (this.onStreamCallback && event.streams[0]) {
      this.onStreamCallback(event.streams[0])
    }
  }

  private onNotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === 'connection.created' &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector('#connection-id-2')
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }
}
