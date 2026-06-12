// XXX: assert を使うと型がエラーがうるさいため expect を使ってる

import type { AudioCodecType, DataChannelDirection, VideoCodecType } from "../src/types";
import { ConnectError, createSignalingMessage, redact } from "../src/utils";

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
  sdp,
  sora_client: soraClient,
  type: "connect",
  video: true,
});

/**
 * role test
 */
test("createSignalingMessage simple sendonly", () => {
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, false)).toStrictEqual(
    baseExpectedMessage,
  );
});

test("createSignalingMessage simple recvonly", () => {
  const expectedMessage = { ...baseExpectedMessage, role: "recvonly" };
  expect(createSignalingMessage(sdp, "recvonly", channelId, undefined, {}, false)).toStrictEqual(
    expectedMessage,
  );
});

test("createSignalingMessage simple sendrecv", () => {
  const expectedMessage = { ...baseExpectedMessage, role: "sendrecv" };
  expect(createSignalingMessage(sdp, "sendrecv", channelId, undefined, {}, false)).toStrictEqual(
    expectedMessage,
  );
});

test("createSignalingMessage sendrecv and undefined multistream", () => {
  const expectedMessage = { ...baseExpectedMessage, role: "sendrecv" };
  expect(createSignalingMessage(sdp, "sendrecv", channelId, undefined, {}, false)).toStrictEqual(
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
  const expectedMessage = { ...baseExpectedMessage, metadata };
  expect(createSignalingMessage(sdp, "sendonly", channelId, metadata, {}, false)).toStrictEqual(
    expectedMessage,
  );
});

test("createSignalingMessage metadata: null", () => {
  const expectedMessage = { ...baseExpectedMessage, metadata: null };
  expect(createSignalingMessage(sdp, "sendonly", channelId, null, {}, false)).toStrictEqual(
    expectedMessage,
  );
});

test("createSignalingMessage metadata: undefined", () => {
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, false)).toStrictEqual(
    baseExpectedMessage,
  );
});

/**
 * clientId test
 */
