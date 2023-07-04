import { test, expect } from 'vitest'
import { createSignalingMessage } from '../src/utils'
import { AudioCodecType, DataChannelDirection, VideoCodecType } from '../src/types'

const channelId = '7N3fsMHob'
const metadata = 'PG9A6RXgYqiqWKOVO'
const clientId = 'clientId'
const sdp = 'v=0...'
const userAgent = window.navigator.userAgent
const soraClient = 'Sora JavaScript SDK __SORA_JS_SDK_VERSION__'
const audioCodecType: AudioCodecType = 'OPUS'
const videoCodecType: VideoCodecType = 'VP9'
const baseExpectedMessage = Object.freeze({
  type: 'connect',
  sora_client: soraClient,
  environment: userAgent,
  sdp: sdp,
  audio: true,
  video: true,
  role: 'sendonly',
  channel_id: channelId,
})

/**
 * role test
 */
test('createSignalingMessage simple sendonly', () => {
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage simple recvonly', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { role: 'recvonly' })
  expect(createSignalingMessage(sdp, 'recvonly', channelId, undefined, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage simple sendrecv', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    role: 'sendrecv',
    multistream: true,
  })
  expect(
    createSignalingMessage(sdp, 'sendrecv', channelId, undefined, { multistream: true }, false),
  ).toEqual(expectedMessage)
})

test('createSignalingMessage invalid role', () => {
  expect(() => {
    createSignalingMessage(sdp, 'test', channelId, metadata, {}, false)
  }).toThrow(Error('Unknown role type'))
})

test('createSignalingMessage sendrecv and multistream: false', () => {
  expect(() => {
    createSignalingMessage(sdp, 'sendrecv', channelId, metadata, {}, false)
  }).toThrow(
    Error(
      "Failed to parse options. Options multistream must be true when connecting using 'sendrecv'",
    ),
  )
})

/**
 * channelId test
 */
test('createSignalingMessage channelId: null', () => {
  expect(() => {
    createSignalingMessage(sdp, 'sendonly', null, undefined, {}, false)
  }).toThrow(Error('channelId can not be null or undefined'))
})

test('createSignalingMessage channelId: undefined', () => {
  expect(() => {
    createSignalingMessage(sdp, 'sendonly', undefined, undefined, {}, false)
  }).toThrow(Error('channelId can not be null or undefined'))
})

/**
 * metadata test
 */
