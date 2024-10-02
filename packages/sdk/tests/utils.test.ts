import { expect, test } from 'vitest'
import type { AudioCodecType, DataChannelDirection, VideoCodecType } from '../src/types'
import { createConnectSignalingMessage } from '../src/utils'

const channelId = '7N3fsMHob'
const metadata = 'PG9A6RXgYqiqWKOVO'
const clientId = 'clientId'
const sdp = 'v=0...'
const userAgent = window.navigator.userAgent
const soraClient = `Sora JavaScript SDK ${__SORA_JS_SDK_VERSION__}`
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
test('createConnectSignalingMessage simple sendonly', () => {
  expect(createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  )
})

test('createConnectSignalingMessage simple recvonly', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { role: 'recvonly' })
  expect(createConnectSignalingMessage(sdp, 'recvonly', channelId, undefined, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createConnectSignalingMessage simple sendrecv', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    role: 'sendrecv',
    multistream: true,
  })
  expect(
    createConnectSignalingMessage(
      sdp,
      'sendrecv',
      channelId,
      undefined,
      { multistream: true },
      false,
    ),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage sendrecv and undefined multistream', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    role: 'sendrecv',
  })
  expect(createConnectSignalingMessage(sdp, 'sendrecv', channelId, undefined, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createConnectSignalingMessage invalid role', () => {
  expect(() => {
    createConnectSignalingMessage(sdp, 'test', channelId, metadata, {}, false)
  }).toThrow(Error('Unknown role type'))
})

test('createConnectSignalingMessage sendrecv and multistream: false', () => {
  expect(() => {
    createConnectSignalingMessage(
      sdp,
      'sendrecv',
      channelId,
      metadata,
      { multistream: false },
      false,
    )
  }).toThrow(
    Error(
      "Failed to parse options. Options multistream must be true when connecting using 'sendrecv'",
    ),
  )
})

/**
 * channelId test
 */
test('createConnectSignalingMessage channelId: null', () => {
  expect(() => {
    createConnectSignalingMessage(sdp, 'sendonly', null, undefined, {}, false)
  }).toThrow(Error('channelId can not be null or undefined'))
})

test('createConnectSignalingMessage channelId: undefined', () => {
  expect(() => {
    createConnectSignalingMessage(sdp, 'sendonly', undefined, undefined, {}, false)
  }).toThrow(Error('channelId can not be null or undefined'))
})

/**
 * metadata test
 */
test('createConnectSignalingMessage metadata', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { metadata: metadata })
  expect(createConnectSignalingMessage(sdp, 'sendonly', channelId, metadata, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createConnectSignalingMessage metadata: null', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { metadata: null })
  expect(createConnectSignalingMessage(sdp, 'sendonly', channelId, null, {}, false)).toEqual(
    expectedMessage,
  )
})