test("createSignalingMessage clientId", () => {
  const options = { clientId };
  const expectedMessage = { ...baseExpectedMessage, client_id: options.clientId };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage clientId: empty string", () => {
  const options = { clientId: "" };
  const expectedMessage = { ...baseExpectedMessage, client_id: options.clientId };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage clientId: undefined", () => {
  const options = { clientId: undefined };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

/**
 * multistream test
 */

test("createSignalingMessage undefined multistream", () => {
  const options = {};
  const expectedMessage = { ...baseExpectedMessage };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

/**
 * audio test
 */
test("createSignalingMessage audio: false", () => {
  const options = {
    audio: false,
    audioBitRate: 100,
    audioCodecType,
  };
  const expectedMessage = { ...baseExpectedMessage, audio: false };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage audio: true", () => {
  const options = {
    audio: true,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

test("createSignalingMessage audio: undefined", () => {
  const options = {
    audio: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

test("createSignalingMessage audio parameters", () => {
  const options = {
    audioBitRate: 100,
    audioCodecType,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio: {
      codec_type: options.audioCodecType,
      bit_rate: options.audioBitRate,
    },
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage audioBitRate: undefined", () => {
  // audioBitRate: undefined 単独の場合、copyOptions delete ループで undefined キーが除去されるため
  // hasAudioProperty が false のまま message.audio は boolean true を保つ
  const options = {
    audioBitRate: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

test("createSignalingMessage audioBitRate: 100, audioCodecType: undefined", () => {
  // 有効値 audioBitRate: 100 のみが拾われ、undefined の audioCodecType は delete ループで除外される
  // (修正前は codec_type: undefined キーも message.audio に残り audio: { codec_type: undefined, bit_rate: 100 } となるため toStrictEqual で fail する)
  const options = {
    audioBitRate: 100,
    audioCodecType: undefined,
  };
  const expectedMessage = { ...baseExpectedMessage, audio: { bit_rate: 100 } };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage audioOpusParamsChannels: undefined", () => {
  // audioOpusParamsChannels: undefined 単独の場合、copyOptions delete ループで undefined キーが
  // 除去されるため hasAudioOpusParamsProperty が false のまま opus_params の {} 化は発生しない
  const options = {
    audioOpusParamsChannels: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

/**
 * video test
 */
test("createSignalingMessage video: false", () => {
  const options = {
    video: false,
    videoBitRate: 100,
    videoCodecType,
  };
  const expectedMessage = { ...baseExpectedMessage, video: false };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage video: true", () => {
  const options = {
    video: true,
  };
  const expectedMessage = { ...baseExpectedMessage, video: true };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage video: undefined", () => {
  const options = {
    video: undefined,
  };
  const expectedMessage = { ...baseExpectedMessage, video: true };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage video parameters", () => {
  const options = {
    videoBitRate: 100,
    videoCodecType,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    video: {
      codec_type: options.videoCodecType,
      bit_rate: options.videoBitRate,
    },
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage videoBitRate: undefined", () => {
  // videoBitRate: undefined 単独の場合、copyOptions delete ループで undefined キーが除去されるため
  // hasVideoProperty が false のまま message.video は boolean true を保つ
  const options = {
    videoBitRate: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage signalingMetadata: empty string", () => {
  const options = {
    signalingNotifyMetadata: "",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage signalingMetadata: object", () => {
  const options = {
    signalingNotifyMetadata: { key: "value" },
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage signalingMetadata: null", () => {
  const options = {
    signalingNotifyMetadata: null,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    signaling_notify_metadata: options.signalingNotifyMetadata,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage dataChannelSignaling: false", () => {
  const options = {
    dataChannelSignaling: false,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    data_channel_signaling: options.dataChannelSignaling,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage dataChannelSignaling: undefined", () => {
  const options = {
    dataChannelSignaling: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage ignoreDisconnectWebSocket: false", () => {
  const options = {
    ignoreDisconnectWebSocket: false,
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    ignore_disconnect_websocket: options.ignoreDisconnectWebSocket,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage ignoreDisconnectWebSocket: undefined", () => {
  const options = {
    ignoreDisconnectWebSocket: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

/**
 * redirect test
 */
test("createSignalingMessage redirect: true", () => {
  const expectedMessage = { ...baseExpectedMessage, redirect: true };
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, true)).toStrictEqual(
    expectedMessage,
  );
});

test("createSignalingMessage redirect: false", () => {
  expect(createSignalingMessage(sdp, "sendonly", channelId, undefined, {}, false)).toStrictEqual(
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

test("createSignalingMessage dataChannels: empty array", () => {
  // array が空の場合は追加されない
  const options = {
    dataChannels: [],
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

/**
 * bundleId test
 */
test("createSignalingMessage bundleId", () => {
  const options = {
    bundleId: "bundleId",
  };
  const expectedMessage = { ...baseExpectedMessage, bundle_id: options.bundleId };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage bundleId: empty string", () => {
  const options = {
    bundleId: "",
  };
  const expectedMessage = { ...baseExpectedMessage, bundle_id: options.bundleId };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage bundleId: undefined", () => {
  const options = {
    bundleId: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
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
  expect(
    createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false),
  ).toStrictEqual({
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
  expect(
    createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false),
  ).toStrictEqual({
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
  expect(
    createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false),
  ).toStrictEqual({
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
  expect(
    createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false),
  ).toStrictEqual({
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlight: false", () => {
  const options = {
    spotlight: false,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight: options.spotlight };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlightFocusRid: unknown string", () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightFocusRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
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
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlightUnfocusRid: unknown string", () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightUnfocusRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

/**
 * spotlightNumber test
 */
test("createSignalingMessage spotlightNumber", () => {
  const options = {
    spotlightNumber: 5,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight_number: options.spotlightNumber };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlightNumber: 0", () => {
  const options = {
    spotlightNumber: 0,
  };
  const expectedMessage = { ...baseExpectedMessage, spotlight_number: options.spotlightNumber };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlightNumber: undefined", () => {
  const options = {
    spotlightNumber: undefined,
  };
  // spotlightNumber: undefined は typeof options.spotlightNumber === "number" ガードで弾かれ
  // message.spotlight_number キー自体が積まれない
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

test("createSignalingMessage audioStreamingLanguageCode: undefined", () => {
  const options = {
    audioStreamingLanguageCode: undefined,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(baseExpectedMessage);
});

test("createSignalingMessage audioStreamingLanguageCode: ja-JP", () => {
  const options = {
    audioStreamingLanguageCode: "ja-JP",
  };
  const expectedMessage = {
    ...baseExpectedMessage,
    audio_streaming_language_code: options.audioStreamingLanguageCode,
  };
  expect(
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false),
  ).toStrictEqual(expectedMessage);
});

/**
 * ConnectError のテスト
 */

// message のみ渡した場合は code / reason が undefined のまま生成され
// name が "ConnectError" となり ConnectError 型として識別できる
test("new ConnectError(message) は code / reason を undefined にして生成する", () => {
  const e = new ConnectError("msg");
  expect(e.message).toBe("msg");
  expect(e.name).toBe("ConnectError");
  expect(e.code).toBeUndefined();
  expect(e.reason).toBeUndefined();
  expect(e).toBeInstanceOf(ConnectError);
});

// 3 引数すべて渡した場合は code / reason が constructor 引数で初期化される
test("new ConnectError(message, code, reason) は 3 引数すべてを初期化する", () => {
  const e = new ConnectError("close", 1006, "abnormal");
  expect(e.message).toBe("close");
  expect(e.code).toBe(1006);
  expect(e.reason).toBe("abnormal");
});

// code だけ指定して reason を省略した場合は reason が undefined のまま生成される
test("new ConnectError(message, code) は reason を undefined のまま生成する", () => {
  const e = new ConnectError("close", 1006);
  expect(e.code).toBe(1006);
  expect(e.reason).toBeUndefined();
});

// code を undefined にして SDK 内部のエラー分類コードを reason のみで指定するパターン
test("new ConnectError(message, undefined, reason) は reason のみを設定する", () => {
  const e = new ConnectError("ws send failed", undefined, "WS_SEND_FAILED");
  expect(e.code).toBeUndefined();
  expect(e.reason).toBe("WS_SEND_FAILED");
});

// sendAnswer 経路 (src/base.ts) で投げる ConnectError の reason 値の存在を固定化する
// (検出範囲は reason 文字列のみ。test name 中の %s は test.each で各値に置換される)
test.each([["WS_SEND_INVALID_STATE"], ["WS_SEND_FAILED"]])(
  "new ConnectError(message, undefined, %s) は sendAnswer 経路の reason を設定する",
  (reason) => {
    const e = new ConnectError("send answer failed", undefined, reason);
    expect(e.message).toBe("send answer failed");
    expect(e.code).toBeUndefined();
    expect(e.reason).toBe(reason);
  },
);

/**
 * redact のテスト
 *
 * trace 経路で JWT 等の機密情報が console / callbacks.log に raw 出力される
 * セキュリティ問題 (issue 0020) を塞ぐ redact 関数を検証する
 */

// トップレベルの機密キー (metadata) は値の中身を見ずに `[REDACTED]` に置換される
// 非機密キー (sdp) はそのまま残る
test("redact は機密キーを [REDACTED] に置換する", () => {
  expect(redact({ metadata: { access_token: "jwt" }, sdp: "v=0" })).toStrictEqual({
    metadata: "[REDACTED]",
    sdp: "v=0",
  });
});

// 配列内のオブジェクトでも機密キー (authn_metadata) が再帰的に redact される
// 非対象キー (type) は影響を受けない
test("redact はネストと配列を再帰処理する", () => {
  expect(redact({ items: [{ authn_metadata: "secret" }, { type: "ok" }] })).toStrictEqual({
    items: [{ authn_metadata: "[REDACTED]" }, { type: "ok" }],
  });
});

// 機密キーを含まないオブジェクトは値も構造もそのまま残る
test("redact は非対象キーをそのまま残す", () => {
  expect(redact({ channel_id: "ch", role: "sendrecv" })).toStrictEqual({
    channel_id: "ch",
    role: "sendrecv",
  });
});

// REDACT_KEYS の全 6 キーが個別に redact 対象であることを固定化する
// (将来 REDACT_KEYS から 1 つでも漏れたら該当ケースが fail する)
test.each([
  ["metadata"],
  ["signaling_notify_metadata"],
  ["authn_metadata"],
  ["authz_metadata"],
  ["access_token"],
  ["secret"],
])("redact は %s キーを [REDACTED] に置換する", (key) => {
  expect(redact({ [key]: "sensitive" })).toStrictEqual({ [key]: "[REDACTED]" });
});

// プリミティブ・null・undefined はそのまま返る (再帰の早期 return 経路)
// ConnectionBase.trace の message: unknown は任意の型で渡りうるため境界値を保証する
test.each([
  ["null", null, null],
  ["undefined", undefined, undefined],
  ["文字列", "hello", "hello"],
  ["数値", 42, 42],
  ["真偽値", true, true],
])("redact は非 object 値 (%s) をそのまま返す", (_label, input, expected) => {
  expect(redact(input)).toBe(expected);
});

// 配列ルート (トップが配列) でも各要素が再帰的に redact される
test("redact は配列ルートを再帰処理する", () => {
  expect(redact([{ metadata: "x" }, { sdp: "v=0" }])).toStrictEqual([
    { metadata: "[REDACTED]" },
    { sdp: "v=0" },
  ]);
});

// 多段ネスト (3 段以上) でも機密キーが再帰的に redact される
test("redact は 3 段以上のネストでも機密キーを redact する", () => {
  expect(redact({ a: { b: { metadata: "jwt", sdp: "v=0" } } })).toStrictEqual({
    a: { b: { metadata: "[REDACTED]", sdp: "v=0" } },
  });
});

// redact は入力を mutation せず新しいオブジェクトを返す (非破壊契約の固定化)
// trace 呼び出し元では redact 後も signaling メッセージ送信を続けるため、in-place
// 化は危険。回帰防止のために明示的なテストを置く
test("redact は元のオブジェクトを破壊せず新しい値を返す", () => {
  const original = { metadata: { jwt: "x" }, sdp: "v=0" };
  const snapshot = JSON.stringify(original);
  const result = redact(original);
  expect(JSON.stringify(original)).toBe(snapshot);
  expect(result).not.toBe(original);
});

// plain object ではないクラスインスタンス (例: Date) は Object.entries で
// 内部状態が拾えず空オブジェクトに潰れてしまうため、そのまま返す
// (PEER CONNECTION CONFIG の RTCCertificate / ONICECANDIDATE の RTCIceCandidate
// などのデバッグ情報が消えないようにするための bypass)
test("redact はクラスインスタンスを bypass してそのまま返す", () => {
  const date = new Date(0);
  expect(redact(date)).toBe(date);
});

// 循環参照を含むオブジェクトを渡してもスタックオーバーフローせず、再訪箇所は
// `[Circular]` 文字列に置換される。入力オブジェクト側の循環参照は破壊せず維持する
test("redact は循環参照を `[Circular]` に置換する", () => {
  const obj: Record<string, unknown> = { name: "root" };
  obj.self = obj;
  const result = redact(obj) as Record<string, unknown>;
  expect(result.name).toBe("root");
  expect(result.self).toBe("[Circular]");
  expect(result).not.toBe(obj);
  // 入力オブジェクト側の循環参照はそのまま残っていること (非破壊)
  expect(obj.self).toBe(obj);
});

// DAG 構造 (同一オブジェクトを複数箇所から参照) の挙動を固定化する
// trace 経路に渡る signaling メッセージは tree 構造で DAG は通常発生しないが、
// WeakSet を再帰ツリー全体で共有しているため、後から訪れた参照は `[Circular]`
// に置換される挙動である
test("redact は DAG の兄弟参照を `[Circular]` 化する", () => {
  const sub = { x: 1 };
  const result = redact({ a: sub, b: sub }) as Record<string, unknown>;
  expect(result.a).toStrictEqual({ x: 1 });
  expect(result.b).toBe("[Circular]");
});
