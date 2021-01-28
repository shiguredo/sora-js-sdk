/* eslint @typescript-eslint/camelcase: 0 */
import { createSignalingMessage } from "../src/utils";
import { AudioCodecType, SimulcastRid, VideoCodecType } from "../src/types";
import pkg from "../package.json";

const channelId = "7N3fsMHob";
const role = "upstream";
const metadata = "PG9A6RXgYqiqWKOVO";
const sdp = "v=0...";
const userAgent = window.navigator.userAgent;
const soraClient = `Sora JavaScript SDK ${pkg.version}`;
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
  // upstream
  expect(createSignalingMessage(sdp, role, channelId, null, {})).toEqual(baseExpectedMessage);

  // downstream
  const diff = {
    role: "downstream",
  };
  expect(createSignalingMessage(sdp, "downstream", channelId, null, {})).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
});

test("createSignalingMessage role", () => {
  expect(() => {
    createSignalingMessage(sdp, "test", channelId, metadata, {});
  }).toThrow(Error("Unknown role type"));
});

test("createSignalingMessage channelId", () => {
  expect(() => {
    createSignalingMessage(sdp, role, null, metadata, {});
  }).toThrow(Error("channelId can not be null or undefined"));
  expect(() => {
    createSignalingMessage(sdp, role, undefined, metadata, {});
  }).toThrow(Error("channelId can not be null or undefined"));
});

test("createSignalingMessage metadata", () => {
  const diff = {
    metadata: metadata,
  };
  expect(createSignalingMessage(sdp, role, channelId, metadata, {})).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
  expect(createSignalingMessage(sdp, role, channelId, null, {})).toEqual(baseExpectedMessage);
});

test("createSignalingMessage clientId option", () => {
  const option1 = {
    clientId: "clientId",
  };
  const diff1 = {
    client_id: option1.clientId,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const option2 = {
    clientId: "",
  };
  const diff2 = {
    client_id: option2.clientId,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option2)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const option3 = {
    clientId: undefined,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option3)).toEqual(baseExpectedMessage);
});

test("createSignalingMessage multistream option", () => {
  // multistream
  const options1 = {
    multistream: true,
  };
  const diff1 = {
    multistream: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  // multistream spotlight
  const options2 = {
    multistream: true,
    spotlight: 1,
  };
  const diff2 = {
    multistream: true,
    spotlight: 1,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  // multistream new spotlight
  const options3 = {
    multistream: true,
    spotlight: true,
    spotlightNumber: 2,
  };
  const diff3 = {
    multistream: true,
    spotlight: true,
    spotlight_number: 2,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
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
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    audio: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(baseExpectedMessage);
  const options3 = {
    audio: undefined,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(baseExpectedMessage);
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
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options5)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options6)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options7)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options8)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options9)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options10)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    video: true,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(baseExpectedMessage);
  const options3 = {
    video: undefined,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(baseExpectedMessage);
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
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(
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
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    signalingNotifyMetadata: { key: "value" },
  };
  const diff2 = {
    signaling_notify_metadata: { key: "value" },
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  const options3 = {
    signalingNotifyMetadata: null,
  };
  const diff3 = {
    signaling_notify_metadata: null,
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );
});
