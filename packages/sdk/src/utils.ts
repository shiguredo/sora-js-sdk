import { unzlibSync } from 'fflate'

import {
  ConnectionOptions,
  Browser,
  JSONType,
  DataChannelConfiguration,
  DataChannelEvent,
  DataChannelMessageEvent,
  PreKeyBundle,
  SignalingConnectMessage,
  SignalingConnectDataChannel,
  SignalingEvent,
  SignalingNotifyMetadata,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  TimelineEvent,
  TimelineEventLogType,
  TransportType,
} from './types'

import { LYRA_VERSION } from '@shiguredo/lyra-wasm'

function browser(): Browser {
  const ua = window.navigator.userAgent.toLocaleLowerCase()
  if (ua.indexOf('edge') !== -1) {
    return 'edge'
  } else if (ua.indexOf('chrome') !== -1 && ua.indexOf('edge') === -1) {
    return 'chrome'
  } else if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
    return 'safari'
  } else if (ua.indexOf('opera') !== -1) {
    return 'opera'
  } else if (ua.indexOf('firefox') !== -1) {
    return 'firefox'
  }
  return null
}

function enabledSimulcast(): boolean {
  const REQUIRED_HEADER_EXTEMSIONS = [
    'urn:ietf:params:rtp-hdrext:sdes:mid',
    'urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id',
    'urn:ietf:params:rtp-hdrext:sdes:repaired-rtp-stream-id',
  ]

  if (!window.RTCRtpSender) {
    return false
  }
  if (!RTCRtpSender.getCapabilities) {
    return false
  }
  const capabilities = RTCRtpSender.getCapabilities('video')
  if (!capabilities) {
    return false
  }
  const headerExtensions = capabilities.headerExtensions.map((h) => h.uri)
  const hasAllRequiredHeaderExtensions = REQUIRED_HEADER_EXTEMSIONS.every((h) =>
    headerExtensions.includes(h),
  )
  return hasAllRequiredHeaderExtensions
}

function parseDataChannelConfiguration(
  dataChannelConfiguration: unknown,
): SignalingConnectDataChannel {
  if (typeof dataChannelConfiguration !== 'object' || dataChannelConfiguration === null) {
    throw new Error(
      "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
    )
  }
  const configuration = dataChannelConfiguration as DataChannelConfiguration
  const result: SignalingConnectDataChannel = {}
  if (typeof configuration.label === 'string') {
    result.label = configuration.label
  }
  if (typeof configuration.direction === 'string') {
    result.direction = configuration.direction
  }
  if (typeof configuration.ordered === 'boolean') {
    result.ordered = configuration.ordered
  }
  if (typeof configuration.compress === 'boolean') {
    result.compress = configuration.compress
  }
  if (typeof configuration.maxPacketLifeTime === 'number') {
    result.max_packet_life_time = configuration.maxPacketLifeTime
  }
  if (typeof configuration.maxRetransmits === 'number') {
    result.max_retransmits = configuration.maxRetransmits
  }
  if (typeof configuration.protocol === 'string') {
    result.protocol = configuration.protocol
  }
  return result
}

function parseDataChannelConfigurations(
  dataChannelConfigurations: unknown[],
): SignalingConnectDataChannel[] {
  const result: SignalingConnectDataChannel[] = []
  for (const dataChannelConfiguration of dataChannelConfigurations) {
    result.push(parseDataChannelConfiguration(dataChannelConfiguration))
  }
  return result
}

export function isSafari(): boolean {
  return browser() === 'safari'
}

export function isChrome(): boolean {
  return browser() === 'chrome'
}

export function isFirefox(): boolean {
  return browser() === 'firefox'
}

