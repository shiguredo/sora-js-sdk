import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { AudioCodecType, ConnectionOptions, SimulcastQuality, VideoCodecType } from "./types";

class SoraConnection {
  signalingUrl: string;
  debug: boolean;

  constructor(signalingUrl: string, debug = false) {
    this.signalingUrl = signalingUrl;
    this.debug = debug;
  }

  // 古い role
  // @deprecated 1 年は残します
  publisher(
    channelId: string,
    metadata: string | null = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    console.warn("@deprecated publisher will be removed in a future version. Use sendrecv or sendonly.");
    return new ConnectionPublisher(this.signalingUrl, "upstream", channelId, metadata, options, this.debug);
  }

  // @deprecated 1 年は残します
  subscriber(
    channelId: string,
    metadata: string | null = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionSubscriber {
    console.warn("@deprecated subscriber will be removed in a future version. Use recvonly.");
    return new ConnectionSubscriber(this.signalingUrl, "downstream", channelId, metadata, options, this.debug);
  }

  // 新しい role
  sendrecv(
    channelId: string,
    metadata: string | null = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrl, "sendrecv", channelId, metadata, options, this.debug);
  }

  sendonly(
    channelId: string,
    metadata: string | null = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrl, "sendonly", channelId, metadata, options, this.debug);
  }

  recvonly(
    channelId: string,
    metadata: string | null = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionSubscriber {
    return new ConnectionSubscriber(this.signalingUrl, "recvonly", channelId, metadata, options, this.debug);
  }
}

export default {
  connection: function (signalingUrl: string, debug = false): SoraConnection {
    return new SoraConnection(signalingUrl, debug);
  },
  version: function (): string {
    // @ts-ignore
    return SORA_JS_SDK_VERSION;
  },
};

export type {
  AudioCodecType,
  ConnectionOptions,
  ConnectionPublisher,
  ConnectionSubscriber,
  SimulcastQuality,
  VideoCodecType,
};
