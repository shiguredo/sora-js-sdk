import { ConnectionOptions, Browser, Json, Role, SignalingConnectMessage, SignalingVideo } from "./types";

function browser(): Browser {
  const ua = window.navigator.userAgent.toLocaleLowerCase();
  if (ua.indexOf("edge") !== -1) {
    return "edge";
  } else if (ua.indexOf("chrome") !== -1 && ua.indexOf("edge") === -1) {
    return "chrome";
  } else if (ua.indexOf("safari") !== -1 && ua.indexOf("chrome") === -1) {
    return "safari";
  } else if (ua.indexOf("opera") !== -1) {
    return "opera";
  } else if (ua.indexOf("firefox") !== -1) {
    return "firefox";
  }
  return null;
}

function enabledSimulcast(role: Role, video: SignalingVideo): boolean {
  /**
    simulcast validator
    VP9 x

    simulcast_pub Chrome o
    simulcast_pub Firefox x
    simulcast_pub Safari 12.1.1 x
    simulcast_pub Safari 12.1 x
    simulcast_pub Safari 12.0 x
    simulcast_sub Chrome o
    simulcast_sub Firefox o
    simulcast_sub Safari 12.1.1 o
    simulcast_sub Safari 12.1 o
    simulcast_sub Safari 12.0 o ※H.264 のみ
  **/
  if (typeof video !== "boolean" && video.codec_type === "VP9") {
    return false;
  }
  if ((role === "upstream" || role === "sendrecv" || role === "sendonly") && browser() === "firefox") {
    return false;
  }
  if ((role === "upstream" || role === "sendrecv" || role === "sendonly") && browser() === "safari") {
    return false;
  }
  // TODO(nakai): sendonly, sendrecv を無効にする
  if ((role === "downstream" || role === "recvonly") && browser() === "safari") {
    const appVersion = window.navigator.appVersion.toLowerCase();
    const versions = /version\/([\d.]+)/.exec(appVersion);
    if (!versions) {
      return false;
    }
    const version = versions.pop();
    // version 12.0 以降であれば有効
    if (version && 12.0 < parseFloat(version)) {
      return true;
    }
    if (version && 12.0 == parseFloat(version) && typeof video !== "boolean" && video.codec_type === "H264") {
      // role が downstream で 'H264' の場合のみ有効
      return true;
    }
    return false;
  }
  return true;
}

export function isEdge(): boolean {
  return browser() === "edge";
}

export function isSafari(): boolean {
  return browser() === "safari";
}

export function isChrome(): boolean {
  return browser() === "chrome";
}