export function createSignalingMessage(
  offerSDP: string,
  role: string,
  channelId: string | null | undefined,
  metadata: JSONType | undefined,
  options: ConnectionOptions,
  redirect: boolean,
): SignalingConnectMessage {
  if (role !== 'sendrecv' && role !== 'sendonly' && role !== 'recvonly') {
    throw new Error('Unknown role type')
  }
  if (channelId === null || channelId === undefined) {
    throw new Error('channelId can not be null or undefined')
  }
  const message: SignalingConnectMessage = {
    type: 'connect',
    sora_client: 'Sora JavaScript SDK __SORA_JS_SDK_VERSION__',
    environment: window.navigator.userAgent,
    role: role,
    channel_id: channelId,
    sdp: offerSDP,
    audio: true,
    video: true,
  }
  // role: sendrecv で multistream: false の場合は例外を発生させる
  if (role === 'sendrecv' && options.multistream !== true) {
    throw new Error(
      "Failed to parse options. Options multistream must be true when connecting using 'sendrecv'",
    )
  }
  if (redirect === true) {
    message.redirect = true
  }
  if (typeof options.multistream === 'boolean') {
    message.multistream = options.multistream
  }
  if (typeof options.simulcast === 'boolean') {
    message.simulcast = options.simulcast
  }
  const simalcastRids = ['r0', 'r1', 'r2']
  if (options.simulcastRid !== undefined && 0 <= simalcastRids.indexOf(options.simulcastRid)) {
    message.simulcast_rid = options.simulcastRid
  }
  if (typeof options.spotlight === 'boolean') {
    message.spotlight = options.spotlight
  }
  if ('spotlightNumber' in options) {
    message.spotlight_number = options.spotlightNumber
  }
  const spotlightFocusRids = ['none', 'r0', 'r1', 'r2']
  if (
    options.spotlightFocusRid !== undefined &&
    0 <= spotlightFocusRids.indexOf(options.spotlightFocusRid)
  ) {
    message.spotlight_focus_rid = options.spotlightFocusRid
  }
  if (
    options.spotlightUnfocusRid !== undefined &&
    0 <= spotlightFocusRids.indexOf(options.spotlightUnfocusRid)
  ) {
    message.spotlight_unfocus_rid = options.spotlightUnfocusRid
  }
  if (metadata !== undefined) {
    message.metadata = metadata
  }
  if (options.signalingNotifyMetadata !== undefined) {
    message.signaling_notify_metadata = options.signalingNotifyMetadata
  }
  if (options.forwardingFilter !== undefined) {
    message.forwarding_filter = options.forwardingFilter
  }
  if (options.clientId !== undefined) {
    message.client_id = options.clientId
  }
  if (options.bundleId !== undefined) {
    message.bundle_id = options.bundleId
  }
  if (typeof options.dataChannelSignaling === 'boolean') {
    message.data_channel_signaling = options.dataChannelSignaling
  }

  if (typeof options.ignoreDisconnectWebSocket === 'boolean') {
    message.ignore_disconnect_websocket = options.ignoreDisconnectWebSocket
  }

  // parse options
  const audioPropertyKeys = ['audioCodecType', 'audioBitRate']
  const audioOpusParamsPropertyKeys = [
    'audioOpusParamsChannels',
    'audioOpusParamsMaxplaybackrate',
    'audioOpusParamsStereo',
    'audioOpusParamsSpropStereo',
    'audioOpusParamsMinptime',
    'audioOpusParamsPtime',
    'audioOpusParamsUseinbandfec',
    'audioOpusParamsUsedtx',
  ]
  const audioLyraParamsPropertyKeys = ['audioLyraParamsBitrate', 'audioLyraParamsUsedtx']
  const videoPropertyKeys = [
    'videoCodecType',
    'videoBitRate',
    'videoVP9Params',
    'videoH264Params',
    'videoAV1Params',
  ]
  const copyOptions = Object.assign({}, options)
  ;(Object.keys(copyOptions) as (keyof ConnectionOptions)[]).forEach((key) => {
    if (key === 'audio' && typeof copyOptions[key] === 'boolean') {
      return
    }
    if (key === 'video' && typeof copyOptions[key] === 'boolean') {
      return
    }
    if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
      return
    }
    if (0 <= audioOpusParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
      return
    }
    if (0 <= audioLyraParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
      return
    }
    if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null) {
      return
    }
    delete copyOptions[key]
  })

  if (copyOptions.audio !== undefined) {
    message.audio = copyOptions.audio
  }
  const hasAudioProperty = Object.keys(copyOptions).some((key) => {
    return 0 <= audioPropertyKeys.indexOf(key)
  })
  if (message.audio && hasAudioProperty) {
    message.audio = {}
    if ('audioCodecType' in copyOptions) {
      message.audio['codec_type'] = copyOptions.audioCodecType
    }
    if ('audioBitRate' in copyOptions) {
      message.audio['bit_rate'] = copyOptions.audioBitRate
    }
  }
  const hasAudioOpusParamsProperty = Object.keys(copyOptions).some((key) => {
    return 0 <= audioOpusParamsPropertyKeys.indexOf(key)
  })
  if (message.audio && hasAudioOpusParamsProperty) {
    if (typeof message.audio != 'object') {
      message.audio = {}
    }
    message.audio.opus_params = {}
    if ('audioOpusParamsChannels' in copyOptions) {
      message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels
    }
    if ('audioOpusParamsMaxplaybackrate' in copyOptions) {
      message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate
    }
    if ('audioOpusParamsStereo' in copyOptions) {
      message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo
    }
    if ('audioOpusParamsSpropStereo' in copyOptions) {
      message.audio.opus_params.sprop_stereo = copyOptions.audioOpusParamsSpropStereo
    }
    if ('audioOpusParamsMinptime' in copyOptions) {
      message.audio.opus_params.minptime = copyOptions.audioOpusParamsMinptime
    }
    if ('audioOpusParamsPtime' in copyOptions) {
      message.audio.opus_params.ptime = copyOptions.audioOpusParamsPtime
    }
    if ('audioOpusParamsUseinbandfec' in copyOptions) {
      message.audio.opus_params.useinbandfec = copyOptions.audioOpusParamsUseinbandfec
    }
    if ('audioOpusParamsUsedtx' in copyOptions) {
      message.audio.opus_params.usedtx = copyOptions.audioOpusParamsUsedtx
    }
  }

  if (message.audio && options.audioCodecType == 'LYRA') {
    if (typeof message.audio != 'object') {
      message.audio = {}
    }

    message.audio.lyra_params = { version: LYRA_VERSION }
    if ('audioLyraParamsBitrate' in copyOptions) {
      message.audio.lyra_params.bitrate = copyOptions.audioLyraParamsBitrate
    }
    if ('audioLyraParamsUsedtx' in copyOptions) {
      message.audio.lyra_params.usedtx = copyOptions.audioLyraParamsUsedtx
    }
  }

  if (copyOptions.video !== undefined) {
    message.video = copyOptions.video
  }
  const hasVideoProperty = Object.keys(copyOptions).some((key) => {
    return 0 <= videoPropertyKeys.indexOf(key)
  })
  if (message.video && hasVideoProperty) {
    message.video = {}
    if ('videoCodecType' in copyOptions) {
      message.video['codec_type'] = copyOptions.videoCodecType
    }
    if ('videoBitRate' in copyOptions) {
      message.video['bit_rate'] = copyOptions.videoBitRate
    }
    if ('videoVP9Params' in copyOptions) {
      message.video['vp9_params'] = copyOptions.videoVP9Params
    }
    if ('videoH264Params' in copyOptions) {
      message.video['h264_params'] = copyOptions.videoH264Params
    }
    if ('videoAV1Params' in copyOptions) {
      message.video['av1_params'] = copyOptions.videoAV1Params
    }
  }

  if (message.simulcast && !enabledSimulcast() && role !== 'recvonly') {
    throw new Error('Simulcast can not be used with this browser')
  }
  if (typeof options.e2ee === 'boolean') {
    message.e2ee = options.e2ee
  }
  if (options.e2ee === true) {
    if (message.signaling_notify_metadata === undefined) {
      message.signaling_notify_metadata = {}
    }
    if (
      message.signaling_notify_metadata === null ||
      typeof message.signaling_notify_metadata !== 'object'
    ) {
      throw new Error("E2EE failed. Options signalingNotifyMetadata must be type 'object'")
    }
    if (message.video === true) {
      message.video = {}
    }
    if (message.video) {
      message.video['codec_type'] = 'VP8'
    }
  }

  if (Array.isArray(options.dataChannels) && 0 < options.dataChannels.length) {
    message.data_channels = parseDataChannelConfigurations(options.dataChannels)
  }

  if (options.audioStreamingLanguageCode !== undefined) {
    message.audio_streaming_language_code = options.audioStreamingLanguageCode
  }

  return message
}

