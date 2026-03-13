// XXX: assert を使うと型がエラーがうるさいため expect を使ってる

import type { AudioCodecType, DataChannelDirection, VideoCodecType } from "../src/types";
import { createSignalingMessage } from "../src/utils";

const channelId = "7N3fsMHob";
const metadata = "PG9A6RXgYqiqWKOVO";
const clientId = "clientId";
const sdp = "v=0...";
const { userAgent } = window.navigator;
const soraClient = `Sora JavaScript SDK ${__SORA_JS_SDK_VERSION__}`;
const audioCodecType: AudioCodecType = "OPUS";
const videoCodecType: VideoCodecType = "VP9";
const baseExpectedMessage = Object.freeze({
  audio: true,
  channel_id: channelId,
  environment: userAgent,
  role: "sendonly",
  sdp: sdp,
  sora_client: soraClient,
  type: "connect",
  video: true,
});

/**
 * role test
 */
test("createSignalingMessage simple sendonly", () => {
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage simple recvonly", () => {
  const expectedMessage = { ...baseExpectedMessage, role: "recvonly" };
  expect(createSignalingMessage(sdp, "recvonly", channelId, undefined, {}, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage simple sendrecv", () => {
  const expectedMessage = { ...baseExpectedMessage, role: "sendrecv" };
  expect(createSignalingMessage(sdp, "sendrecv", channelId, undefined, {}, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage sendrecv and undefined multistream", () => {
  const expectedMessage = { ...baseExpectedMessage, role: "sendrecv" };
  expect(createSignalingMessage(sdp, "sendrecv", channelId, undefined, {}, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage invalid role", () => {
  expect(() => {
    createSignalingMessage(sdp, "test", channelId, metadata, {}, false);
  }).toThrow(new Error("Unknown role type"));
});

/**
 * channelId test
 */
test("createSignalingMessage channelId: null", () => {
  expect(() => {
    createSignalingMessage(sdp, "sendonly", null, undefined, {}, false);
  }).toThrow(new Error("channelId can not be null or undefined"));
});

test("createSignalingMessage channelId: undefined", () => {
  expect(() => {
    createSignalingMessage(sdp, "sendonly", undefined, undefined, {}, false);
  }).toThrow(new Error("channelId can not be null or undefined"));
});

/**
 * metadata test
 */
test("createSignalingMessage metadata", () => {
  const expectedMessage = { ...baseExpectedMessage, metadata: metadata };
  expect(createSignalingMessage(sdp, "sendonly", channelId, metadata, {}, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage metadata: null", () => {
  const expectedMessage = { ...baseExpectedMessage, metadata: null };
  expect(createSignalingMessage(sdp, "sendonly", channelId, null, {}, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage metadata: undefined", () => {
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * clientId test
 */
test("createSignalingMessage clientId", () => {
  const options = { clientId: clientId };
  const expectedMessage = { ...baseExpectedMessage, client_id: options.clientId };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage clientId: empty string", () => {
  const options = { clientId: "" };
  const expectedMessage = { ...baseExpectedMessage, client_id: options.clientId };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage clientId: undefined", () => {
  const options = { clientId: undefined };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * multistream test
 */

test("createSignalingMessage undefined multistream", () => {
  const options = {};
  const expectedMessage = { ...baseExpectedMessage };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

/**
 * audio test
 */
test("createSignalingMessage audio: false", () => {
  const options = {
    audio: false,
    audioBitRate: 100,
    audioCodecType: audioCodecType,
  };
  const expectedMessage = { ...baseExpectedMessage, audio: false };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audio: true", () => {
  const options = {
    audio: true,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage audio: undefined", () => {
  const options = {
    audio: undefined,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage audio parameters", () => {
  const options = {
    audioBitRate: 100,
    audioCodecType: audioCodecType,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      codec_type: options.audioCodecType,
      bit_rate: options.audioBitRate,
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsChannels", () => {
  const options = {
    audioOpusParamsChannels: 2,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        channels: options.audioOpusParamsChannels,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsMaxplaybackrate", () => {
  const options = {
    audioOpusParamsMaxplaybackrate: 48_000,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        maxplaybackrate: options.audioOpusParamsMaxplaybackrate,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsStereo", () => {
  const options = {
    audioOpusParamsStereo: true,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        stereo: options.audioOpusParamsStereo,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsSpropStereo", () => {
  const options = {
    audioOpusParamsSpropStereo: true,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        sprop_stereo: options.audioOpusParamsSpropStereo,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsMinptime", () => {
  const options = {
    audioOpusParamsMinptime: 10,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        minptime: options.audioOpusParamsMinptime,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsPtime", () => {
  const options = {
    audioOpusParamsPtime: 20,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        ptime: options.audioOpusParamsPtime,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsUseinbandfec", () => {
  const options = {
    audioOpusParamsUseinbandfec: true,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        useinbandfec: options.audioOpusParamsUseinbandfec,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage audioOpusParamsUsedtx", () => {
  const options = {
    audioOpusParamsUsedtx: false,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      opus_params: {
        usedtx: options.audioOpusParamsUsedtx,
      },
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

/**
 * video test
 */
test("createSignalingMessage video: false", () => {
  const options = {
    video: false,
    videoBitRate: 100,
    videoCodecType: videoCodecType,
  };
  const expectedMessage = { ...baseExpectedMessage, video: false };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage video: true", () => {
  const options = {
    video: true,
  };
  const expectedMessage = { ...baseExpectedMessage, video: true };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage video: undefined", () => {
  const options = {
    video: undefined,
  };
  const expectedMessage = { ...baseExpectedMessage, video: true };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage video parameters", () => {
  const options = {
    videoBitRate: 100,
    videoCodecType: videoCodecType,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    video: {
      codec_type: options.videoCodecType,
      bit_rate: options.videoBitRate,
    },
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

/**
 * signalingNotifyMetadata test
 */
test("createSignalingMessage signalingMetadata", () => {
  const options = {
    signalingNotifyMetadata: "signalingNotifyMetadata",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage signalingMetadata: empty string", () => {
  const options = {
    signalingNotifyMetadata: "",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage signalingMetadata: object", () => {
  const options = {
    signalingNotifyMetadata: { key: "value" },
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage signalingMetadata: null", () => {
  const options = {
    signalingNotifyMetadata: null,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

/**
 * dataChannelSignaling test
 */
test("createSignalingMessage dataChannelSignaling: true", () => {
  const options = {
    dataChannelSignaling: true,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    data_channel_signaling: options.dataChannelSignaling,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage dataChannelSignaling: false", () => {
  const options = {
    dataChannelSignaling: false,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    data_channel_signaling: options.dataChannelSignaling,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage dataChannelSignaling: undefined", () => {
  const options = {
    dataChannelSignaling: undefined,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * ignoreDisconnectWebSocket test
 */
test("createSignalingMessage ignoreDisconnectWebSocket: true", () => {
  const options = {
    ignoreDisconnectWebSocket: true,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage ignoreDisconnectWebSocket: false", () => {
  const options = {
    ignoreDisconnectWebSocket: false,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage ignoreDisconnectWebSocket: undefined", () => {
  const options = {
    ignoreDisconnectWebSocket: undefined,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * redirect test
 */
test("createSignalingMessage redirect: true", () => {
  const expectedMessage = { ...baseExpectedMessage, redirect: true };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, true)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage redirect: false", () => {
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * dataChannels test
 */
test("createSignalingMessage dataChannels: invalid value", () => {
  // array 以外の場合は追加されない
  const options = {
    dataChannels: "test",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage dataChannels: empty array ", () => {
  // array が空の場合は追加されない
  const options = {
    dataChannels: [],
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage dataChannels: invalid array", () => {
  // dataChannel に object 以外が含まれる場合は例外が発生する
  const options = {
    dataChannels: [{ direction: "sendrecv", label: "test" }, "test"],
  };
  expect(() => {
    // @ts-expect-error option で指定されている型以外を引数に指定する
    createSignalingMessage(sdp, "sendonly", channelId, null, options, false);
  }).toThrow(
    "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
  );
});

test("createSignalingMessage dataChannels: invalid array(null in array)", () => {
  // dataChannel に null が含まれる場合は例外が発生する
  const options = {
    dataChannels: [{ direction: "sendrecv", label: "test" }, null],
  };
  expect(() => {
    // @ts-expect-error option で指定されている型以外を引数に指定する
    createSignalingMessage(sdp, "sendonly", channelId, null, options, false);
  }).toThrow(
    "Failed to parse options dataChannels. Options dataChannels element must be type 'object'",
  );
});

test("createSignalingMessage dataChannels", () => {
  // 正常系
  const options = {
    dataChannels: [
      { direction: "sendrecv" as DataChannelDirection, label: "test" },
      {
        compress: false,
        direction: "sendonly" as DataChannelDirection,
        label: "test2",
        maxPacketLifeTime: 100,
        maxRetransmits: 100,
        ordered: true,
        protocol: "protocol",
      },
    ],
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    data_channels: [
      { label: "test", direction: "sendrecv" },
      {
        label: "test2",
        direction: "sendonly",
        ordered: true,
        max_packet_life_time: 100,
        max_retransmits: 100,
        protocol: "protocol",
        compress: false,
      },
    ],
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

/**
 * bundleId test
 */
test("createSignalingMessage bundleId", () => {
  const options = {
    bundleId: "bundleId",
  };
  const expectedMessage = { ...baseExpectedMessage, bundle_id: options.bundleId };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage bundleId: empty string", () => {
  const options = {
    bundleId: "",
  };
  const expectedMessage = { ...baseExpectedMessage, bundle_id: options.bundleId };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage bundleId: undefined", () => {
  const options = {
    bundleId: undefined,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * simulcastRid test
 */
test("createSignalingMessage simulcastRid", () => {
  const options = {
    simulcastRid: "r0",
  };
  const expectedMessage = { ...baseExpectedMessage, simulcast_rid: options.simulcastRid };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false)).toEqual({
    ...expectedMessage,
    role: "recvonly",
  });
});

test("createSignalingMessage simulcastRid: unknown string", () => {
  // "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    simulcastRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false)).toEqual({
    ...baseExpectedMessage,
    role: "recvonly",
  });
});

/**
 * simulcastRequestRid test
 */
test("createSignalingMessage simulcastRequestRid", () => {
  const options = {
    simulcastRequestRid: "r0",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    simulcast_request_rid: options.simulcastRequestRid,
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false)).toEqual({
    ...expectedMessage,
    role: "recvonly",
  });
});

test("createSignalingMessage simulcastRequestRid: unknown string", () => {
  // "none", "r0", "r1", "r2", "auto" 以外の場合は追加されない
  const options = {
    simulcastRequestRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false)).toEqual({
    ...baseExpectedMessage,
    role: "recvonly",
  });
});

/**
 * spotlight test
 */
test("createSignalingMessage spotlight: true", () => {
  const options = {
    spotlight: true,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight: options.spotlight };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage spotlight: false", () => {
  const options = {
    spotlight: false,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight: options.spotlight };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

/**
 * spotlightFocusRid test
 */
test("createSignalingMessage spotlightFocusRid", () => {
  const options = {
    spotlightFocusRid: "r0",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    spotlight_focus_rid: options.spotlightFocusRid,
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage spotlightFocusRid: unknown string", () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightFocusRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * spotlightUnfocusRid test
 */
test("createSignalingMessage spotlightUnfocusRid", () => {
  const options = {
    spotlightUnfocusRid: "r0",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    spotlight_unfocus_rid: options.spotlightUnfocusRid,
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage spotlightFocusRid: unknown string", () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightUnfocusRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

/**
 * spotlightNumber test
 */
test("createSignalingMessage spotlightNumber", () => {
  const options = {
    spotlightNumber: 5,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight_number: options.spotlightNumber };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage spotlightNumber: 0", () => {
  const options = {
    spotlightNumber: 0,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight_number: options.spotlightNumber };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});

test("createSignalingMessage spotlightNumber: undefined", () => {
  const options = {
    spotlightNumber: undefined,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage audioStreamingLanguageCode: undefined", () => {
  const options = {
    audioStreamingLanguageCode: undefined,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage audioStreamingLanguageCode: ja-JP", () => {
  const options = {
    audioStreamingLanguageCode: "ja-JP",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio_streaming_language_code: options.audioStreamingLanguageCode,
  };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false)).toEqual(
    expectedMessage,
  );
});
