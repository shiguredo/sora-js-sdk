import SoraE2EE from "@sora/e2ee";

import ConnectionBase from "./base";
import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { applyMediaStreamConstraints } from "./helpers";
import { AudioCodecType, Callbacks, ConnectionOptions, JSONType, Role, SimulcastRid, VideoCodecType } from "./types";

class SoraConnection {
  signalingUrl: string;
  debug: boolean;

  constructor(signalingUrl: string, debug = false) {
    this.signalingUrl = signalingUrl;
    this.debug = debug;
  }

  sendrecv(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrl, "sendrecv", channelId, metadata, options, this.debug);
  }

  sendonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrl, "sendonly", channelId, metadata, options, this.debug);
  }

  recvonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionSubscriber {
    return new ConnectionSubscriber(this.signalingUrl, "recvonly", channelId, metadata, options, this.debug);
  }
}

export default {
  initE2EE: async function (wasmUrl: string): Promise<void> {
    await SoraE2EE.loadWasm(wasmUrl);
  },
  connection: function (signalingUrl: string, debug = false): SoraConnection {
    return new SoraConnection(signalingUrl, debug);
  },
  version: function (): string {
    return "__SORA_JS_SDK_VERSION__";
  },
  helpers: {
    applyMediaStreamConstraints,
  },
};

export type {
  AudioCodecType,
  Callbacks,
  ConnectionBase,
  ConnectionOptions,
  ConnectionPublisher,
  ConnectionSubscriber,
  Role,
  SimulcastRid,
  SoraConnection,
  VideoCodecType,
};
