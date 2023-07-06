import { unzlibSync, zlibSync } from 'fflate'

import {
  createLyraWorker,
  isLyraInitialized,
  LyraState,
  transformPcmToLyra,
  transformLyraToPcm,
} from './lyra'
import {
  ConnectError,
  createDataChannelData,
  createDataChannelEvent,
  createDataChannelMessageEvent,
  createSignalingEvent,
  createSignalingMessage,
  createTimelineEvent,
  getPreKeyBundle,
  getSignalingNotifyAuthnMetadata,
  getSignalingNotifyData,
  isFirefox,
  isSafari,
  parseDataChannelEventData,
  trace,
} from './utils'
import {
  AudioCodecType,
  Callbacks,
  ConnectionOptions,
  JSONType,
  DataChannelConfiguration,
  RTCEncodedAudioFrame,
  SignalingConnectMessage,
  SignalingMessage,
  SignalingNotifyMessage,
  SignalingOfferMessage,
  SignalingOfferMessageDataChannel,
  SignalingPingMessage,
  SignalingPushMessage,
  SignalingReOfferMessage,
  SignalingRedirectMessage,
  SignalingReqStatsMessage,
  SignalingSwitchedMessage,
  SignalingUpdateMessage,
  SoraAbendTitle,
  SoraCloseEvent,
  SoraCloseEventInitDict,
  SoraCloseEventType,
  TransportType,
} from './types'
import SoraE2EE from '@sora/e2ee'

declare global {
  interface Algorithm {
    namedCurve: string
  }
}

/**
 * Sora との WebRTC 接続を扱う基底クラス
 *
 * @param signalingUrlCandidates - シグナリングに使用する URL の候補
 * @param role - ロール
 * @param channelId - チャネルID
 * @param metadata - メタデータ
 * @param options - コネクションオプション
 * @param debug - デバッグフラグ
 */
export default class ConnectionBase {
  /**
   * ロール(sendonly | sendrecv | recvonly)
   */
  role: string
  /**
   * チャネルID
   */
  channelId: string
  /**
   * メタデータ
   */
  metadata: JSONType | undefined
  /**
   * シグナリングに使用する URL 候補
   */
  signalingUrlCandidates: string | string[]
  /**
   * 接続オプション
   */
  options: ConnectionOptions
  /**
   * PeerConnection に渡す configuration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constraints: any
  /**
   * デバッグフラグ
   */
  debug: boolean
  /**
   * クライアントID
   */
  clientId: string | null
  /**
   * コネクションID
   */
  connectionId: string | null
  /**
   * リモートコネクションIDのリスト
   */
  remoteConnectionIds: string[]
  /**
   * メディアストリーム
   */
  stream: MediaStream | null
  /**
   * type offer に含まれる認証 metadata
   */
  authMetadata: JSONType
  /**
   * PeerConnection インスタンス
   */
  pc: RTCPeerConnection | null
  /**
   * サイマルキャストで使用する RTCRtpEncodingParameters のリスト
   */
  encodings: RTCRtpEncodingParameters[]
  /**
   * WS シグナリングで type offer メッセージを受信したシグナリング URL
   */
  connectedSignalingUrl: string
  /**
   * WS シグナリングで最初に type connect を送信したシグナリング URL
   */
  contactSignalingUrl: string
  /**
   * WebSocket インスタンス
   */
  private ws: WebSocket | null
  /**
   * 初回シグナリング時接続タイムアウト用のタイマーID
   */
  private connectionTimeoutTimerId: number
  /**
   * WebSocket 切断監視用のタイマーID
   */
  private monitorSignalingWebSocketEventTimerId: number
  /**
   * PeerConnection state 切断監視用のタイマーID
   */
  private monitorIceConnectionStateChangeTimerId: number
  /**
   * 接続中の DataChannel リスト
   */
  private soraDataChannels: {
    [key in string]?: RTCDataChannel
  }
  /**
   * 初回シグナリング接続時のタイムアウトに使用するタイムアウト時間(デフォルト 60000ms)
   */
  private connectionTimeout: number
  /**
   * シグナリング候補のURLへの接続確認タイムアウトに使用するタイムアウト時間(デフォルト 3000ms)
   */
  private signalingCandidateTimeout: number
  /**
   * 切断処理のタイムアウトに使用するタイムアウト時間(デフォルト 3000ms)
   */
  private disconnectWaitTimeout: number
  /**
   * audio / video の msid
   */
  private mids: {
    audio: string
    video: string
  }
  /**
   * シグナリングを DataChannel へ switch したかどうかのフラグ
   */
  private signalingSwitched: boolean
  /**
   * シグナリング type offer に含まれる DataChannel レコード
   */
  private signalingOfferMessageDataChannels: {
    [key in string]?: SignalingOfferMessageDataChannel
  }
  /**
   * イベントコールバックのリスト
   */
  protected callbacks: Callbacks
  /**
   * E2EE インスタンス
   *
   * @internal
   */
  protected e2ee: SoraE2EE | null
  /**
   * mid と AudioCodecType の対応づけを保持するマップ
   *
   * Lyra などのカスタム音声コーデック使用時に RTCRtpReceiver をどのコーデックでデコードすべきかを
   * 判別するために使われる
   *
   * カスタム音声コーデックが有効になっていない場合には空のままとなる
   */
  private midToAudioCodecType: Map<string, AudioCodecType> = new Map()
  /**
   * Lyra インスタンス
   */
  private lyra?: LyraState
  /**
   * キーとなる sender が setupSenderTransform で初期化済みかどうか
   */
  private senderStreamInitialized: WeakSet<RTCRtpSender> = new WeakSet()

  constructor(
    signalingUrlCandidates: string | string[],
    role: string,
    channelId: string,
    metadata: JSONType,
    options: ConnectionOptions,
    debug: boolean,
  ) {
    this.role = role
    this.channelId = channelId
    this.metadata = metadata
    this.signalingUrlCandidates = signalingUrlCandidates
    this.options = options
    // connection timeout の初期値をセットする
    this.connectionTimeout = 60000
    if (typeof this.options.timeout === 'number') {
      console.warn(
        '@deprecated timeout option will be removed in a future version. Use connectionTimeout.',
      )
      this.connectionTimeout = this.options.timeout
    }
    if (typeof this.options.connectionTimeout === 'number') {
      this.connectionTimeout = this.options.connectionTimeout
    }
    // WebSocket/DataChannel の disconnect timeout の初期値をセットする
    this.disconnectWaitTimeout = 3000
    if (typeof this.options.disconnectWaitTimeout === 'number') {
      this.disconnectWaitTimeout = this.options.disconnectWaitTimeout
    }
    // signalingUrlCandidates に設定されている URL への接続チェック timeout の初期値をセットする
    this.signalingCandidateTimeout = 3000
    if (typeof this.options.signalingCandidateTimeout === 'number') {
      this.signalingCandidateTimeout = this.options.signalingCandidateTimeout
    }
    this.constraints = null
    this.debug = debug
    this.clientId = null
    this.connectionId = null
    this.remoteConnectionIds = []
    this.stream = null
    this.ws = null
    this.pc = null
    this.encodings = []
    this.callbacks = {
      disconnect: (): void => {},
      push: (): void => {},
      addstream: (): void => {},
      track: (): void => {},
      removestream: (): void => {},
      removetrack: (): void => {},
      notify: (): void => {},
      log: (): void => {},
      timeout: (): void => {},
      timeline: (): void => {},
      signaling: (): void => {},
      message: (): void => {},
      datachannel: (): void => {},
    }
    this.authMetadata = null
    this.e2ee = null
    this.connectionTimeoutTimerId = 0
    this.monitorSignalingWebSocketEventTimerId = 0
    this.monitorIceConnectionStateChangeTimerId = 0
    this.soraDataChannels = {}
    this.mids = {
      audio: '',
      video: '',
    }
    this.signalingSwitched = false
    this.signalingOfferMessageDataChannels = {}
    this.connectedSignalingUrl = ''
    this.contactSignalingUrl = ''
    if (isLyraInitialized()) {
      this.lyra = new LyraState()
    }
  }

  /**
   * SendRecv Object で発火するイベントのコールバックを設定するメソッド
   *
   * @example
   * ```
   * const sendrecv = connection.sendrecv("sora");
   * sendrecv.on("track", (event) => {
   *   // callback 処理
   * });
   * ```
   *
   * @remarks
   * addstream イベントは非推奨です. track イベントを使用してください
   *
   * removestream イベントは非推奨です. removetrack イベントを使用してください
   *
   * @param kind - イベントの種類(disconnect, push, track, removetrack, notify, log, timeout, timeline, signaling, message, datachannel)
   * @param callback - コールバック関数
   *
   * @public
   */
  on<T extends keyof Callbacks, U extends Callbacks[T]>(kind: T, callback: U): void {
    // @deprecated message
    if (kind === 'addstream') {
      console.warn(
        '@deprecated addstream callback will be removed in a future version. Use track callback.',
      )
    } else if (kind === 'removestream') {
      console.warn(
        '@deprecated removestream callback will be removed in a future version. Use removetrack callback.',
      )
    }
    if (kind in this.callbacks) {
      this.callbacks[kind] = callback
    }
  }

  /**
   * audio track を停止するメソッド
   *
   * @example
   * ```
   * const sendrecv = connection.sendrecv("sora");
   * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
   * await sendrecv.connect(mediaStream);
   *
   * sendrecv.stopAudioTrack(mediaStream);
   * ```
   *
   * @remarks
   * stream の audio track を停止後、PeerConnection の senders から対象の sender を削除します
   *
   * @param stream - audio track を削除する MediaStream
   *
   * @public
   */
  stopAudioTrack(stream: MediaStream): Promise<void> {
    for (const track of stream.getAudioTracks()) {
      track.enabled = false
    }
    return new Promise((resolve) => {
      // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
      setTimeout(async () => {
        for (const track of stream.getAudioTracks()) {
          track.stop()
          stream.removeTrack(track)
          if (this.pc !== null) {
            const sender = this.pc.getSenders().find((s) => {
              return s.track && s.track.id === track.id
            })
            if (sender) {
              await sender.replaceTrack(null)
            }
          }
        }
        resolve()
      }, 100)
    })
  }