test('createConnectSignalingMessage metadata: undefined', () => {
  expect(createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * clientId test
 */
test('createConnectSignalingMessage clientId', () => {
  const options = { clientId: clientId }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { client_id: options.clientId })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage clientId: empty string', () => {
  const options = { clientId: '' }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { client_id: options.clientId })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage clientId: undefined', () => {
  const options = { clientId: undefined }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * multistream test
 */
test('createConnectSignalingMessage multistream: true', () => {
  const options = { multistream: true }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    multistream: options.multistream,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage undefined multistream', () => {
  const options = {}
  const expectedMessage = Object.assign({}, baseExpectedMessage, {})
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage multistream: false', () => {
  const options = { multistream: false }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    multistream: options.multistream,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

/**
 * audio test
 */
test('createConnectSignalingMessage audio: false', () => {
  const options = {
    audio: false,
    audioCodecType: audioCodecType,
    audioBitRate: 100,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { audio: false })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audio: true', () => {
  const options = {
    audio: true,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

test('createConnectSignalingMessage audio: undefined', () => {
  const options = {
    audio: undefined,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

test('createConnectSignalingMessage audio parameters', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsChannels', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsMaxplaybackrate', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsStereo', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsSpropStereo', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsMinptime', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsPtime', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsUseinbandfec', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage audioOpusParamsUsedtx', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

/**
 * video test
 */
test('createConnectSignalingMessage video: false', () => {
  const options = {
    video: false,
    videoCodecType: videoCodecType,
    videoBitRate: 100,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { video: false })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage video: true', () => {
  const options = {
    video: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { video: true })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage video: undefined', () => {
  const options = {
    video: undefined,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { video: true })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage video parameters', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

/**
 * signalingNotifyMetadata test
 */
test('createConnectSignalingMessage signalingMetadata', () => {
  const options = {
    signalingNotifyMetadata: 'signalingNotifyMetadata',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage signalingMetadata: empty string', () => {
  const options = {
    signalingNotifyMetadata: '',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage signalingMetadata: object', () => {
  const options = {
    signalingNotifyMetadata: { key: 'value' },
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage signalingMetadata: null', () => {
  const options = {
    signalingNotifyMetadata: null,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    signaling_notify_metadata: options.signalingNotifyMetadata,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

/**
 * dataChannelSignaling test
 */
test('createConnectSignalingMessage dataChannelSignaling: true', () => {
  const options = {
    dataChannelSignaling: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    data_channel_signaling: options.dataChannelSignaling,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage dataChannelSignaling: false', () => {
  const options = {
    dataChannelSignaling: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    data_channel_signaling: options.dataChannelSignaling,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage dataChannelSignaling: undefined', () => {
  const options = {
    dataChannelSignaling: undefined,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * ignoreDisconnectWebSocket test
 */
test('createConnectSignalingMessage ignoreDisconnectWebSocket: true', () => {
  const options = {
    ignoreDisconnectWebSocket: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage ignoreDisconnectWebSocket: false', () => {
  const options = {
    ignoreDisconnectWebSocket: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage ignoreDisconnectWebSocket: undefined', () => {
  const options = {
    ignoreDisconnectWebSocket: undefined,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * redirect test
 */
test('createConnectSignalingMessage redirect: true', () => {
  const expectedMessage = Object.assign({}, baseExpectedMessage, { redirect: true })
  expect(createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, true)).toEqual(
    expectedMessage,
  )
})

test('createConnectSignalingMessage redirect: false', () => {
  expect(createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  )
})

/**
 * dataChannels test
 */
test('createConnectSignalingMessage dataChannels: invalid value', () => {
  // array 以外の場合は追加されない
  const options = {
    dataChannels: 'test',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

test('createConnectSignalingMessage dataChannels: empty array ', () => {
  // array が空の場合は追加されない
  const options = {
    dataChannels: [],
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

test('createConnectSignalingMessage dataChannels: invalid array', () => {
  // dataChannel に object 以外が含まれる場合は例外が発生する
  const options = {
    dataChannels: [{ label: 'test', direction: 'sendrecv' }, 'test'],
  }
  expect(() => {
    // @ts-ignore option で指定されている型以外を引数に指定する
    createConnectSignalingMessage(sdp, 'sendonly', channelId, null, options, false)
  }).toThrow(
    "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
  )
})

test('createConnectSignalingMessage dataChannels: invalid array(null in array)', () => {
  // dataChannel に null が含まれる場合は例外が発生する
  const options = {
    dataChannels: [{ label: 'test', direction: 'sendrecv' }, null],
  }
  expect(() => {
    // @ts-ignore option で指定されている型以外を引数に指定する
    createConnectSignalingMessage(sdp, 'sendonly', channelId, null, options, false)
  }).toThrow(
    "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
  )
})

test('createConnectSignalingMessage dataChannels', () => {
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
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

/**
 * bundleId test
 */
test('createConnectSignalingMessage bundleId', () => {
  const options = {
    bundleId: 'bundleId',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { bundle_id: options.bundleId })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage bundleId: empty string', () => {
  const options = {
    bundleId: '',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { bundle_id: options.bundleId })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage bundleId: undefined', () => {
  const options = {
    bundleId: undefined,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * simulcastRid test
 */
test('createConnectSignalingMessage simulcastRid', () => {
  const options = {
    simulcastRid: 'r0',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    simulcast_rid: options.simulcastRid,
  })
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage simulcastRid: unknown string', () => {
  // "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    simulcastRid: '',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * spotlight test
 */
test('createConnectSignalingMessage spotlight: true', () => {
  const options = {
    spotlight: true,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { spotlight: options.spotlight })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage spotlight: false', () => {
  const options = {
    spotlight: false,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, { spotlight: options.spotlight })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

/**
 * spotlightFocusRid test
 */
test('createConnectSignalingMessage spotlightFocusRid', () => {
  const options = {
    spotlightFocusRid: 'r0',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_focus_rid: options.spotlightFocusRid,
  })
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage spotlightFocusRid: unknown string', () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightFocusRid: '',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * spotlightUnfocusRid test
 */
test('createConnectSignalingMessage spotlightUnfocusRid', () => {
  const options = {
    spotlightUnfocusRid: 'r0',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_unfocus_rid: options.spotlightUnfocusRid,
  })
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage spotlightFocusRid: unknown string', () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightUnfocusRid: '',
  }
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

/**
 * spotlightNumber test
 */
test('createConnectSignalingMessage spotlightNumber', () => {
  const options = {
    spotlightNumber: 5,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_number: options.spotlightNumber,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage spotlightNumber: 0', () => {
  const options = {
    spotlightNumber: 0,
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    spotlight_number: options.spotlightNumber,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})

test('createConnectSignalingMessage spotlightNumber: undefined', () => {
  const options = {
    spotlightNumber: undefined,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

test('createConnectSignalingMessage audioStreamingLanguageCode: undefined', () => {
  const options = {
    audioStreamingLanguageCode: undefined,
  }
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(baseExpectedMessage)
})

test('createConnectSignalingMessage audioStreamingLanguageCode: ja-JP', () => {
  const options = {
    audioStreamingLanguageCode: 'ja-JP',
  }
  const expectedMessage = Object.assign({}, baseExpectedMessage, {
    audio_streaming_language_code: options.audioStreamingLanguageCode,
  })
  expect(
    createConnectSignalingMessage(sdp, 'sendonly', channelId, undefined, options, false),
  ).toEqual(expectedMessage)
})