test('createSignalingMessage metadata', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { metadata: metadata })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, metadata, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage metadata: null', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { metadata: null })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, null, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage metadata: undefined', () => {
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * clientId test
 */
test('createSignalingMessage clientId', () => {
  const options = { clientId: clientId }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { client_id: options.clientId })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage clientId: empty string', () => {
  const options = { clientId: '' }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { client_id: options.clientId })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage clientId: undefined', () => {
  const options = { clientId: undefined }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * multistream test
 */
test('createSignalingMessage multistream: true', () => {
  const options = { multistream: true }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    multistream: options.multistream,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage multistream: false', () => {
  const options = { multistream: false }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    multistream: options.multistream,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * audio test
 */
test('createSignalingMessage audio: false', () => {
  const options = {
    audio: false,
    audioCodecType: audioCodecType,
    audioBitRate: 100,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { audio: false })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audio: true', () => {
  const options = {
    audio: true,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage audio: undefined', () => {
  const options = {
    audio: undefined,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage audio parameters', () => {
  const options = {
    audioCodecType: audioCodecType,
    audioBitRate: 100,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      codec_type: options.audioCodecType,
      bit_rate: options.audioBitRate,
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsChannels', () => {
  const options = {
    audioOpusParamsChannels: 2,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        channels: options.audioOpusParamsChannels,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsMaxplaybackrate', () => {
  const options = {
    audioOpusParamsMaxplaybackrate: 48000,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        maxplaybackrate: options.audioOpusParamsMaxplaybackrate,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsStereo', () => {
  const options = {
    audioOpusParamsStereo: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        stereo: options.audioOpusParamsStereo,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsSpropStereo', () => {
  const options = {
    audioOpusParamsSpropStereo: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        sprop_stereo: options.audioOpusParamsSpropStereo,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsMinptime', () => {
  const options = {
    audioOpusParamsMinptime: 10,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        minptime: options.audioOpusParamsMinptime,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsPtime', () => {
  const options = {
    audioOpusParamsPtime: 20,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        ptime: options.audioOpusParamsPtime,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsUseinbandfec', () => {
  const options = {
    audioOpusParamsUseinbandfec: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        useinbandfec: options.audioOpusParamsUseinbandfec,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage audioOpusParamsUsedtx', () => {
  const options = {
    audioOpusParamsUsedtx: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio: {
      opus_params: {
        usedtx: options.audioOpusParamsUsedtx,
      },
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * video test
 */
test('createSignalingMessage video: false', () => {
  const options = {
    video: false,
    videoCodecType: videoCodecType,
    videoBitRate: 100,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { video: false })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage video: true', () => {
  const options = {
    video: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { video: true })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage video: undefined', () => {
  const options = {
    video: undefined,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { video: true })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage video parameters', () => {
  const options = {
    videoCodecType: videoCodecType,
    videoBitRate: 100,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    video: {
      codec_type: options.videoCodecType,
      bit_rate: options.videoBitRate,
    },
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * e2ee test
 */
test('createSignalingMessage e2ee: true', () => {
  const options = {
    e2ee: true,
    e2eeWasmUrl: 'wasm',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    e2ee: true,
    video: {
      codec_type: 'VP8',
    },
    signaling_notify_metadata: {},
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage e2ee: false', () => {
  const options = {
    e2ee: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { e2ee: false })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage e2ee: true, video: false', () => {
  const options = {
    e2ee: true,
    e2eeWasmUrl: 'wasm',
    video: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    e2ee: true,
    video: false,
    signaling_notify_metadata: {},
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test("createSignalingMessage e2ee: true, videoCodecType: 'VP9'", () => {
  const options = {
    e2ee: true,
    e2eeWasmUrl: 'wasm',
    VideoCodecType: 'VP9',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    e2ee: true,
    video: {
      codec_type: 'VP8',
    },
    signaling_notify_metadata: {},
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * signalingNotifyMetadata test
 */
test('createSignalingMessage signalingMetadata', () => {
  const options = {
    signalingNotifyMetadata: 'signalingNotifyMetadata',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage signalingMetadata: empty string', () => {
  const options = {
    signalingNotifyMetadata: '',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage signalingMetadata: object', () => {
  const options = {
    signalingNotifyMetadata: { key: 'value' },
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage signalingMetadata: null', () => {
  const options = {
    signalingNotifyMetadata: null,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * dataChannelSignaling test
 */
test('createSignalingMessage dataChannelSignaling: true', () => {
  const options = {
    dataChannelSignaling: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    data_channel_signaling: options.dataChannelSignaling,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage dataChannelSignaling: false', () => {
  const options = {
    dataChannelSignaling: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    data_channel_signaling: options.dataChannelSignaling,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage dataChannelSignaling: undefined', () => {
  const options = {
    dataChannelSignaling: undefined,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * ignoreDisconnectWebSocket test
 */
test('createSignalingMessage ignoreDisconnectWebSocket: true', () => {
  const options = {
    ignoreDisconnectWebSocket: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage ignoreDisconnectWebSocket: false', () => {
  const options = {
    ignoreDisconnectWebSocket: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage ignoreDisconnectWebSocket: undefined', () => {
  const options = {
    ignoreDisconnectWebSocket: undefined,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * redirect test
 */
test('createSignalingMessage redirect: true', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { redirect: true })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, true)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage redirect: false', () => {
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * dataChannels test
 */
test('createSignalingMessage dataChannels: invalid value', () => {
  // array 以外の場合は追加されない
  const options = {
    dataChannels: 'test',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage dataChannels: empty array ', () => {
  // array が空の場合は追加されない
  const options = {
    dataChannels: [],
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage dataChannels: invalid array', () => {
  // dataChannel に object 以外が含まれる場合は例外が発生する
  const options = {
    dataChannels: [{ label: 'test', direction: 'sendrecv' }, 'test'],
  }
  expect(() => {
    // @ts-ignore option で指定されている型以外を引数に指定する
    createSignalingMessage(sdp, 'sendonly', channelId, null, options, false)
  }).toThrow(
    "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
  )
})

test('createSignalingMessage dataChannels: invalid array(null in array)', () => {
  // dataChannel に null が含まれる場合は例外が発生する
  const options = {
    dataChannels: [{ label: 'test', direction: 'sendrecv' }, null],
  }
  expect(() => {
    // @ts-ignore option で指定されている型以外を引数に指定する
    createSignalingMessage(sdp, 'sendonly', channelId, null, options, false)
  }).toThrow(
    "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
  )
})

test('createSignalingMessage dataChannels', () => {
  // 正常系
  const options = {
    dataChannels: [
      { label: 'test', direction: 'sendrecv' as DataChannelDirection },
      {
        label: 'test2',
        direction: 'sendonly' as DataChannelDirection,
        ordered: true,
        maxPacketLifeTime: 100,
        maxRetransmits: 100,
        protocol: 'protocol',
        compress: false,
      },
    ],
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    data_channels: [
      { label: 'test', direction: 'sendrecv' },
      {
        label: 'test2',
        direction: 'sendonly',
        ordered: true,
        max_packet_life_time: 100,
        max_retransmits: 100,
        protocol: 'protocol',
        compress: false,
      },
    ],
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * bundleId test
 */
test('createSignalingMessage bundleId', () => {
  const options = {
    bundleId: 'bundleId',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { bundle_id: options.bundleId })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage bundleId: empty string', () => {
  const options = {
    bundleId: '',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { bundle_id: options.bundleId })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage bundleId: undefined', () => {
  const options = {
    bundleId: undefined,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * simulcastRid test
 */
test('createSignalingMessage simulcastRid', () => {
  const options = {
    simulcastRid: 'r0',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    simulcast_rid: options.simulcastRid,
  })
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage simulcastRid: unknown string', () => {
  // "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    simulcastRid: '',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * spotlight test
 */
test('createSignalingMessage spotlight: true', () => {
  const options = {
    spotlight: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { spotlight: options.spotlight })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage spotlight: false', () => {
  const options = {
    spotlight: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { spotlight: options.spotlight })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

/**
 * spotlightFocusRid test
 */
test('createSignalingMessage spotlightFocusRid', () => {
  const options = {
    spotlightFocusRid: 'r0',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_focus_rid: options.spotlightFocusRid,
  })
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage spotlightFocusRid: unknown string', () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightFocusRid: '',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * spotlightUnfocusRid test
 */
test('createSignalingMessage spotlightUnfocusRid', () => {
  const options = {
    spotlightUnfocusRid: 'r0',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_unfocus_rid: options.spotlightUnfocusRid,
  })
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage spotlightFocusRid: unknown string', () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightUnfocusRid: '',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * spotlightNumber test
 */
test('createSignalingMessage spotlightNumber', () => {
  const options = {
    spotlightNumber: 5,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_number: options.spotlightNumber,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage spotlightNumber: 0', () => {
  const options = {
    spotlightNumber: 0,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_number: options.spotlightNumber,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})

test('createSignalingMessage spotlightNumber: undefined', () => {
  const options = {
    spotlightNumber: undefined,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage audioStreamingLanguageCode: undefined', () => {
  const options = {
    audioStreamingLanguageCode: undefined,
  }
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createSignalingMessage audioStreamingLanguageCode: ja-JP', () => {
  const options = {
    audioStreamingLanguageCode: 'ja-JP',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio_streaming_language_code: options.audioStreamingLanguageCode,
  })
  expect(createSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false)).toEqual(
    expectedMessage,
  )
})