export function createSignalingMessage(
  offerSDP: string,
  role: string,
  channelId: string | null | undefined,
  metadata: Json,
  options: ConnectionOptions
): SignalingConnectMessage {
  if (
    role !== "upstream" &&
    role !== "downstream" &&
    role !== "sendrecv" &&
    role !== "sendonly" &&
    role !== "recvonly"
  ) {
    throw new Error("Unknown role type");
  }
  if (channelId === null || channelId === undefined) {
    throw new Error("channelId can not be null or undefined");
  }
  const message: SignalingConnectMessage = {
    type: "connect",
    // @ts-ignore
    // eslint-disable-next-line @typescript-eslint/camelcase
    sora_client: `Sora JavaScript SDK ${SORA_JS_SDK_VERSION}`,
    environment: window.navigator.userAgent,
    role: role,
    // eslint-disable-next-line @typescript-eslint/camelcase
    channel_id: channelId,
    sdp: offerSDP,
    audio: true,
    video: true,
  };

  if (metadata !== undefined) {
    message.metadata = metadata;
  }

  if ("signalingNotifyMetadata" in options) {
    // eslint-disable-next-line @typescript-eslint/camelcase
    message.signaling_notify_metadata = options.signalingNotifyMetadata;
  }
  if ("multistream" in options && options.multistream === true) {
    // multistream
    message.multistream = true;
    // spotlight
    if ("spotlight" in options) {
      message.spotlight = options.spotlight;
      if ("spotlightNumber" in options) {
        // eslint-disable-next-line @typescript-eslint/camelcase
        message.spotlight_number = options.spotlightNumber;
      }
    }
  }

  if ("simulcast" in options || "simulcastQuality" in options) {
    // simulcast
    if ("simulcast" in options && options.simulcast === true) {
      message.simulcast = true;
    }
    const simalcastQualities = ["low", "middle", "high"];
    if (options.simulcastQuality !== undefined && 0 <= simalcastQualities.indexOf(options.simulcastQuality)) {
      message.simulcast = {
        quality: options.simulcastQuality,
      };
    }
  }

  // client_id
  if ("clientId" in options && options.clientId) {
    // eslint-disable-next-line @typescript-eslint/camelcase
    message.client_id = options.clientId;
  }

  // parse options
  const audioPropertyKeys = ["audioCodecType", "audioBitRate"];
  const audioOpusParamsPropertyKeys = [
    "audioOpusParamsChannels",
    "audioOpusParamsClockRate",
    "audioOpusParamsMaxplaybackrate",
    "audioOpusParamsStereo",
    "audioOpusParamsSpropStereo",
    "audioOpusParamsMinptime",
    "audioOpusParamsPtime",
    "audioOpusParamsUseinbandfec",
    "audioOpusParamsUsedtx",
  ];
  const videoPropertyKeys = ["videoCodecType", "videoBitRate"];
  const copyOptions = Object.assign({}, options);
  (Object.keys(copyOptions) as (keyof ConnectionOptions)[]).forEach((key) => {
    if (key === "audio" && typeof copyOptions[key] === "boolean") return;
    if (key === "video" && typeof copyOptions[key] === "boolean") return;
    if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    if (0 <= audioOpusParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    delete copyOptions[key];
  });

  if (copyOptions.audio !== undefined) {
    message.audio = copyOptions.audio;
  }
  const hasAudioProperty = Object.keys(copyOptions).some((key) => {
    return 0 <= audioPropertyKeys.indexOf(key);
  });
  if (message.audio && hasAudioProperty) {
    message.audio = {};
    if ("audioCodecType" in copyOptions) {
      message.audio["codec_type"] = copyOptions.audioCodecType;
    }
    if ("audioBitRate" in copyOptions) {
      message.audio["bit_rate"] = copyOptions.audioBitRate;
    }
  }
  const hasAudioOpusParamsProperty = Object.keys(copyOptions).some((key) => {
    return 0 <= audioOpusParamsPropertyKeys.indexOf(key);
  });
  if (message.audio && hasAudioOpusParamsProperty) {
    if (typeof message.audio != "object") {
      message.audio = {};
    }
    // eslint-disable-next-line @typescript-eslint/camelcase
    message.audio.opus_params = {};
    if ("audioOpusParamsChannels" in copyOptions) {
      message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels;
    }
    if ("audioOpusParamsClockRate" in copyOptions) {
      // eslint-disable-next-line @typescript-eslint/camelcase
      message.audio.opus_params.clock_rate = copyOptions.audioOpusParamsClockRate;
    }
    if ("audioOpusParamsMaxplaybackrate" in copyOptions) {
      message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate;
    }
    if ("audioOpusParamsStereo" in copyOptions) {
      message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
    }
    if ("audioOpusParamsSpropStereo" in copyOptions) {
      // eslint-disable-next-line @typescript-eslint/camelcase
      message.audio.opus_params.sprop_stereo = copyOptions.audioOpusParamsSpropStereo;
    }
    if ("audioOpusParamsMinptime" in copyOptions) {
      message.audio.opus_params.minptime = copyOptions.audioOpusParamsMinptime;
    }
    if ("audioOpusParamsPtime" in copyOptions) {
      message.audio.opus_params.ptime = copyOptions.audioOpusParamsPtime;
    }
    if ("audioOpusParamsUseinbandfec" in copyOptions) {
      message.audio.opus_params.useinbandfec = copyOptions.audioOpusParamsUseinbandfec;
    }
    if ("audioOpusParamsUsedtx" in copyOptions) {
      message.audio.opus_params.usedtx = copyOptions.audioOpusParamsUsedtx;
    }
  }

  if (copyOptions.video !== undefined) {
    message.video = copyOptions.video;
  }
  const hasVideoProperty = Object.keys(copyOptions).some((key) => {
    return 0 <= videoPropertyKeys.indexOf(key);
  });
  if (message.video && hasVideoProperty) {
    message.video = {};
    if ("videoCodecType" in copyOptions) {
      message.video["codec_type"] = copyOptions.videoCodecType;
    }
    if ("videoBitRate" in copyOptions) {
      message.video["bit_rate"] = copyOptions.videoBitRate;
    }
  }

  if (message.simulcast && !enabledSimulcast(message.role, message.video)) {
    throw new Error("Simulcast can not be used with this browser");
  }

  // e2ee
  if ("e2ee" in options) {
    if (message.video === true) {
      message.video = {};
    }
    if (message.video) {
      message.video["codec_type"] = "VP8";
    }
    message.e2ee = true;
  }
  return message;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trace(clientId: string | null, title: string, value: any): void {
  let prefix = "";
  if (window.performance) {
    prefix = "[" + (window.performance.now() / 1000).toFixed(3) + "]";
  }
  if (clientId) {
    prefix = prefix + "[" + clientId + "]";
  }

  if (isEdge()) {
    console.log(prefix + ' ' + title + '\n', value); // eslint-disable-line
  } else {
    console.info(prefix + ' ' + title + '\n', value); // eslint-disable-line
  }
}