export function getSignalingNotifyAuthnMetadata(
  message:
    | SignalingNotifyConnectionCreated
    | SignalingNotifyConnectionDestroyed
    | SignalingNotifyMetadata,
): JSONType {
  if (message.authn_metadata !== undefined) {
    return message.authn_metadata
  } else if (message.metadata !== undefined) {
    return message.metadata
  }
  return null
}

export function getSignalingNotifyData(
  message: SignalingNotifyConnectionCreated,
): SignalingNotifyMetadata[] {
  if (message.data && Array.isArray(message.data)) {
    return message.data
  } else if (message.metadata_list && Array.isArray(message.metadata_list)) {
    return message.metadata_list
  }
  return []
}

export function getPreKeyBundle(message: JSONType): PreKeyBundle | null {
  if (typeof message === 'object' && message !== null && 'pre_key_bundle' in message) {
    return message.pre_key_bundle as PreKeyBundle
  }
  return null
}

export function trace(clientId: string | null, title: string, value: unknown): void {
  const dump = (record: unknown) => {
    if (record && typeof record === 'object') {
      let keys = null
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        keys = Object.keys(JSON.parse(JSON.stringify(record)))
      } catch (_) {
        // 何もしない
      }
      if (keys && Array.isArray(keys)) {
        keys.forEach((key) => {
          console.group(key)
          dump((record as Record<string, unknown>)[key])
          console.groupEnd()
        })
      } else {
        console.info(record)
      }
    } else {
      console.info(record)
    }
  }
  let prefix = ''
  if (window.performance) {
    prefix = '[' + (window.performance.now() / 1000).toFixed(3) + ']'
  }
  if (clientId) {
    prefix = prefix + '[' + clientId + ']'
  }

  if (console.info !== undefined && console.group !== undefined) {
    console.group(prefix + ' ' + title)
    dump(value)
    console.groupEnd()
  } else {
    console.log(prefix + ' ' + title + '\n', value)
  }
}

