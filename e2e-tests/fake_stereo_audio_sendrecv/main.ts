import { getFakeMedia } from '../src/fake'
import { getChannelId, setSoraJsSdkVersion } from '../src/misc'

import Sora, {
  type SignalingNotifyMessage,
  type SoraConnection,
} from 'sora-js-sdk'

// Soraオブジェクトをwindowに公開（テスト用）
declare global {
  interface Window {
    Sora: typeof Sora
  }
}
window.Sora = Sora

// リアルタイム音声解析クラス
class RealtimeAudioAnalyzer {
  private audioContext: AudioContext
  private source: MediaStreamAudioSourceNode
  private splitter: ChannelSplitterNode
  private analyserLeft: AnalyserNode
  private analyserRight: AnalyserNode
  private animationId: number | null = null
  private channelCount: number

  constructor(stream: MediaStream, private prefix: string) {
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
    const minIndex = Math.floor(100 * analyser.fftSize / this.audioContext.sampleRate)
    
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
    const rightFreq = this.channelCount >= 2 
      ? this.detectDominantFrequency(this.analyserRight)
      : leftFreq
    
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

  let soraClient1: SoraSendRecvClient | null = null
  let soraClient2: SoraSendRecvClient | null = null
  let localAnalyzer1: RealtimeAudioAnalyzer | null = null
  let remoteAnalyzer1: RealtimeAudioAnalyzer | null = null
  let localAnalyzer2: RealtimeAudioAnalyzer | null = null
  let remoteAnalyzer2: RealtimeAudioAnalyzer | null = null

  document.querySelector('#connect')?.addEventListener('click', async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix)

    // 接続1の設定を取得
    const useStereo1 = (document.querySelector('#use-stereo-1') as HTMLInputElement).checked
    const forceStereoOutput1 = (document.querySelector('#force-stereo-output-1') as HTMLInputElement).checked

    // 接続2の設定を取得
    const useStereo2 = (document.querySelector('#use-stereo-2') as HTMLInputElement).checked
    const forceStereoOutput2 = (document.querySelector('#force-stereo-output-2') as HTMLInputElement).checked

    // 接続1を作成
    soraClient1 = new SoraSendRecvClient(signalingUrl, channelId, secretKey, '1')
    if (forceStereoOutput1) {
      soraClient1.setForceStereoOutput(true)
    }

    // 接続1用の音声ストリームを生成（440Hz基準）
    const stream1 = getFakeMedia({
      audio: {
        frequency: 440,
        volume: 0.1,
        stereo: useStereo1,
      },
    })

    // 接続1のローカル音声解析を開始
    if (localAnalyzer1) {
      localAnalyzer1.stop()
    }
    localAnalyzer1 = new RealtimeAudioAnalyzer(stream1, 'conn1-local')
    localAnalyzer1.start()

    // 接続1のリモートストリーム受信時のコールバックを設定
    soraClient1.setOnStreamCallback((remoteStream: MediaStream) => {
      if (remoteAnalyzer1) {
        remoteAnalyzer1.stop()
      }
      remoteAnalyzer1 = new RealtimeAudioAnalyzer(remoteStream, 'conn1-remote')
      remoteAnalyzer1.start()
    })

    // 接続1を開始
    await soraClient1.connect(stream1)

    // 少し待機してから接続2を開始
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 接続2を作成
    soraClient2 = new SoraSendRecvClient(signalingUrl, channelId, secretKey, '2')
    if (forceStereoOutput2) {
      soraClient2.setForceStereoOutput(true)
    }

    // 接続2用の音声ストリームを生成（880Hz基準、接続1と区別するため）
    const stream2 = getFakeMedia({
      audio: {
        frequency: 880,
        volume: 0.1,
        stereo: useStereo2,
      },
    })

    // 接続2のローカル音声解析を開始
    if (localAnalyzer2) {
      localAnalyzer2.stop()
    }
    localAnalyzer2 = new RealtimeAudioAnalyzer(stream2, 'conn2-local')
    localAnalyzer2.start()

    // 接続2のリモートストリーム受信時のコールバックを設定
    soraClient2.setOnStreamCallback((remoteStream: MediaStream) => {
      if (remoteAnalyzer2) {
        remoteAnalyzer2.stop()
      }
      remoteAnalyzer2 = new RealtimeAudioAnalyzer(remoteStream, 'conn2-remote')
      remoteAnalyzer2.start()
    })

    // 接続2を開始
    await soraClient2.connect(stream2)
  })

  document.querySelector('#disconnect')?.addEventListener('click', async () => {
    if (localAnalyzer1) {
      localAnalyzer1.stop()
      localAnalyzer1 = null
    }
    if (remoteAnalyzer1) {
      remoteAnalyzer1.stop()
      remoteAnalyzer1 = null
    }
    if (localAnalyzer2) {
      localAnalyzer2.stop()
      localAnalyzer2 = null
    }
    if (remoteAnalyzer2) {
      remoteAnalyzer2.stop()
      remoteAnalyzer2 = null
    }
    if (soraClient1) {
      await soraClient1.disconnect()
      soraClient1 = null
    }
    if (soraClient2) {
      await soraClient2.disconnect()
      soraClient2 = null
    }
  })

  document.querySelector('#get-stats')?.addEventListener('click', async () => {
    if (!soraClient1 || !soraClient2) {
      return
    }

    // 接続1の統計情報を取得
    const statsReport1 = await soraClient1.getStats()
    const statsDiv1 = document.querySelector('#stats-report-1') as HTMLElement
    if (statsDiv1) {
      let statsHtml = '<h3>接続1の統計情報</h3>'
      const statsReportJson1: Record<string, unknown>[] = []
      for (const report of statsReport1.values()) {
        statsHtml += `<h4>Type: ${report.type}</h4><ul>`
        const reportJson: Record<string, unknown> = { id: report.id, type: report.type }
        for (const [key, value] of Object.entries(report)) {
          if (key !== 'type' && key !== 'id') {
            statsHtml += `<li><strong>${key}:</strong> ${value}</li>`
            reportJson[key] = value
          }
        }
        statsHtml += '</ul>'
        statsReportJson1.push(reportJson)
      }
      statsDiv1.innerHTML = statsHtml
      statsDiv1.dataset.statsReportJson = JSON.stringify(statsReportJson1)
    }

    // 接続2の統計情報を取得
    const statsReport2 = await soraClient2.getStats()
    const statsDiv2 = document.querySelector('#stats-report-2') as HTMLElement
    if (statsDiv2) {
      let statsHtml = '<h3>接続2の統計情報</h3>'
      const statsReportJson2: Record<string, unknown>[] = []
      for (const report of statsReport2.values()) {
        statsHtml += `<h4>Type: ${report.type}</h4><ul>`
        const reportJson: Record<string, unknown> = { id: report.id, type: report.type }
        for (const [key, value] of Object.entries(report)) {
          if (key !== 'type' && key !== 'id') {
            statsHtml += `<li><strong>${key}:</strong> ${value}</li>`
            reportJson[key] = value
          }
        }
        statsHtml += '</ul>'
        statsReportJson2.push(reportJson)
      }
      statsDiv2.innerHTML = statsHtml
      statsDiv2.dataset.statsReportJson = JSON.stringify(statsReportJson2)
    }

    // テスト用の音声解析データを保存
    const analysisDiv = document.querySelector('#audio-analysis') as HTMLElement
    if (analysisDiv) {
      analysisDiv.dataset.analysis = JSON.stringify({
        connection1: {
          local: {
            channelCount: Number.parseInt(document.querySelector('#conn1-local-channel-count')?.textContent || '0'),
            leftFrequency: Number.parseFloat(document.querySelector('#conn1-local-left-frequency')?.textContent || '0'),
            rightFrequency: Number.parseFloat(document.querySelector('#conn1-local-right-frequency')?.textContent || '0'),
            isStereo: document.querySelector('#conn1-local-is-stereo')?.textContent === 'Yes'
          },
          remote: {
            channelCount: Number.parseInt(document.querySelector('#conn1-remote-channel-count')?.textContent || '0'),
            leftFrequency: Number.parseFloat(document.querySelector('#conn1-remote-left-frequency')?.textContent || '0'),
            rightFrequency: Number.parseFloat(document.querySelector('#conn1-remote-right-frequency')?.textContent || '0'),
            isStereo: document.querySelector('#conn1-remote-is-stereo')?.textContent === 'Yes'
          }
        },
        connection2: {
          local: {
            channelCount: Number.parseInt(document.querySelector('#conn2-local-channel-count')?.textContent || '0'),
            leftFrequency: Number.parseFloat(document.querySelector('#conn2-local-left-frequency')?.textContent || '0'),
            rightFrequency: Number.parseFloat(document.querySelector('#conn2-local-right-frequency')?.textContent || '0'),
            isStereo: document.querySelector('#conn2-local-is-stereo')?.textContent === 'Yes'
          },
          remote: {
            channelCount: Number.parseInt(document.querySelector('#conn2-remote-channel-count')?.textContent || '0'),
            leftFrequency: Number.parseFloat(document.querySelector('#conn2-remote-left-frequency')?.textContent || '0'),
            rightFrequency: Number.parseFloat(document.querySelector('#conn2-remote-right-frequency')?.textContent || '0'),
            isStereo: document.querySelector('#conn2-remote-is-stereo')?.textContent === 'Yes'
          }
        }
      })
    }
  })
})

