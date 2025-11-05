import type {
  SIGNALING_MESSAGE_TYPE_CLOSE,
  SIGNALING_MESSAGE_TYPE_CONNECT,
  SIGNALING_MESSAGE_TYPE_NOTIFY,
  SIGNALING_MESSAGE_TYPE_OFFER,
  SIGNALING_MESSAGE_TYPE_PING,
  SIGNALING_MESSAGE_TYPE_PUSH,
  SIGNALING_MESSAGE_TYPE_RE_OFFER,
  SIGNALING_MESSAGE_TYPE_REDIRECT,
  SIGNALING_MESSAGE_TYPE_REQ_STATS,
  SIGNALING_MESSAGE_TYPE_SWITCHED,
  SIGNALING_MESSAGE_TYPE_UPDATE,
  SIGNALING_ROLE_RECVONLY,
  SIGNALING_ROLE_SENDONLY,
  SIGNALING_ROLE_SENDRECV,
  TRANSPORT_TYPE_DATACHANNEL,
  TRANSPORT_TYPE_WEBSOCKET,
} from './constants'

// declare const __SORA_JS_SDK_VERSION__: string

export type JSONType =
  | null
  | boolean
  | number
  | string
  | JSONType[]
  | { [prop: string]: JSONType | undefined }

export type SimulcastRid = 'r0' | 'r1' | 'r2'

export type SpotlightFocusRid = 'none' | SimulcastRid

export type Simulcast = boolean | { rid: SimulcastRid }

export type AudioCodecType = 'OPUS'

export type SignalingAudio =
  | boolean
  | {
      codec_type?: AudioCodecType
      bit_rate?: number
      opus_params?: {
        channels?: number
        maxplaybackrate?: number
        minptime?: number
        ptime?: number
        stereo?: boolean
        sprop_stereo?: boolean
        useinbandfec?: boolean
        usedtx?: boolean
      }
    }

export type VideoCodecType = 'VP9' | 'VP8' | 'AV1' | 'H264' | 'H265'

export type SignalingVideo =
  | boolean
  | {
      codec_type?: VideoCodecType
      bit_rate?: number
      vp9_params?: JSONType
      h264_params?: JSONType
      h265_params?: JSONType
      av1_params?: JSONType
    }

export type Role =
  | typeof SIGNALING_ROLE_SENDRECV
  | typeof SIGNALING_ROLE_SENDONLY
  | typeof SIGNALING_ROLE_RECVONLY

export type SignalingConnectDataChannel = {
  label?: string
  direction?: DataChannelDirection
  compress?: boolean
  max_packet_life_time?: number
  max_retransmits?: number
  protocol?: string
  ordered?: boolean
  header?: MessagingHeaderField[]
}

export type SignalingConnectMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_CONNECT
  role: Role
  channel_id: string
  client_id?: string
  bundle_id?: string
  metadata?: JSONType
  signaling_notify_metadata?: JSONType
  spotlight?: boolean
  spotlight_number?: number
  simulcast?: Simulcast
  simulcast_rid?: SimulcastRid
  audio: SignalingAudio
  video: SignalingVideo
  sdp: string
  sora_client: string
  environment: string
  spotlight_focus_rid?: SpotlightFocusRid
  spotlight_unfocus_rid?: SpotlightFocusRid
  data_channel_signaling?: boolean
  ignore_disconnect_websocket?: boolean
  redirect?: true
  data_channels?: SignalingConnectDataChannel[]
  audio_streaming_language_code?: string
  forwarding_filters?: ForwardingFilter[]
  // @deprecated このオプションは非推奨です。将来のバージョンで削除される可能性があります。
  forwarding_filter?: ForwardingFilter
}

export type WebSocketSignalingMessage =
  | SignalingConnectMessage
  | SignalingOfferMessage
  | SignalingUpdateMessage
  | SignalingReOfferMessage
  | SignalingPingMessage
  | SignalingPushMessage
  | SignalingNotifyMessage
  | SignalingSwitchedMessage
  | SignalingRedirectMessage

export type DataChannelSignalingMessage = SignalingReOfferMessage | SignalingCloseMessage

export type SignalingOfferMessageDataChannel = {
  label: string
  direction: DataChannelDirection
  compress: boolean
  header?: MessagingHeaderField[]
}

