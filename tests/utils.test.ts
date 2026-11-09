// XXX: assert を使うと型がエラーがうるさいため expect を使ってる

import type {
  AudioCodecType,
  DataChannelDirection,
  SignalingOfferMessageDataChannel,
  VideoCodecType,
} from "../src/types";
import {
  ConnectError,
  createErrorFromJSONRPCError,
  createReceiverConnectionIdListMessage,
  createSignalingMessage,
  hasReceiverConnectionIdListHeader,
  redact,
} from "../src/utils";

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
  const message = createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false);
  expect(message).toStrictEqual(baseExpectedMessage);
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
 * simulcast fallback test
 */
test("createSignalingMessage simulcast: sendonly で RTCRtpSender が無い場合は throw する", () => {
  // jsdom には RTCRtpSender が無いため enabledSimulcast() は false を返す。
  // simulcast 非対応の環境では、Sora に connect を送る前に throw することを検証する。
  const options = {
    simulcast: true,
  };
  expect(() => {
    createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false);
  }).toThrow(new Error("Simulcast can not be used with this browser"));
});

test("createSignalingMessage simulcast: recvonly は simulcast を指定しても throw しない", () => {
  // recvonly は simulcast の送出を行わないが、Sora への接続設定として simulcast フラグは送る。
  // RTCRtpSender が無い環境でも connect メッセージを生成できることを検証する。
  const options = {
    simulcast: true,
  };
  const message = createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false);
  expect(message).toStrictEqual({
    ...baseExpectedMessage,
    role: "recvonly",
    simulcast: true,
  });
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
  const message = createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false);
  expect(message).toStrictEqual({
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
  const message = createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false);
  expect(message).toStrictEqual({
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
  const message = createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false);
  expect(message).toStrictEqual({
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
  const message = createSignalingMessage(sdp, "recvonly", channelId, undefined, options, false);
  expect(message).toStrictEqual({
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
  const message = createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false);
  expect(message).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlightFocusRid: unknown string", () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightFocusRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  const message = createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false);
  expect(message).toStrictEqual(baseExpectedMessage);
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
  const message = createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false);
  expect(message).toStrictEqual(expectedMessage);
});

test("createSignalingMessage spotlightUnfocusRid: unknown string", () => {
  // "none", "r0", "r1", "r2" 以外の場合は追加されない
  const options = {
    spotlightUnfocusRid: "",
  };
  // @ts-expect-error option で指定されている型以外を引数に指定する
  const message = createSignalingMessage(sdp, "sendonly", channelId, undefined, options, false);
  expect(message).toStrictEqual(baseExpectedMessage);
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
test.each<["WS_SEND_INVALID_STATE" | "WS_SEND_FAILED"]>([
  ["WS_SEND_INVALID_STATE"],
  ["WS_SEND_FAILED"],
])("new ConnectError(message, undefined, %s) は sendAnswer 経路の reason を設定する", (reason) => {
  const e = new ConnectError("send answer failed", undefined, reason);
  expect(e.message).toBe("send answer failed");
  expect(e.code).toBeUndefined();
  expect(e.reason).toBe(reason);
});

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
test.each<[string]>([
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
test.each<[string, unknown, unknown]>([
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
  obj["self"] = obj;
  const result = redact(obj) as Record<string, unknown>;
  expect(result["name"]).toBe("root");
  expect(result["self"]).toBe("[Circular]");
  expect(result).not.toBe(obj);
  // 入力オブジェクト側の循環参照はそのまま残っていること (非破壊)
  expect(obj["self"]).toBe(obj);
});

// DAG 構造 (同一オブジェクトを複数箇所から参照) の挙動を固定化する
// trace 経路に渡る signaling メッセージは tree 構造で DAG は通常発生しないが、
// WeakSet を再帰ツリー全体で共有しているため、後から訪れた参照は `[Circular]`
// に置換される挙動である
test("redact は DAG の兄弟参照を `[Circular]` 化する", () => {
  const sub = { x: 1 };
  const result = redact({ a: sub, b: sub }) as Record<string, unknown>;
  expect(result["a"]).toStrictEqual({ x: 1 });
  expect(result["b"]).toBe("[Circular]");
});

/**
 * createErrorFromJSONRPCError のテスト
 *
 * サーバーが返した JSON-RPC エラーの内容が失われないことを検証する。
 * E2E は Sora が仕様どおりに返すエラーしか再現できないため、仕様に反する値でも
 * reject (settle) できることはここで検証する。
 */

// JSON-RPC 2.0 のエラーは code / message を必須、data を任意で持つ
// message を Error の message に、オブジェクト全体を cause に保持すること
test("createErrorFromJSONRPCError は message と cause を保持する", () => {
  const error = createErrorFromJSONRPCError({
    code: -32_602,
    data: { "UNKNOWN-KEYS": ["invalid_param"] },
    message: "JSON-RPC-INVALID-PARAMS",
  });

  expect(error.message).toBe("JSON-RPC-INVALID-PARAMS");
  expect(error.name).toBe("Error");
  // サブクラスではなく plain な Error であること (Error.prototype を直接継承する)
  expect(Object.getPrototypeOf(error)).toBe(Error.prototype);
  expect(error.cause).toStrictEqual({
    code: -32_602,
    data: { "UNKNOWN-KEYS": ["invalid_param"] },
    message: "JSON-RPC-INVALID-PARAMS",
  });
});

// data が無い場合でも code / message を cause から取得できること
test("createErrorFromJSONRPCError は data が無い場合も message と cause を保持する", () => {
  const error = createErrorFromJSONRPCError({ code: -32_602, message: "Invalid params" });

  expect(error.message).toBe("Invalid params");
  expect(error.cause).toStrictEqual({ code: -32_602, message: "Invalid params" });
});

// サーバーがオブジェクト以外 (JSON-RPC 2.0 に反する値) を返しても TypeError にならず
// Error で settle できること (2026.1.0 までの `new Error(String(reason))` と同じ message)
test.each([[null], [undefined], ["boom"]])(
  "createErrorFromJSONRPCError は %s でも Error を組み立てる",
  (value) => {
    const error = createErrorFromJSONRPCError(value);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(String(value));
    // オブジェクト以外はサーバーが返したエラーとして扱わない (cause を設定しない)
    expect(error.cause).toBeUndefined();
  },
);

// JSON-RPC 2.0 の error はオブジェクトのため、message が文字列でないオブジェクトでも
// cause に保持して code / data を捨てないこと
// (cause が設定されていればサーバーが返したエラーと判別できる契約を保つ)
test.each([[{ code: -32_602 }], [["a", "b"]]])(
  "createErrorFromJSONRPCError は %s でも cause に保持する",
  (value) => {
    const error = createErrorFromJSONRPCError(value);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(JSON.stringify(value));
    expect(error.cause).toBe(value);
  },
);

/**
 * DataChannel メッセージングの宛先ヘッダー (receiver_connection_id_list) のテスト
 *
 * 宛先ヘッダーは [count (1 byte)][receiver_connection_id (26 bytes) x count] で、
 * 宛先ヘッダーを付けたメッセージは [count][receiver_connection_id x count][message] の形になる
 */

// テスト用に、index ごとに異なる 26 文字 (ASCII なので 26 バイト) の connection_id を作る
const createTestConnectionId = (index: number): string => `C${String(index).padStart(25, "0")}`;

// 宛先ヘッダーを付けたメッセージの期待値を、仕様の形どおりに組み立てる
const createExpectedReceiverConnectionIdListMessage = (
  message: Uint8Array,
  receiverConnectionIds: string[],
): Uint8Array => {
  const encodedConnectionIds = receiverConnectionIds.flatMap((connectionId) => [
    ...new TextEncoder().encode(connectionId),
  ]);
  return new Uint8Array([receiverConnectionIds.length, ...encodedConnectionIds, ...message]);
};

// 宛先 1 件の場合、count が 1 で、その後ろに connection_id と message が並ぶこと
test("createReceiverConnectionIdListMessage は宛先 1 件の宛先ヘッダーを付けたメッセージを組み立てる", () => {
  const message = new TextEncoder().encode("hello");
  const receiverConnectionIds = [createTestConnectionId(1)];

  const result = createReceiverConnectionIdListMessage(message, receiverConnectionIds);

  expect(result).toStrictEqual(
    createExpectedReceiverConnectionIdListMessage(message, receiverConnectionIds),
  );
  // 1 (count) + 26 (connection_id) + 5 (message) バイトになる
  expect(result.byteLength).toBe(1 + 26 + 5);
  expect(result[0]).toBe(1);
});

// 宛先が複数の場合、件数分の connection_id が渡された順に message の前に並ぶこと
test("createReceiverConnectionIdListMessage は宛先複数件の宛先ヘッダーを渡された順に付ける", () => {
  const message = new Uint8Array([0, 255, 127]);
  const receiverConnectionIds = [
    createTestConnectionId(3),
    createTestConnectionId(1),
    createTestConnectionId(2),
  ];

  const result = createReceiverConnectionIdListMessage(message, receiverConnectionIds);

  expect(result).toStrictEqual(
    createExpectedReceiverConnectionIdListMessage(message, receiverConnectionIds),
  );
  expect(result[0]).toBe(3);
  // 2 件目の connection_id は 1 + 26 バイト目から始まる
  expect(new TextDecoder().decode(result.subarray(1 + 26, 1 + 26 * 2))).toBe(
    createTestConnectionId(1),
  );
});

// count は 1 バイトなので、上限の 255 件まで指定できること
test("createReceiverConnectionIdListMessage は上限の宛先 255 件の宛先ヘッダーを付ける", () => {
  const message = new Uint8Array([1]);
  const receiverConnectionIds = Array.from({ length: 255 }, (_, index) =>
    createTestConnectionId(index),
  );

  const result = createReceiverConnectionIdListMessage(message, receiverConnectionIds);

  expect(result).toStrictEqual(
    createExpectedReceiverConnectionIdListMessage(message, receiverConnectionIds),
  );
  expect(result[0]).toBe(255);
  expect(result.byteLength).toBe(1 + 26 * 255 + 1);
});

// 重複した宛先は SDK では除かず、渡されたとおりに並べること
test("createReceiverConnectionIdListMessage は重複した宛先を除かずに並べる", () => {
  const message = new TextEncoder().encode("dup");
  const receiverConnectionIds = [createTestConnectionId(1), createTestConnectionId(1)];

  const result = createReceiverConnectionIdListMessage(message, receiverConnectionIds);

  expect(result).toStrictEqual(
    createExpectedReceiverConnectionIdListMessage(message, receiverConnectionIds),
  );
  expect(result[0]).toBe(2);
});

// count に 0 を送ると Sora に切断されるため、宛先 0 件は送信前に例外にすること
test("createReceiverConnectionIdListMessage は宛先 0 件で例外を投げる", () => {
  expect(() => {
    createReceiverConnectionIdListMessage(new Uint8Array([1]), []);
  }).toThrow(new Error("Invalid receiverConnectionIds length: expected 1 to 255, got 0"));
});

// count は 1 バイトなので 256 件以上は表せない。送信前に例外にすること
test("createReceiverConnectionIdListMessage は宛先 256 件で例外を投げる", () => {
  const receiverConnectionIds = Array.from({ length: 256 }, (_, index) =>
    createTestConnectionId(index),
  );

  expect(() => {
    createReceiverConnectionIdListMessage(new Uint8Array([1]), receiverConnectionIds);
  }).toThrow(new Error("Invalid receiverConnectionIds length: expected 1 to 255, got 256"));
});

// connection_id は 26 バイト固定なので、25 バイトと 27 バイトの ASCII の connection_id は例外にすること
test.each([
  ["25 バイトの", "C".repeat(25), 25],
  ["27 バイトの", "C".repeat(27), 27],
])(
  "createReceiverConnectionIdListMessage は %s connection_id で例外を投げる",
  (_, connectionId, byteLength) => {
    expect(() => {
      createReceiverConnectionIdListMessage(new Uint8Array([1]), [
        createTestConnectionId(1),
        connectionId,
      ]);
    }).toThrow(
      new Error(
        `Invalid receiver connection_id byte length at index 1: expected 26, got ${byteLength}`,
      ),
    );
  },
);

// 文字数ではなく UTF-8 のバイト数で検査すること
// 「あ」は UTF-8 で 3 バイトなので、26 文字のうち 1 文字を「あ」にすると 28 バイトになる
test("createReceiverConnectionIdListMessage は 26 文字でも 26 バイトでない connection_id で例外を投げる", () => {
  const connectionId = `あ${"C".repeat(25)}`;
  // 前提として 26 文字であることを確かめる
  expect(connectionId).toHaveLength(26);

  expect(() => {
    createReceiverConnectionIdListMessage(new Uint8Array([1]), [connectionId]);
  }).toThrow(
    new Error("Invalid receiver connection_id byte length at index 0: expected 26, got 28"),
  );
});

// バイト数で検査するので、26 文字でなくても UTF-8 で 26 バイトなら受け付けること
// 「あ」(3 バイト) と ASCII 23 文字で、24 文字 26 バイトになる
test("createReceiverConnectionIdListMessage は 26 文字でなくても 26 バイトの connection_id を受け付ける", () => {
  const connectionId = `あ${"C".repeat(23)}`;
  // 前提として 24 文字で、UTF-8 で 26 バイトであることを確かめる
  expect(connectionId).toHaveLength(24);
  expect(new TextEncoder().encode(connectionId).byteLength).toBe(26);
  const message = new Uint8Array([1]);

  const result = createReceiverConnectionIdListMessage(message, [connectionId]);

  expect(result).toStrictEqual(
    createExpectedReceiverConnectionIdListMessage(message, [connectionId]),
  );
});

// message が別のバッファの一部 (byteOffset が 0 でない view) でも、その範囲だけを宛先ヘッダーの後ろに付けること
test("createReceiverConnectionIdListMessage は byteOffset が 0 でない message の範囲だけを付ける", () => {
  const buffer = new Uint8Array([9, 9, 1, 2, 3, 9, 9]);
  const message = buffer.subarray(2, 5);
  const receiverConnectionIds = [createTestConnectionId(1)];

  const result = createReceiverConnectionIdListMessage(message, receiverConnectionIds);

  expect(result).toStrictEqual(
    createExpectedReceiverConnectionIdListMessage(new Uint8Array([1, 2, 3]), receiverConnectionIds),
  );
});

// 空のメッセージは Sora に切断される扱いにしているため、送信前に例外にすること
test("createReceiverConnectionIdListMessage は空の message で例外を投げる", () => {
  expect(() => {
    createReceiverConnectionIdListMessage(new Uint8Array(), [createTestConnectionId(1)]);
  }).toThrow(new Error("Invalid message byte length: expected at least 1, got 0"));
});

// type: offer の data_channels の header に receiver_connection_id_list があるときだけ true になること
// 行は [説明, 期待値, DataChannel の設定] の順に並べる (テスト名の %s を先頭から埋めるため)
test.each<[string, boolean, SignalingOfferMessageDataChannel | undefined]>([
  ["DataChannel が無い場合は", false, undefined],
  ["header が無い場合は", false, { label: "#example", direction: "sendrecv", compress: false }],
  [
    "header が空の場合は",
    false,
    { label: "#example", direction: "sendrecv", compress: false, header: [] },
  ],
  [
    "sender_connection_id だけの場合は",
    false,
    {
      label: "#example",
      direction: "sendrecv",
      compress: false,
      header: [{ type: "sender_connection_id", length: 26 }],
    },
  ],
  [
    "receiver_connection_id_list だけの場合は",
    true,
    {
      label: "#example",
      direction: "sendonly",
      compress: true,
      header: [{ type: "receiver_connection_id_list" }],
    },
  ],
  [
    "sender_connection_id と receiver_connection_id_list の場合は",
    true,
    {
      label: "#example",
      direction: "sendrecv",
      compress: false,
      header: [
        { type: "sender_connection_id", length: 26 },
        { type: "receiver_connection_id_list" },
      ],
    },
  ],
])("hasReceiverConnectionIdListHeader は %s %s を返す", (_, expected, dataChannelSettings) => {
  expect(hasReceiverConnectionIdListHeader(dataChannelSettings)).toBe(expected);
});