class SoraSendRecvClient {
  private debug = false
  private channelId: string
  private metadata: { access_token: string }
  private options: object = {}

  private sora: SoraConnection
  private connection: any
  private remoteStream: MediaStream | null = null
  private onStreamCallback: ((stream: MediaStream) => void) | null = null
  private connectionNumber: string

  constructor(signalingUrl: string, channelId: string, secretKey: string, connectionNumber: string) {
    this.sora = Sora.connection(signalingUrl, this.debug)
    this.channelId = channelId
    this.connectionNumber = connectionNumber

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey }

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options)
    this.connection.on('track', this.onTrack.bind(this))
    this.connection.on('notify', this.onNotify.bind(this))
    
    // SDPデバッグ用
    this.connection.on('signaling', (event: any) => {
      if (event.type === 'answer') {
        console.log(`Connection ${this.connectionNumber} Answer SDP (stereo check):`, event.sdp?.includes('stereo=1'))
      }
    })
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

    const audioElement = document.querySelector<HTMLAudioElement>(`#local-audio-${this.connectionNumber}`)
    if (audioElement !== null) {
      audioElement.srcObject = stream
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect()

    const localAudioElement = document.querySelector<HTMLAudioElement>(`#local-audio-${this.connectionNumber}`)
    if (localAudioElement !== null) {
      localAudioElement.srcObject = null
    }
    
    const remoteAudioElement = document.querySelector<HTMLAudioElement>(`#remote-audio-${this.connectionNumber}`)
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

  private onTrack(event: RTCTrackEvent): void {
    this.remoteStream = event.streams[0]
    const audioElement = document.querySelector<HTMLAudioElement>(`#remote-audio-${this.connectionNumber}`)
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
      const connectionIdElement = document.querySelector(`#connection-id-${this.connectionNumber}`)
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id
      }
    }
  }
}