  /**
   * video track を停止するメソッド
   *
   * @example
   * ```
   * const sendrecv = connection.sendrecv("sora");
   * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
   * await sendrecv.connect(mediaStream);
   *
   * sendrecv.stopVideoTrack(mediaStream);
   * ```
   *
   * @remarks
   * stream の video track を停止後、PeerConnection の senders から対象の sender を削除します
   *
   * @param stream - video track を削除する MediaStream
   *
   * @public
   */
  stopVideoTrack(stream: MediaStream): Promise<void> {
    for (const track of stream.getVideoTracks()) {
      track.enabled = false
    }
    return new Promise((resolve) => {
      // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
      setTimeout(async () => {
        for (const track of stream.getVideoTracks()) {
          track.stop()
          stream.removeTrack(track)
          if (this.pc !== null) {
            const sender = this.pc.getSenders().find((s) => {
              return s.track && s.track.id === track.id
            })
            if (sender) {
              await sender.replaceTrack(null)
            }
          }
        }
        resolve()
      }, 100)
    })
  }

  /**
   * audio track を入れ替えするメソッド
   *
   * @example
   * ```
   * const sendrecv = connection.sendrecv("sora");
   * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
   * await sendrecv.connect(mediaStream);
   *
   * const replacedMediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
   * await sendrecv.replaceAudioTrack(mediaStream, replacedMediaStream.getAudioTracks()[0]);
   * ```
   *
   * @remarks
   * stream の audio track を停止後、新しい audio track をセットします
   *
   * @param stream - audio track を削除する MediaStream
   * @param audioTrack - 新しい audio track
   *
   * @public
   */
  async replaceAudioTrack(stream: MediaStream, audioTrack: MediaStreamTrack): Promise<void> {
    await this.stopAudioTrack(stream)
    const transceiver = this.getAudioTransceiver()
    if (transceiver === null) {
      throw new Error('Unable to set an audio track. Audio track sender is undefined')
    }
    stream.addTrack(audioTrack)
    await transceiver.sender.replaceTrack(audioTrack)
    await this.setupSenderTransform(transceiver.sender)
  }

  /**
   * video track を入れ替えするメソッド
   *
   * @example
   * ```
   * const sendrecv = connection.sendrecv("sora");
   * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
   * await sendrecv.connect(mediaStream);
   *
   * const replacedMediaStream = await navigator.mediaDevices.getUserMedia({video: true});
   * await sendrecv.replaceVideoTrack(mediaStream, replacedMediaStream.getVideoTracks()[0]);
   * ```
   *
   * @remarks
   * stream の video track を停止後、新しい video track をセットします
   *
   * @param stream - video track を削除する MediaStream
   * @param videoTrack - 新しい video track
   *
   * @public
   */
  async replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void> {
    await this.stopVideoTrack(stream)
    const transceiver = this.getVideoTransceiver()
    if (transceiver === null) {
      throw new Error('Unable to set video track. Video track sender is undefined')
    }
    stream.addTrack(videoTrack)
    await transceiver.sender.replaceTrack(videoTrack)
    await this.setupSenderTransform(transceiver.sender)
  }

