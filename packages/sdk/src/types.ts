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

export type AudioCodecType = 'OPUS' | 'LYRA'

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
      lyra_params?: {
        version?: string
        bitrate?: 3200 | 6000 | 9200
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
      av1_params?: JSONType
    }

export type Role = 'sendrecv' | 'sendonly' | 'recvonly'

export type SignalingConnectDataChannel = {
  label?: string
  direction?: DataChannelDirection
  compress?: boolean
  max_packet_life_time?: number
  max_retransmits?: number
  protocol?: string
  ordered?: boolean
}

export type SignalingConnectMessage = {
  type: 'connect'
  role: Role
  channel_id: string
  client_id?: string
  bundle_id?: string
  metadata?: JSONType
  signaling_notify_metadata?: JSONType
  multistream?: boolean
  spotlight?: boolean
  spotlight_number?: number
  simulcast?: Simulcast
  simulcast_rid?: SimulcastRid
  audio: SignalingAudio
  video: SignalingVideo
  sdp: string
  sora_client: string
  environment: string
  e2ee?: boolean
  spotlight_focus_rid?: SpotlightFocusRid
  spotlight_unfocus_rid?: SpotlightFocusRid
  data_channel_signaling?: boolean
  ignore_disconnect_websocket?: boolean
  redirect?: true
  data_channels?: SignalingConnectDataChannel[]
  audio_streaming_language_code?: string
  forwarding_filter?: JSONType
}

export type SignalingMessage =
  | SignalingOfferMessage
  | SignalingUpdateMessage
  | SignalingReOfferMessage
  | SignalingPingMessage
  | SignalingPushMessage
  | SignalingNotifyMessage
  | SignalingReqStatsMessage
  | SignalingSwitchedMessage
  | SignalingRedirectMessage

export type SignalingOfferMessageDataChannel = {
  label: string
  direction: DataChannelDirection
  compress: boolean
}

export type SignalingOfferMessage = {
  type: 'offer'
  sdp: string
  client_id: string
  connection_id: string
  bundle_id?: string
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

export type SignalingUpdateMessage = {
  type: 'update'
  sdp: string
}

export type SignalingReOfferMessage = {
  type: 're-offer'
  sdp: string
}

export type SignalingPingMessage = {
  type: 'ping'
  stats: boolean
}

export type SignalingPushMessage = {
  type: 'push'
  data: Record<string, unknown>
}

export type SignalingReqStatsMessage = {
  type: 'req-stats'
}

export type SignalingSwitchedMessage = {
  type: 'switched'
  ignore_disconnect_websocket: boolean
}

export type SignalingRedirectMessage = {
  type: 'redirect'
  location: string
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
  type: 'notify'
  event_type: 'connection.created'
  role: Role
  client_id?: string
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
  type: 'notify'
  event_type: 'connection.updated'
  role: Role
  client_id?: string
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
  type: 'notify'
  event_type: 'connection.destroyed'
  role: Role
  client_id?: string
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
  type: 'notify'
  event_type: 'spotlight.changed'
  client_id: string | null
  connection_id: string | null
  spotlight_id: string
  fixed?: boolean
  audio: boolean
  video: boolean
}

export type SignalingNotifySpotlightFocused = {
  type: 'notify'
  event_type: 'spotlight.focused'
  client_id: string | null
  connection_id: string
  audio: boolean
  video: boolean
  fixed: boolean
}

export type SignalingNotifySpotlightUnfocused = {
  type: 'notify'
  event_type: 'spotlight.unfocused'
  client_id: string | null
  connection_id: string
  audio: boolean
  video: boolean
  fixed: boolean
}

export type SignalingNotifyNetworkStatus = {
  type: 'notify'
  event_type: 'network.status'
  unstable_level: 0 | 1 | 2 | 3
}

export type DataChannelDirection = 'sendonly' | 'sendrecv' | 'recvonly'

export type DataChannelConfiguration = {
  label: string
  direction: DataChannelDirection
  compress?: boolean
  maxPacketLifeTime?: number
  maxRetransmits?: number
  protocol?: string
  ordered?: boolean
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
  audioLyraParamsBitrate?: 3200 | 6000 | 9200
  audioLyraParamsUsedtx?: boolean
  video?: boolean
  videoCodecType?: VideoCodecType
  videoBitRate?: number
  videoVP9Params?: JSONType
  videoH264Params?: JSONType
  videoAV1Params?: JSONType
  multistream?: boolean
  spotlight?: boolean
  spotlightNumber?: number
  spotlightFocusRid?: SpotlightFocusRid
  spotlightUnfocusRid?: SpotlightFocusRid
  simulcast?: boolean
  simulcastRid?: SimulcastRid
  clientId?: string
  timeout?: number // deprecated option
  connectionTimeout?: number
  e2ee?: boolean
  signalingNotifyMetadata?: JSONType
  dataChannelSignaling?: boolean
  ignoreDisconnectWebSocket?: boolean
  disconnectWaitTimeout?: number
  signalingCandidateTimeout?: number
  dataChannels?: DataChannelConfiguration[]
  bundleId?: string
  audioStreamingLanguageCode?: string
  forwardingFilter?: JSONType
}

export type Callbacks = {
  disconnect: (event: SoraCloseEvent) => void
  push: (event: SignalingPushMessage, transportType: TransportType) => void
  addstream: (event: RTCTrackEvent) => void
  track: (event: RTCTrackEvent) => void
  removestream: (event: MediaStreamTrackEvent) => void
  removetrack: (event: MediaStreamTrackEvent) => void
  notify: (event: SignalingNotifyMessage, transportType: TransportType) => void
  log: (title: string, message: JSONType) => void
  timeout: () => void
  timeline: (event: TimelineEvent) => void
  signaling: (event: SignalingEvent) => void
  message: (event: DataChannelMessageEvent) => void
  datachannel: (event: DataChannelEvent) => void
}

export type PreKeyBundle = {
  identityKey: string
  signedPreKey: string
  preKeySignature: string
}

export type Browser = 'edge' | 'chrome' | 'safari' | 'opera' | 'firefox' | null

export type TransportType = 'websocket' | 'datachannel' | 'peerconnection'

export type TimelineEventLogType = 'websocket' | 'datachannel' | 'peerconnection' | 'sora'

export interface SignalingEvent extends Event {
  transportType: TransportType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
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

// 以降は Lyra 対応に必要な insertable streams / webrtc encoded transform 用の型定義
//
// TODO(sile): insertable streams や webrtc encoded transform に対応した @types パッケージがリリースされたらそれを使うようにする

// https://www.w3.org/TR/webrtc-encoded-transform/#RTCEncodedAudioFrame-interface
export interface RTCEncodedAudioFrame {
  readonly timestamp: number
  data: ArrayBuffer
  getMetadata(): RTCEncodedAudioFrameMetadata
}

// https://www.w3.org/TR/webrtc-encoded-transform/#dictdef-rtcencodedaudioframemetadata
export interface RTCEncodedAudioFrameMetadata {
  synchronizationSource: number
  payloadType: number
  contributingSources: [number]
}

// https://w3c.github.io/webrtc-encoded-transform/#rtcrtpscripttransform
declare global {
  class RTCRtpScriptTransform {
    constructor(worker: Worker, options?: object, transfer?: object[])
  }
}
