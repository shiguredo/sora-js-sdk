import { createSignalingMessage } from "../src/utils";
import { AudioCodecType, MessagingDataChannelDirection, VideoCodecType } from "../src/types";

const channelId = "7N3fsMHob";
const role = "sendonly";
const metadata = "PG9A6RXgYqiqWKOVO";
const sdp = "v=0...";
const userAgent = window.navigator.userAgent;
const soraClient = "Sora JavaScript SDK __SORA_JS_SDK_VERSION__";
const baseExpectedMessage = Object.freeze({
  type: "connect",
  sora_client: soraClient,
  environment: userAgent,
  sdp: sdp,
  audio: true,
  video: true,
  role: role,
  metadata: null,
  channel_id: channelId,
});

test("createSignalingMessage simple", () => {
  // sendonly
  expect(createSignalingMessage(sdp, role, channelId, null, {}, false)).toEqual(baseExpectedMessage);

  // recvonly
  const diff = {
    role: "recvonly",
  };
  expect(createSignalingMessage(sdp, "recvonly", channelId, null, {}, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
});

test("createSignalingMessage role", () => {
  expect(() => {
    createSignalingMessage(sdp, "test", channelId, metadata, {}, false);
  }).toThrow(Error("Unknown role type"));
});

test("createSignalingMessage channelId", () => {
  expect(() => {
    createSignalingMessage(sdp, role, null, metadata, {}, false);
  }).toThrow(Error("channelId can not be null or undefined"));
  expect(() => {
    createSignalingMessage(sdp, role, undefined, metadata, {}, false);
  }).toThrow(Error("channelId can not be null or undefined"));
});

test("createSignalingMessage metadata", () => {
  const diff = {
    metadata: metadata,
  };
  expect(createSignalingMessage(sdp, role, channelId, metadata, {}, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
  expect(createSignalingMessage(sdp, role, channelId, null, {}, false)).toEqual(baseExpectedMessage);
});

test("createSignalingMessage clientId option", () => {
  const option1 = {
    clientId: "clientId",
  };
  const diff1 = {
    client_id: option1.clientId,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const option2 = {
    clientId: "",
  };
  const diff2 = {
    client_id: option2.clientId,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option2, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const option3 = {
    clientId: undefined,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option3, false)).toEqual(baseExpectedMessage);
});

test("createSignalingMessage multistream option", () => {
  // multistream
  const options1 = {
    multistream: true,
  };
  const diff1 = {
    multistream: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
});

test("createSignalingMessage audio option", () => {
  const audioCodecType: AudioCodecType = "OPUS";
  const options1 = {
    audio: false,
    audioCodecType: audioCodecType,
    audioBitRate: 100,
  };
  const diff1 = {
    audio: false,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    audio: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(baseExpectedMessage);
  const options3 = {
    audio: undefined,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(baseExpectedMessage);
  const options4 = {
    audioCodecType: audioCodecType,
    audioBitRate: 100,
  };
  const diff4 = {
    audio: {
      codec_type: options4.audioCodecType,
      bit_rate: options4.audioBitRate,
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff4)
  );
});

test("createSignalingMessage audio opus params option", () => {
  const options1 = {
    audio: false,
    audioOpusParamsChannels: 2,
  };
  const diff1 = {
    audio: false,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );

  const options2 = {
    audioOpusParamsChannels: 2,
  };
  const diff2 = {
    audio: {
      opus_params: {
        channels: 2,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );

  const options3 = {
    audioOpusParamsClockRate: 48000,
  };
  const diff3 = {
    audio: {
      opus_params: {
        clock_rate: 48000,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );

  const options4 = {
    audioOpusParamsMaxplaybackrate: 48000,
  };
  const diff4 = {
    audio: {
      opus_params: {
        maxplaybackrate: 48000,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff4)
  );

  const options5 = {
    audioOpusParamsStereo: true,
  };
  const diff5 = {
    audio: {
      opus_params: {
        stereo: true,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options5, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff5)
  );

  const options6 = {
    audioOpusParamsSpropStereo: true,
  };
  const diff6 = {
    audio: {
      opus_params: {
        sprop_stereo: true,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options6, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff6)
  );

  const options7 = {
    audioOpusParamsMinptime: 10,
  };
  const diff7 = {
    audio: {
      opus_params: {
        minptime: 10,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options7, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff7)
  );

  const options8 = {
    audioOpusParamsPtime: 20,
  };
  const diff8 = {
    audio: {
      opus_params: {
        ptime: 20,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options8, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff8)
  );

  const options9 = {
    audioOpusParamsUseinbandfec: true,
  };
  const diff9 = {
    audio: {
      opus_params: {
        useinbandfec: true,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options9, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff9)
  );

  const options10 = {
    audioOpusParamsUsedtx: false,
  };
  const diff10 = {
    audio: {
      opus_params: {
        usedtx: false,
      },
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options10, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff10)
  );
});

test("createSignalingMessage video option", () => {
  const videoCodecType: VideoCodecType = "VP9";
  const options1 = {
    video: false,
    videoCodecType: videoCodecType,
    videoBitRate: 100,
  };
  const diff1 = {
    video: false,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    video: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(baseExpectedMessage);
  const options3 = {
    video: undefined,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(baseExpectedMessage);
  const options4 = {
    videoCodecType: videoCodecType,
    videoBitRate: 100,
  };
  const diff4 = {
    video: {
      codec_type: options4.videoCodecType,
      bit_rate: options4.videoBitRate,
    },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff4)
  );
});

test("createSignalingMessage e2ee option", () => {
  const options1 = {
    e2ee: true,
    e2eeWasmUrl: "wasm",
  };
  const diff1 = {
    e2ee: true,
    video: {
      codec_type: "VP8",
    },
    signaling_notify_metadata: {},
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    e2ee: true,
    e2eeWasmUrl: "wasm",
    video: false,
  };
  const diff2 = {
    e2ee: true,
    video: false,
    signaling_notify_metadata: {},
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const options3 = {
    e2ee: true,
    e2eeWasmUrl: "wasm",
    video: true,
  };
  const diff3 = {
    e2ee: true,
    video: {
      codec_type: "VP8",
    },
    signaling_notify_metadata: {},
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );
  const options4 = {
    e2ee: true,
    e2eeWasmUrl: "wasm",
    VideoCodecType: "VP9",
  };
  const diff4 = {
    e2ee: true,
    video: {
      codec_type: "VP8",
    },
    signaling_notify_metadata: {},
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff4)
  );
});

test("createSignalingMessage signalingMetadata option", () => {
  const options1 = {
    signalingNotifyMetadata: "metadata",
  };
  const diff1 = {
    signaling_notify_metadata: "metadata",
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    signalingNotifyMetadata: { key: "value" },
  };
  const diff2 = {
    signaling_notify_metadata: { key: "value" },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const options3 = {
    signalingNotifyMetadata: null,
  };
  const diff3 = {
    signaling_notify_metadata: null,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );
});

test("createSignalingMessage dataChannelSignaling option", () => {
  const options1 = {
    dataChannelSignaling: true,
  };
  const diff1 = {
    data_channel_signaling: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    dataChannelSignaling: false,
  };
  const diff2 = {
    data_channel_signaling: false,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const options3 = {
    dataChannelSignaling: undefined,
  };
  const diff3 = {};
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );
});

test("createSignalingMessage ignoreDisconnectWebSocket option", () => {
  const options1 = {
    ignoreDisconnectWebSocket: true,
  };
  const diff1 = {
    ignore_disconnect_websocket: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    ignoreDisconnectWebSocket: false,
  };
  const diff2 = {
    ignore_disconnect_websocket: false,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const options3 = {
    ignoreDisconnectWebSocket: undefined,
  };
  const diff3 = {};
  expect(createSignalingMessage(sdp, role, channelId, null, options3, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );
});

test("createSignalingMessage redirect", () => {
  expect(createSignalingMessage(sdp, role, channelId, null, {}, true)).toEqual(
    Object.assign({}, baseExpectedMessage, { redirect: true })
  );
});

test("createSignalingMessage messagingDataChannels option", () => {
  // array 以外の場合は無視
  const options1 = {
    messagingDataChannels: "test",
  };
  // @ts-ignore option で指定されている型以外を引数に指定する
  expect(createSignalingMessage(sdp, role, channelId, null, options1, false)).toEqual(baseExpectedMessage);

  // array が空の場合は追加されない
  const options2 = {
    messagingDataChannels: [],
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2, false)).toEqual(baseExpectedMessage);

  // messagingDataChannel に object 以外が含まれる場合は例外が発生する
  const options3 = {
    messagingDataChannels: [{ label: "test", direction: "sendrecv" }, "test"],
  };
  expect(() => {
    // @ts-ignore option で指定されている型以外を引数に指定する
    createSignalingMessage(sdp, role, channelId, null, options3, false);
  }).toThrow("Messaging DataChannel failed. Options messagingDataChannel must be type 'object'");

  // messagingDataChannel に null が含まれる場合は例外が発生する
  const options4 = {
    messagingDataChannels: [{ label: "test", direction: "sendrecv" }, null],
  };
  expect(() => {
    // @ts-ignore option で指定されている型以外を引数に指定する
    createSignalingMessage(sdp, role, channelId, null, options4, false);
  }).toThrow("Messaging DataChannel failed. Options messagingDataChannel must be type 'object'");

  // 正常系
  const options5 = {
    messagingDataChannels: [
      { label: "test", direction: "sendrecv" as MessagingDataChannelDirection },
      {
        label: "test2",
        direction: "sendonly" as MessagingDataChannelDirection,
        ordered: true,
        maxPacketLifeTime: 100,
        maxRetransmits: 100,
        protocol: "protocol",
        compress: false,
      },
    ],
  };
  const diff5 = {
    data_channel_messaging: [
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
  expect(createSignalingMessage(sdp, role, channelId, null, options5, false)).toEqual(
    Object.assign({}, baseExpectedMessage, diff5)
  );
});