export class ConnectError extends Error {
  code?: number
  reason?: string
}

export function createSignalingEvent(
  eventType: string,
  data: unknown,
  transportType: TransportType,
): SignalingEvent {
  const event = new Event(eventType) as SignalingEvent
  // data をコピーする
  try {
    event.data = JSON.parse(JSON.stringify(data)) as unknown
  } catch (_) {
    event.data = data
  }
  event.transportType = transportType
  return event
}

export function createDataChannelData(channel: RTCDataChannel): Record<string, unknown> {
  return {
    binaryType: channel.binaryType,
    bufferedAmount: channel.bufferedAmount,
    bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
    id: channel.id,
    label: channel.label,
    maxPacketLifeTime: channel.maxPacketLifeTime,
    maxRetransmits: channel.maxRetransmits,
    negotiated: channel.negotiated,
    ordered: channel.ordered,
    protocol: channel.protocol,
    readyState: channel.readyState,
    // @ts-ignore w3c 仕様には存在しない property
    reliable: channel.reliable,
  }
}

export function createTimelineEvent(
  eventType: string,
  data: unknown,
  logType: TimelineEventLogType,
  dataChannelId?: number | null,
  dataChannelLabel?: string,
): TimelineEvent {
  const event = new Event(eventType) as TimelineEvent
  // data をコピーする
  try {
    event.data = JSON.parse(JSON.stringify(data)) as unknown
  } catch (_) {
    event.data = data
  }
  event.logType = logType
  event.dataChannelId = dataChannelId
  event.dataChannelLabel = dataChannelLabel
  return event
}

export function createDataChannelMessageEvent(
  label: string,
  data: ArrayBuffer,
): DataChannelMessageEvent {
  const event = new Event('message') as DataChannelMessageEvent
  event.label = label
  event.data = data
  return event
}

export function createDataChannelEvent(channel: DataChannelConfiguration): DataChannelEvent {
  const event = new Event('datachannel') as DataChannelEvent
  event.datachannel = channel
  return event
}

export function parseDataChannelEventData(eventData: unknown, compress: boolean): string {
  if (compress) {
    const unzlibMessage = unzlibSync(new Uint8Array(eventData as Uint8Array))
    return new TextDecoder().decode(unzlibMessage)
  }
  return eventData as string
}