export type SignalingOfferMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_OFFER
  sdp: string

  simulcast: boolean
  simulcast_multicodec: boolean
  spotlight: boolean

  channel_id: string
  // 互換性を考慮してオプションとする
  session_id?: string
  client_id: string
  bundle_id: string
  connection_id: string

  metadata?: JSONType
  config?: RTCConfiguration
  encodings?: RTCRtpEncodingParameters[]
  ignore_disconnect_websocket?: boolean
  data_channel_signaling?: boolean
  data_channels?: SignalingOfferMessageDataChannel[]
  mid?: {
    audio?: string
    video?: string
  }
}

// @deprecated この型は非推奨です。将来のバージョンで削除される可能性があります。
export type SignalingUpdateMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_UPDATE
  sdp: string
}

export type SignalingReOfferMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_RE_OFFER
  sdp: string
}

export type SignalingPingMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_PING
  stats: boolean
}

export type SignalingPushMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_PUSH
  data: Record<string, unknown>
}

export type SignalingReqStatsMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_REQ_STATS
}

export type SignalingSwitchedMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_SWITCHED
  ignore_disconnect_websocket: boolean
}

export type SignalingRedirectMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_REDIRECT
  location: string
}

// DataChannel シグナリングでのみ利用される
export type SignalingCloseMessage = {
  type: typeof SIGNALING_MESSAGE_TYPE_CLOSE
  code: number
  reason: string
}

export type SignalingNotifyMessage =
  | SignalingNotifyConnectionCreated
  | SignalingNotifyConnectionUpdated
  | SignalingNotifyConnectionDestroyed
  | SignalingNotifySpotlightChanged
  | SignalingNotifySpotlightFocused
  | SignalingNotifySpotlightUnfocused
  | SignalingNotifyNetworkStatus

export type SignalingNotifyMetadata = {
  client_id?: string
  connection_id?: string
  authn_metadata?: JSONType
  authz_metadata?: JSONType
  metadata?: JSONType
}

export type SignalingNotifyConnectionCreated = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'connection.created'
  role: Role
  timestamp?: string
  session_id?: string
  client_id?: string
  bundle_id?: string
  connection_id?: string
  audio?: boolean
  video?: boolean
  authn_metadata?: JSONType
  authz_metadata?: JSONType
  metadata?: JSONType
  metadata_list?: SignalingNotifyMetadata[]
  data?: SignalingNotifyMetadata[]
  minutes: number
  channel_connections: number
  channel_sendrecv_connections: number
  channel_sendonly_connections: number
  channel_recvonly_connections: number
  turn_transport_type: 'udp' | 'tcp'
}

export type SignalingNotifyConnectionUpdated = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'connection.updated'
  role: Role
  session_id?: string
  client_id?: string
  bundle_id?: string
  connection_id?: string
  audio?: boolean
  video?: boolean
  minutes: number
  channel_connections: number
  channel_sendrecv_connections: number
  channel_sendonly_connections: number
  channel_recvonly_connections: number
  turn_transport_type: 'udp' | 'tcp'
}

export type SignalingNotifyConnectionDestroyed = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'connection.destroyed'
  role: Role
  session_id?: string
  client_id?: string
  bundle_id?: string
  connection_id?: string
  audio?: boolean
  video?: boolean
  minutes: number
  authn_metadata?: JSONType
  authz_metadata?: JSONType
  metadata?: JSONType
  channel_connections: number
  channel_sendrecv_connections: number
  channel_sendonly_connections: number
  channel_recvonly_connections: number
  turn_transport_type: 'udp' | 'tcp'
}

export type SignalingNotifySpotlightChanged = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'spotlight.changed'
  client_id: string | null
  connection_id: string | null
  spotlight_id: string
  fixed?: boolean
  audio: boolean
  video: boolean
}

export type SignalingNotifySpotlightFocused = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'spotlight.focused'
  client_id: string | null
  connection_id: string
  audio: boolean
  video: boolean
  fixed: boolean
}

export type SignalingNotifySpotlightUnfocused = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'spotlight.unfocused'
  client_id: string | null
  connection_id: string
  audio: boolean
  video: boolean
  fixed: boolean
}