  /**
   * connect 処理中に例外が発生した場合の切断処理をするメソッド
   */
  private signalingTerminate(): void {
    for (const key of Object.keys(this.soraDataChannels)) {
      const dataChannel = this.soraDataChannels[key]
      if (dataChannel) {
        dataChannel.close()
      }
      delete this.soraDataChannels[key]
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    if (this.pc) {
      this.pc.close()
    }
    if (this.e2ee) {
      this.e2ee.terminateWorker()
    }
    this.initializeConnection()
  }

  /**
   * PeerConnection の state に異常が発生した場合の切断処理をするメソッド
   *
   * @param title - disconnect callback に渡すイベントのタイトル
   */
  private abendPeerConnectionState(title: SoraAbendTitle): void {
    this.clearMonitorIceConnectionStateChange()
    // callback を止める
    if (this.pc) {
      this.pc.ondatachannel = null
      this.pc.oniceconnectionstatechange = null
      this.pc.onicegatheringstatechange = null
      this.pc.onconnectionstatechange = null
    }
    if (this.ws) {
      // onclose はログを吐く専用に残す
      this.ws.onclose = (event) => {
        this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason })
      }
      this.ws.onmessage = null
      this.ws.onerror = null
    }
    for (const key of Object.keys(this.soraDataChannels)) {
      const dataChannel = this.soraDataChannels[key]
      if (dataChannel) {
        // onclose はログを吐く専用に残す
        dataChannel.onclose = (event) => {
          const channel = event.currentTarget as RTCDataChannel
          this.writeDataChannelTimelineLog('onclose', channel)
          this.trace('CLOSE DATA CHANNEL', channel.label)
        }
        dataChannel.onmessage = null
        dataChannel.onerror = null
      }
    }
    // DataChannel を終了する
    for (const key of Object.keys(this.soraDataChannels)) {
      const dataChannel = this.soraDataChannels[key]
      if (dataChannel) {
        dataChannel.close()
      }
      delete this.soraDataChannels[key]
    }
    // WebSocket を終了する
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    // PeerConnection を終了する
    if (this.pc) {
      this.pc.close()
    }
    // E2EE worker を終了する
    if (this.e2ee) {
      this.e2ee.terminateWorker()
    }
    this.initializeConnection()
    const event = this.soraCloseEvent('abend', title)
    this.callbacks.disconnect(event)
    this.writeSoraTimelineLog('disconnect-abend', event)
  }

  /**
   * 何かしらの異常があった場合の切断処理
   *
   * @param title - disconnect callback に渡すイベントのタイトル
   * @param params - 切断時の状況を入れる Record
   */
  private async abend(title: SoraAbendTitle, params?: Record<string, unknown>): Promise<void> {
    this.clearMonitorIceConnectionStateChange()
    // callback を止める
    if (this.pc) {
      this.pc.ondatachannel = null
      this.pc.oniceconnectionstatechange = null
      this.pc.onicegatheringstatechange = null
      this.pc.onconnectionstatechange = null
    }
    if (this.ws) {
      // onclose はログを吐く専用に残す
      this.ws.onclose = (event) => {
        this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason })
      }
      this.ws.onmessage = null
      this.ws.onerror = null
    }
    for (const key of Object.keys(this.soraDataChannels)) {
      const dataChannel = this.soraDataChannels[key]
      if (dataChannel) {
        // onclose はログを吐く専用に残す
        dataChannel.onclose = (event) => {
          const channel = event.currentTarget as RTCDataChannel
          this.writeDataChannelTimelineLog('onclose', channel)
          this.trace('CLOSE DATA CHANNEL', channel.label)
        }
        dataChannel.onmessage = null
        dataChannel.onerror = null
      }
    }
    // 終了処理を開始する
    if (this.soraDataChannels.signaling) {
      const message = { type: 'disconnect', reason: title }
      if (
        this.signalingOfferMessageDataChannels.signaling &&
        this.signalingOfferMessageDataChannels.signaling.compress === true
      ) {
        const binaryMessage = new TextEncoder().encode(JSON.stringify(message))
        const zlibMessage = zlibSync(binaryMessage, {})
        if (this.soraDataChannels.signaling.readyState === 'open') {
          // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
          try {
            this.soraDataChannels.signaling.send(zlibMessage)
            this.writeDataChannelSignalingLog(
              'send-disconnect',
              this.soraDataChannels.signaling,
              message,
            )
          } catch (e) {
            const errorMessage = (e as Error).message
            this.writeDataChannelSignalingLog(
              'failed-to-send-disconnect',
              this.soraDataChannels.signaling,
              errorMessage,
            )
          }
        }
      } else {
        if (this.soraDataChannels.signaling.readyState === 'open') {
          // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
          try {
            this.soraDataChannels.signaling.send(JSON.stringify(message))
            this.writeDataChannelSignalingLog(
              'send-disconnect',
              this.soraDataChannels.signaling,
              message,
            )
          } catch (e) {
            const errorMessage = (e as Error).message
            this.writeDataChannelSignalingLog(
              'failed-to-send-disconnect',
              this.soraDataChannels.signaling,
              errorMessage,
            )
          }
        }
      }
    }
    for (const key of Object.keys(this.soraDataChannels)) {
      const dataChannel = this.soraDataChannels[key]
      if (dataChannel) {
        dataChannel.onerror = null
        dataChannel.close()
      }
      delete this.soraDataChannels[key]
    }
    await this.disconnectWebSocket(title)
    await this.disconnectPeerConnection()
    if (this.e2ee) {
      this.e2ee.terminateWorker()
    }
    this.initializeConnection()
    if (title === 'WEBSOCKET-ONCLOSE' && params && (params.code === 1000 || params.code === 1005)) {
      const event = this.soraCloseEvent('normal', 'DISCONNECT', params)
      this.writeSoraTimelineLog('disconnect-normal', event)
      this.callbacks.disconnect(event)
      return
    }
    const event = this.soraCloseEvent('abend', title, params)
    this.writeSoraTimelineLog('disconnect-abend', event)
    this.callbacks.disconnect(this.soraCloseEvent('abend', title, params))
  }

  /**
   * 接続状態の初期化をするメソッド
   */
  private initializeConnection(): void {
    this.clientId = null
    this.connectionId = null
    this.remoteConnectionIds = []
    this.stream = null
    this.ws = null
    this.pc = null
    this.encodings = []
    this.authMetadata = null
    this.e2ee = null
    this.soraDataChannels = {}
    this.mids = {
      audio: '',
      video: '',
    }
    this.signalingSwitched = false
    this.signalingOfferMessageDataChannels = {}
    this.contactSignalingUrl = ''
    this.connectedSignalingUrl = ''
    this.clearConnectionTimeout()
  }

  /**
   * WebSocket を切断するメソッド
   *
   * @remarks
   * 正常/異常どちらの切断でも使用する
   *
   * @param title - type disconnect 時の reason
   */
  private disconnectWebSocket(
    title: SoraAbendTitle | 'NO-ERROR',
  ): Promise<{ code: number; reason: string } | null> {
    let timerId = 0
    if (this.signalingSwitched) {
      if (this.ws) {
        this.ws.close()
        this.ws = null
      }
      return Promise.resolve(null)
    }
    return new Promise((resolve, _) => {
      if (!this.ws) {
        return resolve(null)
      }
      this.ws.onclose = (event) => {
        if (this.ws) {
          this.ws.close()
          this.ws = null
        }
        clearTimeout(timerId)
        this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason })
        return resolve({ code: event.code, reason: event.reason })
      }
      if (this.ws.readyState === 1) {
        const message = { type: 'disconnect', reason: title }
        this.ws.send(JSON.stringify(message))
        this.writeWebSocketSignalingLog('send-disconnect', message)
        // WebSocket 切断を待つ
        timerId = setTimeout(() => {
          if (this.ws) {
            this.ws.close()
            this.ws = null
          }
          resolve({ code: 1006, reason: '' })
        }, this.disconnectWaitTimeout)
      } else {
        // ws の state が open ではない場合は後処理をして終わる
        this.ws.close()
        this.ws = null
        return resolve(null)
      }
    })
  }

  /**
   * DataChannel を切断するメソッド
   *
   * @remarks
   * 正常/異常どちらの切断でも使用する
   */
  private disconnectDataChannel(): Promise<{ code: number; reason: string } | null> {
    // DataChannel の強制終了処理
    const closeDataChannels = () => {
      for (const key of Object.keys(this.soraDataChannels)) {
        const dataChannel = this.soraDataChannels[key]
        if (dataChannel) {
          dataChannel.onerror = null
          dataChannel.close()
        }
        delete this.soraDataChannels[key]
      }
    }
    return new Promise((resolve, reject) => {
      // DataChannel label signaling が存在しない場合は強制終了処理をする
      if (!this.soraDataChannels.signaling) {
        closeDataChannels()
        return resolve({ code: 4999, reason: '' })
      }
      // disconnectWaitTimeout で指定された時間経過しても切断しない場合は強制終了処理をする
      const disconnectWaitTimeoutId = setTimeout(() => {
        closeDataChannels()
        return reject()
      }, this.disconnectWaitTimeout)

      const onClosePromises: Promise<void>[] = []
      for (const key of Object.keys(this.soraDataChannels)) {
        const dataChannel = this.soraDataChannels[key]
        if (dataChannel) {
          // onerror が発火した場合は強制終了処理をする
          dataChannel.onerror = () => {
            clearTimeout(disconnectWaitTimeoutId)
            closeDataChannels()
            return resolve({ code: 4999, reason: '' })
          }
          // すべての DataChannel の readyState が "closed" になったことを確認する Promsie を生成する
          const p = (): Promise<void> => {
            return new Promise((res, _) => {
              // disconnectWaitTimeout 時間を過ぎた場合に終了させるための counter を作成する
              let counter = 0
              // onclose 内で readyState の変化を待つと非同期のまま複数回 disconnect を呼んだ場合に
              // callback が上書きされて必ず DISCONNECT-TIMEOUT になってしまうので setInterval を使う
              const timerId = setInterval(() => {
                counter++
                if (dataChannel.readyState === 'closed') {
                  clearInterval(timerId)
                  res()
                }
                if (this.disconnectWaitTimeout < counter * 100) {
                  res()
                  clearInterval(timerId)
                }
              }, 100)
            })
          }
          onClosePromises.push(p())
        }
      }
      // すべての DataChannel で onclose が発火した場合は resolve にする
      Promise.all(onClosePromises)
        .then(() => {
          // dataChannels が空の場合は切断処理が終わっているとみなす
          if (0 === Object.keys(this.soraDataChannels).length) {
            resolve(null)
          } else {
            resolve({ code: 4999, reason: '' })
          }
        })
        .finally(() => {
          closeDataChannels()
          clearTimeout(disconnectWaitTimeoutId)
        })
      const message = { type: 'disconnect', reason: 'NO-ERROR' }
      if (
        this.signalingOfferMessageDataChannels.signaling &&
        this.signalingOfferMessageDataChannels.signaling.compress === true
      ) {
        const binaryMessage = new TextEncoder().encode(JSON.stringify(message))
        const zlibMessage = zlibSync(binaryMessage, {})
        if (this.soraDataChannels.signaling.readyState === 'open') {
          // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
          try {
            this.soraDataChannels.signaling.send(zlibMessage)
            this.writeDataChannelSignalingLog(
              'send-disconnect',
              this.soraDataChannels.signaling,
              message,
            )
          } catch (e) {
            const errorMessage = (e as Error).message
            this.writeDataChannelSignalingLog(
              'failed-to-send-disconnect',
              this.soraDataChannels.signaling,
              errorMessage,
            )
          }
        }
      } else {
        if (this.soraDataChannels.signaling.readyState === 'open') {
          // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
          try {
            this.soraDataChannels.signaling.send(JSON.stringify(message))
            this.writeDataChannelSignalingLog(
              'send-disconnect',
              this.soraDataChannels.signaling,
              message,
            )
          } catch (e) {
            const errorMessage = (e as Error).message
            this.writeDataChannelSignalingLog(
              'failed-to-send-disconnect',
              this.soraDataChannels.signaling,
              errorMessage,
            )
          }
        }
      }
    })
  }

  /**
   * PeerConnection を切断するメソッド
   *
   * @remarks
   * 正常/異常どちらの切断でも使用する
   */
  private disconnectPeerConnection(): Promise<void> {
    return new Promise((resolve, _) => {
      if (this.pc && this.pc.connectionState !== 'closed') {
        this.pc.close()
      }
      return resolve()
    })
  }

  /**
   * 切断処理をするメソッド
   *
   * @example
   * ```
   * await sendrecv.disconnect();
   * ```
   *
   * @public
   */
  async disconnect(): Promise<void> {
    this.clearMonitorIceConnectionStateChange()
    // callback を止める
    if (this.pc) {
      this.pc.ondatachannel = null
      this.pc.oniceconnectionstatechange = null
      this.pc.onicegatheringstatechange = null
      this.pc.onconnectionstatechange = null
    }
    if (this.ws) {
      // onclose はログを吐く専用に残す
      this.ws.onclose = (event) => {
        this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason })
      }
      this.ws.onmessage = null
      this.ws.onerror = null
    }
    for (const key of Object.keys(this.soraDataChannels)) {
      const dataChannel = this.soraDataChannels[key]
      if (dataChannel) {
        dataChannel.onmessage = null
        // onclose はログを吐く専用に残す
        dataChannel.onclose = (event): void => {
          const channel = event.currentTarget as RTCDataChannel
          this.writeDataChannelTimelineLog('onclose', channel)
          this.trace('CLOSE DATA CHANNEL', channel.label)
        }
      }
    }
    let event = null
    if (this.signalingSwitched) {
      // DataChannel の切断処理がタイムアウトした場合は event を abend に差し替える
      try {
        const reason = await this.disconnectDataChannel()
        if (reason !== null) {
          event = this.soraCloseEvent('normal', 'DISCONNECT', reason)
        }
      } catch (_) {
        event = this.soraCloseEvent('abend', 'DISCONNECT-TIMEOUT')
      }
      await this.disconnectWebSocket('NO-ERROR')
      await this.disconnectPeerConnection()
    } else {
      const reason = await this.disconnectWebSocket('NO-ERROR')
      await this.disconnectPeerConnection()
      if (reason !== null) {
        event = this.soraCloseEvent('normal', 'DISCONNECT', reason)
      }
    }
    if (this.e2ee) {
      this.e2ee.terminateWorker()
    }
    this.initializeConnection()
    if (event) {
      if (event.type === 'abend') {
        this.writeSoraTimelineLog('disconnect-abend', event)
      } else if (event.type === 'normal') {
        this.writeSoraTimelineLog('disconnect-normal', event)
      }
      this.callbacks.disconnect(event)
    }
  }

  /**
   * E2EE の初期設定をするメソッド
   */
  protected setupE2EE(): void {
    if (this.options.e2ee === true) {
      this.e2ee = new SoraE2EE()
      this.e2ee.onWorkerDisconnect = async (): Promise<void> => {
        await this.abend('INTERNAL-ERROR', { reason: 'CRASH-E2EE-WORKER' })
      }
      this.e2ee.startWorker()
    }
  }

  /**
   * E2EE を開始するメソッド
   */
  protected startE2EE(): void {
    if (this.options.e2ee === true && this.e2ee) {
      if (!this.connectionId) {
        const error = new Error()
        error.message = `E2EE failed. Self connectionId is null`
        throw error
      }
      this.e2ee.clearWorker()
      const result = this.e2ee.start(this.connectionId)
      this.e2ee.postSelfSecretKeyMaterial(
        this.connectionId,
        result.selfKeyId,
        result.selfSecretKeyMaterial,
      )
    }
  }

  /**
   * シグナリングに使う WebSocket インスタンスを作成するメソッド
   *
   * @remarks
   * シグナリング候補の URL 一覧に順に接続します
   *
   * 接続できた URL がない場合は例外が発生します
   *
   * @param signalingUrlCandidates - シグナリング候補の URL. 後方互換のため string | string[] を受け取る
   *
   * @returns
   * 接続できた WebScoket インスタンスを返します
   */
  protected async getSignalingWebSocket(
    signalingUrlCandidates: string | string[],
  ): Promise<WebSocket> {
    if (typeof signalingUrlCandidates === 'string') {
      // signaling url の候補が文字列の場合
      const signalingUrl = signalingUrlCandidates
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(signalingUrl)
        ws.onclose = (event): void => {
          const error = new ConnectError(
            `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`,
          )
          error.code = event.code
          error.reason = event.reason
          this.writeWebSocketTimelineLog('onclose', error)
          reject(error)
        }
        ws.onopen = (_): void => {
          resolve(ws)
        }
      })
    } else if (Array.isArray(signalingUrlCandidates)) {
      // signaling url の候補が Array の場合
      // すでに候補の WebSocket が発見されているかどうかのフラグ
      let resolved = false
      const testSignalingUrlCandidate = (signalingUrl: string): Promise<WebSocket> => {
        return new Promise((resolve, reject) => {
          const ws = new WebSocket(signalingUrl)
          // 一定時間経過しても反応がなかった場合は処理を中断する
          const timerId = setTimeout(() => {
            this.writeWebSocketSignalingLog('signaling-url-candidate', {
              type: 'timeout',
              url: ws.url,
            })
            if (ws && !resolved) {
              ws.onclose = null
              ws.onerror = null
              ws.onopen = null
              ws.close()
              reject()
            }
          }, this.signalingCandidateTimeout)
          ws.onclose = (event): void => {
            this.writeWebSocketSignalingLog('signaling-url-candidate', {
              type: 'close',
              url: ws.url,
              message: `WebSocket closed`,
              code: event.code,
              reason: event.reason,
            })
            if (ws) {
              ws.close()
            }
            clearInterval(timerId)
            reject()
          }
          ws.onerror = (_): void => {
            this.writeWebSocketSignalingLog('signaling-url-candidate', {
              type: 'error',
              url: ws.url,
              message: `Failed to connect WebSocket`,
            })
            if (ws) {
              ws.onclose = null
              ws.close()
            }
            clearInterval(timerId)
            reject()
          }
          ws.onopen = (_): void => {
            if (ws) {
              clearInterval(timerId)
              if (resolved) {
                this.writeWebSocketSignalingLog('signaling-url-candidate', {
                  type: 'open',
                  url: ws.url,
                  selected: false,
                })
                ws.onerror = null
                ws.onclose = null
                ws.onopen = null
                ws.close()
                reject()
              } else {
                this.writeWebSocketSignalingLog('signaling-url-candidate', {
                  type: 'open',
                  url: ws.url,
                  selected: true,
                })
                ws.onerror = null
                ws.onclose = null
                ws.onopen = null
                resolved = true
                resolve(ws)
              }
            }
          }
        })
      }
      try {
        return await Promise.any(
          signalingUrlCandidates.map((signalingUrl) => testSignalingUrlCandidate(signalingUrl)),
        )
      } catch (e) {
        throw new ConnectError('Signaling failed. All signaling URL candidates failed to connect')
      }
    }
    throw new ConnectError('Signaling failed. Invalid format signaling URL candidates')
  }

  /**
   * シグナリング処理を行うメソッド
   *
   * @remarks
   * シグナリング候補の URL 一覧に順に接続します
   *
   * 接続できた URL がない場合は例外が発生します
   *
   * @param ws - WebSocket インスタンス
   * @param redirect - クラスター接続時にリダイレクトされた場合のフラグ
   *
   * @returns
   * Sora から受け取った type offer メッセージを返します
   */
  protected async signaling(ws: WebSocket, redirect = false): Promise<SignalingOfferMessage> {
    const offer = await this.createOffer()
    this.trace('CREATE OFFER', offer)
    return new Promise((resolve, reject) => {
      this.writeWebSocketSignalingLog('new-websocket', ws.url)
      // websocket の各 callback を設定する
      ws.binaryType = 'arraybuffer'
      ws.onclose = (event) => {
        const error = new ConnectError(
          `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`,
        )
        error.code = event.code
        error.reason = event.reason
        this.writeWebSocketTimelineLog('onclose', error)
        this.signalingTerminate()
        reject(error)
      }
      ws.onmessage = async (event): Promise<void> => {
        // E2EE 時専用処理
        if (event.data instanceof ArrayBuffer) {
          this.writeWebSocketSignalingLog('onmessage-e2ee', event.data)
          this.signalingOnMessageE2EE(event.data)
          return
        }
        if (typeof event.data !== 'string') {
          throw new Error('Received invalid signaling data')
        }
        const message = JSON.parse(event.data) as SignalingMessage
        if (message.type == 'offer') {
          this.writeWebSocketSignalingLog('onmessage-offer', message)
          this.signalingOnMessageTypeOffer(message)
          this.connectedSignalingUrl = ws.url
          resolve(message)
        } else if (message.type == 'update') {
          this.writeWebSocketSignalingLog('onmessage-update', message)
          await this.signalingOnMessageTypeUpdate(message)
        } else if (message.type == 're-offer') {
          this.writeWebSocketSignalingLog('onmessage-re-offer', message)
          await this.signalingOnMessageTypeReOffer(message)
        } else if (message.type == 'ping') {
          await this.signalingOnMessageTypePing(message)
        } else if (message.type == 'push') {
          this.callbacks.push(message, 'websocket')
        } else if (message.type == 'notify') {
          if (message.event_type === 'connection.created') {
            this.writeWebSocketTimelineLog('notify-connection.created', message)
          } else if (message.event_type === 'connection.destroyed') {
            this.writeWebSocketTimelineLog('notify-connection.destroyed', message)
          }
          this.signalingOnMessageTypeNotify(message, 'websocket')
        } else if (message.type == 'switched') {
          this.writeWebSocketSignalingLog('onmessage-switched', message)
          this.signalingOnMessageTypeSwitched(message)
        } else if (message.type == 'redirect') {
          this.writeWebSocketSignalingLog('onmessage-redirect', message)
          try {
            const redirectMessage = await this.signalingOnMessageTypeRedirect(message)
            resolve(redirectMessage)
          } catch (error) {
            reject(error)
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ;(async () => {
        let signalingMessage: SignalingConnectMessage
        try {
          signalingMessage = createSignalingMessage(
            offer.sdp || '',
            this.role,
            this.channelId,
            this.metadata,
            this.options,
            redirect,
          )
        } catch (error) {
          reject(error)
          return
        }
        if (signalingMessage.e2ee && this.e2ee) {
          const initResult = await this.e2ee.init()
          // @ts-ignore signalingMessage の e2ee が true の場合は signalingNotifyMetadata が必ず object になる
          signalingMessage['signaling_notify_metadata']['pre_key_bundle'] = initResult
        }
        this.trace('SIGNALING CONNECT MESSAGE', signalingMessage)
        if (ws) {
          ws.send(JSON.stringify(signalingMessage))
          this.writeWebSocketSignalingLog(`send-${signalingMessage.type}`, signalingMessage)
          this.ws = ws
          // 初回に接続した URL を状態管理する
          if (!redirect) {
            this.contactSignalingUrl = ws.url
            this.writeWebSocketSignalingLog('contact-signaling-url', this.contactSignalingUrl)
          }
        }
      })()
    })
  }

  /**
   * PeerConnection 接続処理をするメソッド
   *
   * @param message - シグナリング処理で受け取った type offer メッセージ
   */
  protected async connectPeerConnection(message: SignalingOfferMessage): Promise<void> {
    let config = Object.assign({}, message.config)
    if (this.e2ee || this.lyra) {
      // @ts-ignore https://w3c.github.io/webrtc-encoded-transform/#specification
      config = Object.assign({ encodedInsertableStreams: true }, config)
    }
    if (window.RTCPeerConnection.generateCertificate !== undefined) {
      const certificate = await window.RTCPeerConnection.generateCertificate({
        name: 'ECDSA',
        namedCurve: 'P-256',
      })
      config = Object.assign({ certificates: [certificate] }, config)
    }
    this.trace('PEER CONNECTION CONFIG', config)
    this.writePeerConnectionTimelineLog('new-peerconnection', config)
    // @ts-ignore Chrome の場合は第2引数に goog オプションを渡すことができる
    this.pc = new window.RTCPeerConnection(config, this.constraints)
    this.pc.oniceconnectionstatechange = (_): void => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog('oniceconnectionstatechange', {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        })
        this.trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this.pc.iceConnectionState)
      }
    }
    this.pc.onicegatheringstatechange = (_): void => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog('onicegatheringstatechange', {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        })
      }
    }
    this.pc.onconnectionstatechange = (_): void => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog('onconnectionstatechange', {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        })
      }
    }
    this.pc.ondatachannel = (event): void => {
      this.onDataChannel(event)
    }
    return
  }

  /**
   * setRemoteDescription 処理を行うメソッド
   *
   * @param message - シグナリング処理で受け取った type offer | type update | type re-offer メッセージ
   */
  protected async setRemoteDescription(
    message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage,
  ): Promise<void> {
    if (!this.pc) {
      return
    }

    const sdp = this.processOfferSdp(message.sdp)
    const sessionDescription = new RTCSessionDescription({ type: 'offer', sdp })
    await this.pc.setRemoteDescription(sessionDescription)
    this.writePeerConnectionTimelineLog('set-remote-description', sessionDescription)
    return
  }

  /**
   * createAnswer 処理を行うメソッド
   *
   * @remarks
   * サイマルキャスト用の setParameters 処理もここで行う
   *
   * @param message - シグナリング処理で受け取った type offer | type update | type re-offer メッセージ
   */
  protected async createAnswer(
    message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage,
  ): Promise<void> {
    if (!this.pc) {
      return
    }
    // mid と transceiver.direction を合わせる
    for (const mid of Object.values(this.mids)) {
      const transceiver = this.pc.getTransceivers().find((t) => t.mid === mid)
      if (transceiver && transceiver.direction === 'recvonly') {
        transceiver.direction = 'sendrecv'
      }
    }
    // simulcast の場合
    if (this.options.simulcast && (this.role === 'sendrecv' || this.role === 'sendonly')) {
      const transceiver = this.pc.getTransceivers().find((t) => {
        if (t.mid === null) {
          return
        }
        if (t.sender.track === null) {
          return
        }
        if (t.currentDirection !== null && t.currentDirection !== 'sendonly') {
          return
        }
        if (this.mids.video !== '' && this.mids.video === t.mid) {
          return t
        }
        if (0 <= t.mid.indexOf('video')) {
          return t
        }
      })
      if (transceiver) {
        await this.setSenderParameters(transceiver, this.encodings)
        await this.setRemoteDescription(message)
        this.trace('TRANSCEIVER SENDER GET_PARAMETERS', transceiver.sender.getParameters())
        // setRemoteDescription 後でないと active が反映されないのでもう一度呼ぶ
        await this.setSenderParameters(transceiver, this.encodings)
        const sessionDescription = await this.pc.createAnswer()
        // TODO(sile): 動作確認
        if (sessionDescription.sdp !== undefined) {
          sessionDescription.sdp = this.processAnswerSdpForLocal(sessionDescription.sdp)
        }
        await this.pc.setLocalDescription(sessionDescription)
        this.trace('TRANSCEIVER SENDER GET_PARAMETERS', transceiver.sender.getParameters())
        return
      }
    }
    const sessionDescription = await this.pc.createAnswer()
    if (sessionDescription.sdp !== undefined) {
      sessionDescription.sdp = this.processAnswerSdpForLocal(sessionDescription.sdp)
    }
    this.writePeerConnectionTimelineLog('create-answer', sessionDescription)
    await this.pc.setLocalDescription(sessionDescription)
    this.writePeerConnectionTimelineLog('set-local-description', sessionDescription)
    return
  }

  /**
   * カスタムコーデック対応用に offer SDP を処理するメソッド
   *
   * @param sdp offer SDP
   * @returns 処理後の SDP
   */
  private processOfferSdp(sdp: string): string {
    if (isFirefox()) {
      // 同じ mid が採用される際にはもう使用されない transceiver を解放するために
      // port に 0 が指定された SDP が送られてくる。
      // ただし Firefox (バージョン 109.0 で確認) はこれを正常に処理できず、
      // port で 0 が指定された場合には onremovetrack イベントが発行されないので、
      // ワークアラウンドとしてここで SDP の置換を行っている。
      sdp = sdp.replace(/^m=(audio|video) 0 /gm, (_match, kind: string) => `m=${kind} 9 `)
    }

    this.midToAudioCodecType.clear()
    if (this.lyra === undefined || !sdp.includes('109 lyra/')) {
      return sdp
    }

    // mid と音声コーデックの対応を保存する
    for (const media of sdp.split(/^m=/m).slice(1)) {
      if (!media.startsWith('audio')) {
        continue
      }

      const mid = /a=mid:(.*)/.exec(media)
      if (mid) {
        const codecType = media.includes('109 lyra/') ? 'LYRA' : 'OPUS'
        this.midToAudioCodecType.set(mid[1], codecType)
      }
    }

    return this.lyra.processOfferSdp(sdp)
  }

  /**
   * カスタムコーデック用に answer SDP を処理するメソッド
   *
   * 処理後の SDP は setLocalDescription() メソッドに渡される
   *
   * @param answer SDP
   * @returns 処理後の SDP
   */
  private processAnswerSdpForLocal(sdp: string): string {
    if (this.lyra === undefined) {
      return sdp
    }

    return this.lyra.processAnswerSdpForLocal(sdp)
  }

  /**
   * カスタムコーデック用に answer SDP を処理するメソッド
   *
   * 処理後の SDP は Sora に送信される
   *
   * @param answer SDP
   * @returns 処理後の SDP
   */
  private processAnswerSdpForSora(sdp: string): string {
    if (this.lyra === undefined) {
      return sdp
    }

    return this.lyra.processAnswerSdpForSora(sdp)
  }

  /**
   * E2EE あるいはカスタムコーデックが有効になっている場合に、送信側の WebRTC Encoded Transform をセットアップする
   *
   * @param sender 対象となる RTCRtpSender インスタンス
   */
  protected async setupSenderTransform(sender: RTCRtpSender): Promise<void> {
    if ((this.e2ee === null && this.lyra === undefined) || sender.track === null) {
      return
    }
    // 既に初期化済み
    if (this.senderStreamInitialized.has(sender)) {
      return
    }

    const isLyraCodec = sender.track.kind === 'audio' && this.options.audioCodecType === 'LYRA'

    if ('transform' in RTCRtpSender.prototype) {
      // WebRTC Encoded Transform に対応しているブラウザ

      if (!isLyraCodec || this.lyra === undefined) {
        return
      }

      const lyraWorker = createLyraWorker()
      const lyraEncoder = await this.lyra.createEncoder()

      // @ts-ignore
      sender.transform = new RTCRtpScriptTransform(
        lyraWorker,
        {
          name: 'senderTransform',
          lyraEncoder,
        },
        [lyraEncoder.port],
      )
    } else {
      // 古い API (i.e., createEncodedStreams) を使っているブラウザ

      // @ts-ignore
      // eslint-disable-next-line
      const senderStreams = sender.createEncodedStreams() as TransformStream
      let readable = senderStreams.readable
      if (isLyraCodec && this.lyra !== undefined) {
        const lyraEncoder = await this.lyra.createEncoder()
        const transformStream = new TransformStream({
          transform: (data: RTCEncodedAudioFrame, controller) =>
            transformPcmToLyra(lyraEncoder, data, controller),
        })
        readable = senderStreams.readable.pipeThrough(transformStream)
      }
      if (this.e2ee) {
        this.e2ee.setupSenderTransform(readable, senderStreams.writable)
      } else {
        readable.pipeTo(senderStreams.writable).catch((e) => console.warn(e))
      }
    }
    this.senderStreamInitialized.add(sender)
  }

  /**
   * E2EE あるいはカスタムコーデックが有効になっている場合に、受信側の WebRTC Encoded Transform をセットアップする
   *
   * @param mid コーデックの判別に使う mid
   * @param receiver 対象となる RTCRtpReceiver インスタンス
   */
  protected async setupReceiverTransform(
    mid: string | null,
    receiver: RTCRtpReceiver,
  ): Promise<void> {
    if (this.e2ee === null && this.lyra === undefined) {
      return
    }

    const codecType = this.midToAudioCodecType.get(mid || '')

    if ('transform' in RTCRtpSender.prototype) {
      // WebRTC Encoded Transform に対応しているブラウザ

      if (codecType !== 'LYRA' || this.lyra === undefined) {
        return
      }

      const lyraWorker = createLyraWorker()
      const lyraDecoder = await this.lyra.createDecoder()

      // @ts-ignore
      receiver.transform = new RTCRtpScriptTransform(
        lyraWorker,
        {
          name: 'receiverTransform',
          lyraDecoder,
        },
        [lyraDecoder.port],
      )
    } else {
      // 古い API (i.e., createEncodedStreams) を使っているブラウザ

      // @ts-ignore
      // eslint-disable-next-line
      const receiverStreams = receiver.createEncodedStreams() as TransformStream
      let writable = receiverStreams.writable
      if (codecType === 'LYRA' && this.lyra !== undefined) {
        const lyraDecoder = await this.lyra.createDecoder()
        const transformStream = new TransformStream({
          transform: (data: RTCEncodedAudioFrame, controller) =>
            transformLyraToPcm(lyraDecoder, data, controller),
        })
        transformStream.readable.pipeTo(receiverStreams.writable).catch((e) => console.warn(e))
        writable = transformStream.writable
      }
      if (this.e2ee) {
        this.e2ee.setupReceiverTransform(receiverStreams.readable, writable)
      } else {
        receiverStreams.readable.pipeTo(writable).catch((e) => console.warn(e))
      }
    }
  }

  /**
   * シグナリングサーバーに type answer を投げるメソッド
   */
  protected sendAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace('ANSWER SDP', this.pc.localDescription.sdp)
      const sdp = this.processAnswerSdpForSora(this.pc.localDescription.sdp)
      const message = { type: 'answer', sdp }
      this.ws.send(JSON.stringify(message))
      this.writeWebSocketSignalingLog('send-answer', message)
    }
    return
  }

  /**
   * iceCnadidate 処理をするメソッド
   */
  protected onIceCandidate(): Promise<void> {
    return new Promise((resolve, _) => {
      if (this.pc) {
        this.pc.oniceconnectionstatechange = (_): void => {
          if (this.pc) {
            this.writePeerConnectionTimelineLog('oniceconnectionstatechange', {
              connectionState: this.pc.connectionState,
              iceConnectionState: this.pc.iceConnectionState,
              iceGatheringState: this.pc.iceGatheringState,
            })
            this.trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this.pc.iceConnectionState)
            if (this.pc.iceConnectionState === 'connected') {
              resolve()
            }
          }
        }
        this.pc.onicecandidate = (event): void => {
          this.writePeerConnectionTimelineLog('onicecandidate', event.candidate)
          if (this.pc) {
            this.trace('ONICECANDIDATE ICEGATHERINGSTATE', this.pc.iceGatheringState)
          }
          // TODO(yuito): Firefox は <empty string> を投げてくるようになったので対応する
          if (event.candidate === null) {
            resolve()
          } else {
            const candidate = event.candidate.toJSON()
            const message = Object.assign(candidate, { type: 'candidate' }) as {
              type: string
              [key: string]: unknown
            }
            this.trace('ONICECANDIDATE CANDIDATE MESSAGE', message)
            this.sendSignalingMessage(message)
          }
        }
      }
    })
  }

  /**
   * connectionState が "connected" になるのを監視するメソッド
   *
   * @remarks
   * PeerConnection.connectionState が実装されていない場合は何もしない
   */
  protected waitChangeConnectionStateConnected(): Promise<void> {
    return new Promise((resolve, reject) => {
      // connectionState が存在しない場合はそのまま抜ける
      if (this.pc && this.pc.connectionState === undefined) {
        resolve()
        return
      }
      const timerId = setInterval(() => {
        if (!this.pc) {
          const error = new Error()
          error.message = "PeerConnection connectionState did not change to 'connected'"
          clearInterval(timerId)
          reject(error)
        } else if (this.pc && this.pc.connectionState === 'connected') {
          clearInterval(timerId)
          resolve()
        }
      }, 10)
    })
  }

  /**
   * 初回シグナリング接続時の WebSocket の切断を監視するメソッド
   *
   * @remarks
   * 意図しない切断があった場合には異常終了処理を実行する
   */
  protected monitorSignalingWebSocketEvent(): Promise<void> {
    return new Promise((_, reject) => {
      this.monitorSignalingWebSocketEventTimerId = setInterval(() => {
        if (!this.ws) {
          return
        }
        this.clearMonitorSignalingWebSocketEvent()
        this.ws.onclose = (event) => {
          const error = new ConnectError(
            `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`,
          )
          error.code = event.code
          error.reason = event.reason
          this.writeWebSocketTimelineLog('onclose', error)
          this.signalingTerminate()
          reject(error)
        }
        this.ws.onerror = (_) => {
          const error = new ConnectError(`Signaling failed. WebSocket onerror was called`)
          this.writeWebSocketSignalingLog('onerror', error)
          this.signalingTerminate()
          reject(error)
        }
      }, 100)
    })
  }

  /**
   * WebSocket の切断を監視するメソッド
   *
   * @remarks
   * 意図しない切断があった場合には異常終了処理を実行する
   */
  protected monitorWebSocketEvent(): void {
    if (!this.ws) {
      return
    }
    this.ws.onclose = async (event) => {
      this.writeWebSocketTimelineLog('onclose', { code: event.code, reason: event.reason })
      await this.abend('WEBSOCKET-ONCLOSE', { code: event.code, reason: event.reason })
    }
    this.ws.onerror = async (_) => {
      this.writeWebSocketSignalingLog('onerror')
      await this.abend('WEBSOCKET-ONERROR')
    }
  }

  /**
   * 初回シグナリング後 PeerConnection の state を監視するメソッド
   *
   * @remarks
   * connectionState, iceConnectionState を監視して不正な場合に切断する
   */
  protected monitorPeerConnectionState(): void {
    if (!this.pc) {
      return
    }
    this.pc.oniceconnectionstatechange = (_) => {
      // connectionState が undefined の場合は iceConnectionState を見て判定する
      if (this.pc && this.pc.connectionState === undefined) {
        this.writePeerConnectionTimelineLog('oniceconnectionstatechange', {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        })
        this.trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this.pc.iceConnectionState)
        clearTimeout(this.monitorIceConnectionStateChangeTimerId)
        // iceConnectionState "failed" で切断する
        if (this.pc.iceConnectionState === 'failed') {
          this.abendPeerConnectionState('ICE-CONNECTION-STATE-FAILED')
        }
        // iceConnectionState "disconnected" になってから 10000ms の間変化がない場合切断する
        else if (this.pc.iceConnectionState === 'disconnected') {
          this.monitorIceConnectionStateChangeTimerId = setTimeout(() => {
            if (this.pc && this.pc.iceConnectionState === 'disconnected') {
              this.abendPeerConnectionState('ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT')
            }
          }, 10000)
        }
      }
    }
    this.pc.onconnectionstatechange = (_) => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog('onconnectionstatechange', {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        })
        if (this.pc.connectionState === 'failed') {
          this.abendPeerConnectionState('CONNECTION-STATE-FAILED')
        }
      }
    }
  }

  /**
   * 初回シグナリングの接続タイムアウト処理をするメソッド
   */
  protected setConnectionTimeout(): Promise<MediaStream> {
    return new Promise((_, reject) => {
      if (0 < this.connectionTimeout) {
        this.connectionTimeoutTimerId = setTimeout(() => {
          if (
            !this.pc ||
            (this.pc &&
              this.pc.connectionState !== undefined &&
              this.pc.connectionState !== 'connected')
          ) {
            const error = new Error()
            error.message = 'Signaling connection timeout'
            this.callbacks.timeout()
            this.trace('DISCONNECT', 'Signaling connection timeout')
            this.writePeerConnectionTimelineLog('signaling-connection-timeout', {
              connectionTimeout: this.connectionTimeout,
            })
            this.signalingTerminate()
            reject(error)
          }
        }, this.connectionTimeout)
      }
    })
  }

  /**
   * setConnectionTimeout でセットしたタイマーを止めるメソッド
   */
  protected clearConnectionTimeout(): void {
    clearTimeout(this.connectionTimeoutTimerId)
  }

  /**
   * monitorSignalingWebSocketEvent でセットしたタイマーを止めるメソッド
   */
  protected clearMonitorSignalingWebSocketEvent(): void {
    clearInterval(this.monitorSignalingWebSocketEventTimerId)
  }

  /**
   * monitorPeerConnectionState でセットしたタイマーを止めるメソッド
   */
  protected clearMonitorIceConnectionStateChange(): void {
    clearInterval(this.monitorIceConnectionStateChangeTimerId)
  }

  /**
   * trace log を出力するメソッド
   *
   * @param title - ログのタイトル
   * @param message - ログの本文
   */
  protected trace(title: string, message: unknown): void {
    this.callbacks.log(title, message as JSONType)
    if (!this.debug) {
      return
    }
    trace(this.clientId, title, message)
  }

  /**
   * WebSocket のシグナリングログ処理をするメソッド
   *
   * @param eventType - イベントタイプ
   * @param data - イベントデータ
   */
  protected writeWebSocketSignalingLog(eventType: string, data?: unknown): void {
    this.callbacks.signaling(createSignalingEvent(eventType, data, 'websocket'))
    this.writeWebSocketTimelineLog(eventType, data)
  }

  /**
   * DataChannel のシグナリングログ処理をするメソッド
   *
   * @param eventType - イベントタイプ
   * @param data - イベントデータ
   */
  protected writeDataChannelSignalingLog(
    eventType: string,
    channel: RTCDataChannel,
    data?: unknown,
  ): void {
    this.callbacks.signaling(createSignalingEvent(eventType, data, 'datachannel'))
    this.writeDataChannelTimelineLog(eventType, channel, data)
  }

  /**
   * WebSocket のタイムラインログ処理をするメソッド
   *
   * @param eventType - イベントタイプ
   * @param data - イベントデータ
   */
  protected writeWebSocketTimelineLog(eventType: string, data?: unknown): void {
    const event = createTimelineEvent(eventType, data, 'websocket')
    this.callbacks.timeline(event)
  }

  /**
   * DataChannel のタイムラインログ処理をするメソッド
   *
   * @param eventType - イベントタイプ
   * @param data - イベントデータ
   */
  protected writeDataChannelTimelineLog(
    eventType: string,
    channel: RTCDataChannel,
    data?: unknown,
  ): void {
    const event = createTimelineEvent(eventType, data, 'datachannel', channel.id, channel.label)
    this.callbacks.timeline(event)
  }

  /**
   * PeerConnection のタイムラインログ処理をするメソッド
   *
   * @param eventType - イベントタイプ
   * @param data - イベントデータ
   */
  protected writePeerConnectionTimelineLog(eventType: string, data?: unknown): void {
    const event = createTimelineEvent(eventType, data, 'peerconnection')
    this.callbacks.timeline(event)
  }

  /**
   * Sora との接続のタイムラインログ処理をするメソッド
   *
   * @param eventType - イベントタイプ
   * @param data - イベントデータ
   */
  protected writeSoraTimelineLog(eventType: string, data?: unknown): void {
    const event = createTimelineEvent(eventType, data, 'sora')
    this.callbacks.timeline(event)
  }

  /**
   * createOffer 処理をするメソッド
   *
   * @returns
   * 生成した RTCSessionDescription を返します
   */
  private async createOffer(): Promise<RTCSessionDescriptionInit> {
    const config = { iceServers: [] }
    const pc = new window.RTCPeerConnection(config)
    if (isSafari()) {
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })
      const offer = await pc.createOffer()
      pc.close()
      this.writePeerConnectionTimelineLog('create-offer', offer)
      return offer
    }
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    pc.close()
    this.writePeerConnectionTimelineLog('create-offer', offer)
    return offer
  }

  /**
   * シグナリングサーバーから受け取った type e2ee メッセージを処理をするメソッド
   *
   * @param data - E2EE 用バイナリメッセージ
   */
  private signalingOnMessageE2EE(data: ArrayBuffer): void {
    if (this.e2ee) {
      const message = new Uint8Array(data)
      const result = this.e2ee.receiveMessage(message)
      this.e2ee.postRemoteSecretKeyMaterials(result)
      result.messages.forEach((message) => {
        this.sendE2EEMessage(message.buffer)
      })
    }
  }

  /**
   * シグナリングサーバーから受け取った type offer メッセージを処理をするメソッド
   *
   * @param message - type offer メッセージ
   */
  private signalingOnMessageTypeOffer(message: SignalingOfferMessage): void {
    this.clientId = message.client_id
    this.connectionId = message.connection_id
    if (message.metadata !== undefined) {
      this.authMetadata = message.metadata
    }
    if (Array.isArray(message.encodings)) {
      this.encodings = message.encodings
    }
    if (message.mid !== undefined && message.mid.audio !== undefined) {
      this.mids.audio = message.mid.audio
    }
    if (message.mid !== undefined && message.mid.video !== undefined) {
      this.mids.video = message.mid.video
    }
    if (message.data_channels) {
      for (const dc of message.data_channels) {
        this.signalingOfferMessageDataChannels[dc.label] = dc
      }
    }
    this.trace('SIGNALING OFFER MESSAGE', message)
    this.trace('OFFER SDP', message.sdp)
  }

  /**
   * シグナリングサーバーに type update を投げるメソッド
   */
  private sendUpdateAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace('ANSWER SDP', this.pc.localDescription.sdp)
      this.sendSignalingMessage({ type: 'update', sdp: this.pc.localDescription.sdp })
    }
  }

  /**
   * シグナリングサーバーに type re-answer を投げるメソッド
   */
  private sendReAnswer(): void {
    if (this.pc && this.pc.localDescription) {
      this.trace('RE ANSWER SDP', this.pc.localDescription.sdp)
      this.sendSignalingMessage({ type: 're-answer', sdp: this.pc.localDescription.sdp })
    }
  }

  /**
   * シグナリングサーバーから受け取った type update メッセージを処理をするメソッド
   *
   * @param message - type update メッセージ
   */
  private async signalingOnMessageTypeUpdate(message: SignalingUpdateMessage): Promise<void> {
    this.trace('SIGNALING UPDATE MESSGE', message)
    this.trace('UPDATE SDP', message.sdp)
    await this.setRemoteDescription(message)
    await this.createAnswer(message)
    this.sendUpdateAnswer()
  }

  /**
   * シグナリングサーバーから受け取った type re-offer メッセージを処理をするメソッド
   *
   * @param message - type re-offer メッセージ
   */
  private async signalingOnMessageTypeReOffer(message: SignalingReOfferMessage): Promise<void> {
    this.trace('SIGNALING RE OFFER MESSGE', message)
    this.trace('RE OFFER SDP', message.sdp)
    await this.setRemoteDescription(message)
    await this.createAnswer(message)
    this.sendReAnswer()
  }

  /**
   * シグナリングサーバーから受け取った type ping メッセージを処理をするメソッド
   *
   * @param message - type ping メッセージ
   */
  private async signalingOnMessageTypePing(message: SignalingPingMessage): Promise<void> {
    const pongMessage: { type: 'pong'; stats?: RTCStatsReport[] } = { type: 'pong' }
    if (message.stats) {
      const stats = await this.getStats()
      pongMessage.stats = stats
    }
    if (this.ws) {
      this.ws.send(JSON.stringify(pongMessage))
    }
  }

  /**
   * シグナリングサーバーから受け取った type notify メッセージを処理をするメソッド
   *
   * @param message - type notify メッセージ
   */
  private signalingOnMessageTypeNotify(
    message: SignalingNotifyMessage,
    transportType: TransportType,
  ): void {
    if (message.event_type === 'connection.created') {
      const connectionId = message.connection_id
      if (this.connectionId !== connectionId) {
        const authnMetadata = getSignalingNotifyAuthnMetadata(message)
        const preKeyBundle = getPreKeyBundle(authnMetadata)
        if (preKeyBundle && this.e2ee && connectionId) {
          const result = this.e2ee.startSession(connectionId, preKeyBundle)
          this.e2ee.postRemoteSecretKeyMaterials(result)
          result.messages.forEach((message) => {
            this.sendE2EEMessage(message.buffer)
          })
          // messages を送信し終えてから、selfSecretKeyMaterial を更新する
          this.e2ee.postSelfSecretKeyMaterial(
            result.selfConnectionId,
            result.selfKeyId,
            result.selfSecretKeyMaterial,
          )
        }
      }
      const data = getSignalingNotifyData(message)
      data.forEach((metadata) => {
        const authnMetadata = getSignalingNotifyAuthnMetadata(metadata)
        const preKeyBundle = getPreKeyBundle(authnMetadata)
        const connectionId = metadata.connection_id
        if (connectionId && this.e2ee && preKeyBundle) {
          this.e2ee.addPreKeyBundle(connectionId, preKeyBundle)
        }
      })
    } else if (message.event_type === 'connection.destroyed') {
      const authnMetadata = getSignalingNotifyAuthnMetadata(message)
      const preKeyBundle = getPreKeyBundle(authnMetadata)
      const connectionId = message.connection_id
      if (preKeyBundle && this.e2ee && connectionId) {
        const result = this.e2ee.stopSession(connectionId)
        this.e2ee.postSelfSecretKeyMaterial(
          result.selfConnectionId,
          result.selfKeyId,
          result.selfSecretKeyMaterial,
          5000,
        )
        result.messages.forEach((message) => {
          this.sendE2EEMessage(message.buffer)
        })
        this.e2ee.postRemoveRemoteDeriveKey(connectionId)
      }
    }
    this.callbacks.notify(message, transportType)
  }

  /**
   * シグナリングサーバーから受け取った type switched メッセージを処理をするメソッド
   *
   * @param message - type switched メッセージ
   */
  private signalingOnMessageTypeSwitched(message: SignalingSwitchedMessage): void {
    this.signalingSwitched = true
    if (!this.ws) {
      return
    }
    if (message['ignore_disconnect_websocket']) {
      if (this.ws) {
        this.ws.onclose = null
        this.ws.close()
        this.ws = null
      }
      this.writeWebSocketSignalingLog('close')
    }
    for (const channel of this.datachannels) {
      this.callbacks.datachannel(createDataChannelEvent(channel))
    }
  }

  /**
   * シグナリングサーバーから受け取った type redirect メッセージを処理をするメソッド
   *
   * @param message - type redirect メッセージ
   */
  private async signalingOnMessageTypeRedirect(
    message: SignalingRedirectMessage,
  ): Promise<SignalingOfferMessage> {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.close()
      this.ws = null
    }
    const ws = await this.getSignalingWebSocket(message.location)
    const signalingMessage = await this.signaling(ws, true)
    return signalingMessage
  }

  /**
   * sender の parameters に encodings をセットするメソッド
   *
   * @remarks
   * サイマルキャスト用の処理
   */
  private async setSenderParameters(
    transceiver: RTCRtpTransceiver,
    encodings: RTCRtpEncodingParameters[],
  ): Promise<void> {
    const originalParameters = transceiver.sender.getParameters()
    // @ts-ignore
    originalParameters.encodings = encodings
    await transceiver.sender.setParameters(originalParameters)
    this.trace('TRANSCEIVER SENDER SET_PARAMETERS', originalParameters)
    this.writePeerConnectionTimelineLog('transceiver-sender-set-parameters', originalParameters)
    return
  }

  /**
   * PeerConnection から RTCStatsReport を取得するためのメソッド
   */
  private async getStats(): Promise<RTCStatsReport[]> {
    const stats: RTCStatsReport[] = []
    if (!this.pc) {
      return stats
    }
    const reports = await this.pc.getStats()
    reports.forEach((s) => {
      stats.push(s as RTCStatsReport)
    })
    return stats
  }

  /**
   * PeerConnection の ondatachannel callback メソッド
   *
   * @param dataChannelEvent - DataChannel イベント
   */
  private onDataChannel(dataChannelEvent: RTCDataChannelEvent): void {
    const dataChannel = dataChannelEvent.channel
    dataChannel.bufferedAmountLowThreshold = 65536
    dataChannel.binaryType = 'arraybuffer'
    this.soraDataChannels[dataChannel.label] = dataChannel
    this.writeDataChannelTimelineLog(
      'ondatachannel',
      dataChannel,
      createDataChannelData(dataChannel),
    )
    // onbufferedamountlow
    dataChannelEvent.channel.onbufferedamountlow = (event): void => {
      const channel = event.currentTarget as RTCDataChannel
      this.writeDataChannelTimelineLog('onbufferedamountlow', channel)
    }
    // onopen
    dataChannelEvent.channel.onopen = (event): void => {
      const channel = event.currentTarget as RTCDataChannel
      this.trace('OPEN DATA CHANNEL', channel.label)
      if (channel.label === 'signaling' && this.ws) {
        this.writeDataChannelSignalingLog('onopen', channel)
      } else {
        this.writeDataChannelTimelineLog('onopen', channel)
      }
    }
    // onclose
    dataChannelEvent.channel.onclose = async (event): Promise<void> => {
      const channel = event.currentTarget as RTCDataChannel
      this.writeDataChannelTimelineLog('onclose', channel)
      this.trace('CLOSE DATA CHANNEL', channel.label)
      await this.disconnect()
    }
    // onerror
    dataChannelEvent.channel.onerror = async (event): Promise<void> => {
      const channel = event.currentTarget as RTCDataChannel
      this.writeDataChannelTimelineLog('onerror', channel)
      this.trace('ERROR DATA CHANNEL', channel.label)
      await this.abend('DATA-CHANNEL-ONERROR', { params: { label: channel.label } })
    }
    // onmessage
    if (dataChannelEvent.channel.label === 'signaling') {
      dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
        const channel = event.currentTarget as RTCDataChannel
        const label = channel.label
        const dataChannelSettings = this.signalingOfferMessageDataChannels[label]
        if (!dataChannelSettings) {
          console.warn(
            `Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`,
          )
          return
        }
        const data = parseDataChannelEventData(event.data, dataChannelSettings.compress)
        const message = JSON.parse(data) as SignalingMessage
        this.writeDataChannelSignalingLog(`onmessage-${message.type}`, channel, message)
        if (message.type === 're-offer') {
          await this.signalingOnMessageTypeReOffer(message)
        }
      }
    } else if (dataChannelEvent.channel.label === 'notify') {
      dataChannelEvent.channel.onmessage = (event): void => {
        const channel = event.currentTarget as RTCDataChannel
        const label = channel.label
        const dataChannelSettings = this.signalingOfferMessageDataChannels[label]
        if (!dataChannelSettings) {
          console.warn(
            `Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`,
          )
          return
        }
        const data = parseDataChannelEventData(event.data, dataChannelSettings.compress)
        const message = JSON.parse(data) as SignalingNotifyMessage
        if (message.event_type === 'connection.created') {
          this.writeDataChannelTimelineLog('notify-connection.created', channel, message)
        } else if (message.event_type === 'connection.destroyed') {
          this.writeDataChannelTimelineLog('notify-connection.destroyed', channel, message)
        }
        this.signalingOnMessageTypeNotify(message, 'datachannel')
      }
    } else if (dataChannelEvent.channel.label === 'push') {
      dataChannelEvent.channel.onmessage = (event): void => {
        const channel = event.currentTarget as RTCDataChannel
        const label = channel.label
        const dataChannelSettings = this.signalingOfferMessageDataChannels[label]
        if (!dataChannelSettings) {
          console.warn(
            `Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`,
          )
          return
        }
        const data = parseDataChannelEventData(event.data, dataChannelSettings.compress)
        const message = JSON.parse(data) as SignalingPushMessage
        this.callbacks.push(message, 'datachannel')
      }
    } else if (dataChannelEvent.channel.label === 'e2ee') {
      dataChannelEvent.channel.onmessage = (event): void => {
        const channel = event.currentTarget as RTCDataChannel
        const data = event.data as ArrayBuffer
        this.signalingOnMessageE2EE(data)
        this.writeDataChannelSignalingLog('onmessage-e2ee', channel, data)
      }
    } else if (dataChannelEvent.channel.label === 'stats') {
      dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
        const channel = event.currentTarget as RTCDataChannel
        const label = channel.label
        const dataChannelSettings = this.signalingOfferMessageDataChannels[label]
        if (!dataChannelSettings) {
          console.warn(
            `Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`,
          )
          return
        }
        const data = parseDataChannelEventData(event.data, dataChannelSettings.compress)
        const message = JSON.parse(data) as SignalingReqStatsMessage
        if (message.type === 'req-stats') {
          const stats = await this.getStats()
          this.sendStatsMessage(stats)
        }
      }
    } else if (/^#.*/.exec(dataChannelEvent.channel.label)) {
      dataChannelEvent.channel.onmessage = (event): void => {
        if (event.currentTarget === null) {
          return
        }
        const channel = event.currentTarget as RTCDataChannel
        const label = channel.label
        const dataChannelSettings = this.signalingOfferMessageDataChannels[label]
        if (!dataChannelSettings) {
          console.warn(
            `Received onmessage event for '${label}' DataChannel. But '${label}' DataChannel settings doesn't exist`,
          )
          return
        }
        const dataChannel = event.target as RTCDataChannel
        let data: ArrayBuffer | undefined = undefined
        if (typeof event.data === 'string') {
          data = new TextEncoder().encode(event.data)
        } else if (event.data instanceof ArrayBuffer) {
          data = event.data
        } else {
          console.warn('Received onmessage event data is not of type String or ArrayBuffer.')
        }

        if (data !== undefined) {
          if (dataChannelSettings.compress === true) {
            data = unzlibSync(new Uint8Array(data)).buffer
          }
          this.callbacks.message(createDataChannelMessageEvent(dataChannel.label, data))
        }
      }
    }
  }

  /**
   * シグナリングサーバーへメッセージを送信するメソッド
   *
   * @param message - 送信するメッセージ
   */
  private sendSignalingMessage(message: { type: string; [key: string]: unknown }): void {
    if (this.soraDataChannels.signaling) {
      if (
        this.signalingOfferMessageDataChannels.signaling &&
        this.signalingOfferMessageDataChannels.signaling.compress === true
      ) {
        const binaryMessage = new TextEncoder().encode(JSON.stringify(message))
        const zlibMessage = zlibSync(binaryMessage, {})
        this.soraDataChannels.signaling.send(zlibMessage)
      } else {
        this.soraDataChannels.signaling.send(JSON.stringify(message))
      }
      this.writeDataChannelSignalingLog(
        `send-${message.type}`,
        this.soraDataChannels.signaling,
        message,
      )
    } else if (this.ws !== null) {
      this.ws.send(JSON.stringify(message))
      this.writeWebSocketSignalingLog(`send-${message.type}`, message)
    }
  }

  /**
   * シグナリングサーバーに E2E 用メッセージを投げるメソッド
   *
   * @param message - 送信するバイナリメッセージ
   */
  private sendE2EEMessage(message: ArrayBuffer): void {
    if (this.soraDataChannels.e2ee) {
      this.soraDataChannels.e2ee.send(message)
      this.writeDataChannelSignalingLog('send-e2ee', this.soraDataChannels.e2ee, message)
    } else if (this.ws !== null) {
      this.ws.send(message)
      this.writeWebSocketSignalingLog('send-e2ee', message)
    }
  }

  /**
   * シグナリングサーバーに stats メッセージを投げるメソッド
   *
   * @param reports - RTCStatsReport のリスト
   */
  private sendStatsMessage(reports: RTCStatsReport[]): void {
    if (this.soraDataChannels.stats) {
      const message = {
        type: 'stats',
        reports: reports,
      }
      if (
        this.signalingOfferMessageDataChannels.stats &&
        this.signalingOfferMessageDataChannels.stats.compress === true
      ) {
        const binaryMessage = new TextEncoder().encode(JSON.stringify(message))
        const zlibMessage = zlibSync(binaryMessage, {})
        this.soraDataChannels.stats.send(zlibMessage)
      } else {
        this.soraDataChannels.stats.send(JSON.stringify(message))
      }
    }
  }

  /**
   * audio transceiver を取得するメソッド
   */
  private getAudioTransceiver(): RTCRtpTransceiver | null {
    if (this.pc && this.mids.audio) {
      const transceiver = this.pc.getTransceivers().find((transceiver) => {
        return transceiver.mid === this.mids.audio
      })
      return transceiver || null
    }
    return null
  }

  /**
   * video transceiver を取得するメソッド
   */
  private getVideoTransceiver(): RTCRtpTransceiver | null {
    if (this.pc && this.mids.video) {
      const transceiver = this.pc.getTransceivers().find((transceiver) => {
        return transceiver.mid === this.mids.video
      })
      return transceiver || null
    }
    return null
  }

  /**
   * disconnect callback に渡す Event オブジェクトを生成するためのメソッド
   *
   * @param type - Event タイプ(normal | abend)
   * @param title - Event タイトル
   * @param initDict - Event に設定するオプションパラメーター
   */
  private soraCloseEvent(
    type: SoraCloseEventType,
    title: string,
    initDict?: SoraCloseEventInitDict,
  ): SoraCloseEvent {
    const soraCloseEvent = class SoraCloseEvent extends Event {
      title: string
      code?: number
      reason?: string
      params?: Record<string, unknown>

      constructor(type: SoraCloseEventType, title: string, initDict?: SoraCloseEventInitDict) {
        super(type)
        if (initDict) {
          if (initDict.code) {
            this.code = initDict.code
          }
          if (initDict.reason) {
            this.reason = initDict.reason
          }
          if (initDict.params) {
            this.params = initDict.params
          }
        }
        this.title = title
      }
    }
    return new soraCloseEvent(type, title, initDict)
  }

  /**
   * DataChannel を使用してメッセージを送信するメソッド
   *
   * @param label - メッセージを送信する DataChannel のラベル
   * @param message - Uint8Array
   */
  sendMessage(label: string, message: Uint8Array): void {
    const dataChannel = this.soraDataChannels[label]
    // 接続していない場合は何もしない
    if (this.pc === null) {
      return
    }
    if (dataChannel === undefined) {
      throw new Error('Could not find DataChannel')
    }
    if (dataChannel.readyState !== 'open') {
      throw new Error('Messaging DataChannel is not open')
    }
    const settings = this.signalingOfferMessageDataChannels[label]
    if (settings !== undefined && settings.compress === true) {
      const zlibMessage = zlibSync(message, {})
      dataChannel.send(zlibMessage)
    } else {
      dataChannel.send(message)
    }
  }

  /**
   * E2EE の自分のフィンガープリント
   */
  get e2eeSelfFingerprint(): string | undefined {
    if (this.options.e2ee && this.e2ee) {
      return this.e2ee.selfFingerprint()
    }
    return
  }

  /**
   * E2EE のリモートのフィンガープリントリスト
   */
  get e2eeRemoteFingerprints(): Record<string, string> | undefined {
    if (this.options.e2ee && this.e2ee) {
      return this.e2ee.remoteFingerprints()
    }
    return
  }

  /**
   * audio が有効かどうか
   */
  get audio(): boolean {
    return this.getAudioTransceiver() !== null
  }

  /**
   * video が有効かどうか
   */
  get video(): boolean {
    return this.getVideoTransceiver() !== null
  }

  /**
   * シグナリングに使用する URL
   *
   * @deprecated
   */
  get signalingUrl(): string | string[] {
    return this.signalingUrlCandidates
  }

  /**
   * DataChannel メッセージング用の DataChannel 情報のリスト
   */
  get datachannels(): DataChannelConfiguration[] {
    if (!this.signalingSwitched) {
      return []
    }
    const messagingDataChannellabels = Object.keys(this.signalingOfferMessageDataChannels).filter(
      (label) => {
        return /^#.*/.exec(label)
      },
    )
    const result: DataChannelConfiguration[] = []
    for (const label of messagingDataChannellabels) {
      const dataChannel = this.soraDataChannels[label]
      if (!dataChannel) {
        continue
      }
      const settings = this.signalingOfferMessageDataChannels[label]
      if (!settings) {
        continue
      }
      const messagingDataChannel: DataChannelConfiguration = {
        label: dataChannel.label,
        ordered: dataChannel.ordered,
        protocol: dataChannel.protocol,
        compress: settings.compress,
        direction: settings.direction,
      }
      if (typeof dataChannel.maxPacketLifeTime === 'number') {
        messagingDataChannel.maxPacketLifeTime = dataChannel.maxPacketLifeTime
      }
      if (typeof dataChannel.maxRetransmits === 'number') {
        messagingDataChannel.maxRetransmits = dataChannel.maxRetransmits
      }
      result.push(messagingDataChannel)
    }
    return result
  }
}