export type SignalingNotifyNetworkStatus = {
  type: typeof SIGNALING_MESSAGE_TYPE_NOTIFY
  event_type: 'network.status'
  unstable_level: 0 | 1 | 2 | 3
}

export type DataChannelDirection = 'sendonly' | 'sendrecv' | 'recvonly'

export type MessagingHeaderFieldType = 'sender_connection_id'
export type MessagingHeaderField = {
  type: MessagingHeaderFieldType
  length?: number
}

export type DataChannelConfiguration = {
  label: string
  direction: DataChannelDirection
  compress?: boolean
  maxPacketLifeTime?: number
  maxRetransmits?: number
  protocol?: string
  ordered?: boolean
  header?: MessagingHeaderField[]
}

export type ForwardingFilterRuleField = 'connection_id' | 'client_id' | 'kind'
export type ForwardingFilterRuleOperator = 'is_in' | 'is_not_in'
export type ForwardingFilterRuleKindValue = 'audio' | 'video'
export type ForwardingFilterRuleValue = string | ForwardingFilterRuleKindValue
export type ForwardingFilterRule = {
  field: ForwardingFilterRuleField
  operator: ForwardingFilterRuleOperator
  values: [ForwardingFilterRuleValue]
}
export type ForwardingFilterAction = 'block' | 'allow'

export type ForwardingFilter = {
  version?: string
  metadata?: JSONType
  action?: ForwardingFilterAction
  rules: [[ForwardingFilterRule]]
  name?: string
  priority?: number
}

export type ConnectionOptions = {
  audio?: boolean
  audioCodecType?: AudioCodecType
  audioBitRate?: number
  audioOpusParamsChannels?: number
  audioOpusParamsMaxplaybackrate?: number
  audioOpusParamsStereo?: boolean
  audioOpusParamsSpropStereo?: boolean
  audioOpusParamsMinptime?: number
  audioOpusParamsPtime?: number
  audioOpusParamsUseinbandfec?: boolean
  audioOpusParamsUsedtx?: boolean
  video?: boolean
  videoCodecType?: VideoCodecType
  videoBitRate?: number
  videoVP9Params?: JSONType
  videoH264Params?: JSONType
  videoH265Params?: JSONType
  videoAV1Params?: JSONType
  spotlight?: boolean
  spotlightNumber?: number
  spotlightFocusRid?: SpotlightFocusRid
  spotlightUnfocusRid?: SpotlightFocusRid
  simulcast?: boolean
  simulcastRid?: SimulcastRid
  clientId?: string
  // @deprecated このオプションは非推奨です。将来のバージョンで削除される可能性があります。
  timeout?: number
  connectionTimeout?: number
  signalingNotifyMetadata?: JSONType
  dataChannelSignaling?: boolean
  ignoreDisconnectWebSocket?: boolean
  disconnectWaitTimeout?: number
  signalingCandidateTimeout?: number
  dataChannels?: DataChannelConfiguration[]
  bundleId?: string
  audioStreamingLanguageCode?: string
  forwardingFilters?: ForwardingFilter[]
  // @deprecated このオプションは非推奨です。将来のバージョンで削除される可能性があります。
  forwardingFilter?: ForwardingFilter

  // Sora JavaScript SDK 内部で利用するオプション
  // SDP で Answer に stereo=1 を追記する
  forceStereoOutput?: boolean

  // ICE 候補をスキップする
  skipIceCandidateEvent?: boolean

  // 再接続設定
  // 自動再接続を有効化 (デフォルト: false)
  autoReconnect?: boolean
  // 最大再接続試行回数 (デフォルト: 8)
  maxReconnectAttempts?: number
  // 初回再接続遅延時間 (ms) (デフォルト: 1000)
  reconnectDelay?: number
  // 指数バックオフ係数 (デフォルト: 2.0)
  reconnectBackoff?: number
  // 最大再接続遅延時間 (ms) (デフォルト: 30000)
  maxReconnectDelay?: number
}

export type Callbacks = {
  disconnect: (event: SoraCloseEvent) => void
  push: (event: SignalingPushMessage, transportType: TransportType) => void
  track: (event: RTCTrackEvent) => void
  removetrack: (event: MediaStreamTrackEvent) => void
  notify: (event: SignalingNotifyMessage, transportType: TransportType) => void
  log: (title: string, message: JSONType) => void
  timeout: () => void
  timeline: (event: TimelineEvent) => void
  signaling: (event: SignalingEvent) => void
  message: (event: DataChannelMessageEvent) => void
  datachannel: (event: DataChannelEvent) => void
  reconnecting: (event: ReconnectingEvent) => void
  reconnected: (event: ReconnectedEvent) => void
  reconnecterror: (event: ReconnectErrorEvent) => void
}

// 再接続開始時に発火するイベント
export interface ReconnectingEvent extends Event {
  // 現在の試行回数 (1 から開始)
  readonly attempt: number
  // 最大試行回数
  readonly maxAttempts: number
  // 次の再接続までの待機時間 (ms)
  readonly delay: number
  // 最後のエラー内容
  readonly lastError?: string
}

// 再接続成功時に発火するイベント
export interface ReconnectedEvent extends Event {
  // 現在の試行回数 (1 から開始)
  readonly attempt: number
  // 最初の切断から再接続成功までの実際の経過時間 (ms)
  readonly totalDelay: number
}

// 再接続エラー時に発火するイベント
export interface ReconnectErrorEvent extends Event {
  // 現在の試行回数 (1 から開始)
  readonly attempt: number
  // 最後のエラー内容
  readonly lastError?: string
}

export interface AutoReconnectorCallbacks {
  // 再接続試行ごとに呼び出す
  reconnect: (attempt: number) => Promise<void>
  // 再接続を開始する際に通知する
  fireReconnecting: (event: ReconnectingEvent) => void
  // 再接続に成功した際に通知する
  fireReconnected: (event: ReconnectedEvent) => void
  // 再接続に失敗し、これ以上試行しない場合に通知する
  fireReconnectError: (event: ReconnectErrorEvent) => void
  // 再接続を続けてよいかどうか判定する。false の場合試行を終了する
  shouldContinue: () => boolean
  // MediaStream など再接続不可条件を検知した際に呼び出す
  handleReconnectAbort: () => void
}

export type Browser = 'edge' | 'chrome' | 'safari' | 'opera' | 'firefox' | null

export type TransportType = typeof TRANSPORT_TYPE_WEBSOCKET | typeof TRANSPORT_TYPE_DATACHANNEL
export type SignalingMessageDirection = 'sent' | 'received'

export type TimelineEventLogType = TransportType | 'peerconnection' | 'sora'

// @todo 未実装
export interface SignalingMessageEvent extends Event {
  type: TransportType
  direction: SignalingMessageDirection
  message: WebSocketSignalingMessage | DataChannelSignalingMessage
}

export interface SignalingEvent extends Event {
  transportType: TransportType
  data?: unknown
}

export interface DataChannelMessageEvent extends Event {
  label: string
  data: ArrayBuffer
}

export interface DataChannelEvent extends Event {
  datachannel: DataChannelConfiguration
}

export interface TimelineEvent extends Event {
  logType: TimelineEventLogType
  data?: unknown
  dataChannelId?: number | null
  dataChannelLabel?: string
}

export interface SoraCloseEvent extends Event {
  title: string
  code?: number
  reason?: string
  params?: Record<string, unknown>
}

export type SoraCloseEventType = 'normal' | 'abend'

export type SoraCloseEventInitDict = {
  code?: number
  reason?: string
  params?: Record<string, unknown>
}

export type SoraAbendTitle =
  | 'CONNECTION-STATE-FAILED'
  | 'DATA-CHANNEL-ONERROR'
  | 'ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT'
  | 'ICE-CONNECTION-STATE-FAILED'
  | 'INTERNAL-ERROR'
  | 'WEBSOCKET-ONCLOSE'
  | 'WEBSOCKET-ONERROR'

// RPC 機能
export interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number
  method: string
  params?: Record<string, unknown> | unknown[]
}

export interface JSONRPCSuccessResponse {
  jsonrpc: '2.0'
  id: string | number
  result: unknown
}

export interface JSONRPCErrorResponse {
  jsonrpc: '2.0'
  id: string | number
  error: {
    code: number
    message: string
    data?: unknown
  }
}

export type JSONRPCResponse = JSONRPCSuccessResponse | JSONRPCErrorResponse

// RPC options
export type RPCOptions = {
  timeout?: number
  notification?: boolean
}
