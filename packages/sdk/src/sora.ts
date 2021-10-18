import SoraE2EE from "@sora/e2ee";

import ConnectionBase from "./base";
import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { applyMediaStreamConstraints } from "./helpers";
import type {
  AudioCodecType,
  Callbacks,
  ConnectionOptions,
  JSONType,
  DataChannelConfiguration,
  DataChannelDirection,
  Role,
  SignalingEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  SignalingNotifyMetadata,
  SignalingNotifyNetworkStatus,
  SignalingNotifySpotlightChanged,
  SignalingNotifySpotlightFocused,
  SignalingNotifySpotlightUnfocused,
  Simulcast,
  SimulcastRid,
  SoraAbendTitle,
  SoraCloseEvent,
  SoraCloseEventInitDict,
  SoraCloseEventType,
  SpotlightFocusRid,
  TimelineEvent,
  TimelineEventLogType,
  TransportType,
  VideoCodecType,
} from "./types";

class SoraConnection {
  signalingUrlCandidates: string | string[];
  debug: boolean;

  constructor(signalingUrlCandidates: string | string[], debug = false) {
    this.signalingUrlCandidates = signalingUrlCandidates;
    this.debug = debug;
  }

  sendrecv(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrlCandidates, "sendrecv", channelId, metadata, options, this.debug);
  }

  sendonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrlCandidates, "sendonly", channelId, metadata, options, this.debug);
  }

  recvonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionSubscriber {
    return new ConnectionSubscriber(this.signalingUrlCandidates, "recvonly", channelId, metadata, options, this.debug);
  }

  // @deprecated 後方互換のため残す
  get signalingUrl(): string | string[] {
    return this.signalingUrlCandidates;
  }
}

export default {
  initE2EE: async function (wasmUrl: string): Promise<void> {
    await SoraE2EE.loadWasm(wasmUrl);
  },
  connection: function (signalingUrlCandidates: string | string[], debug = false): SoraConnection {
    return new SoraConnection(signalingUrlCandidates, debug);
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
  DataChannelConfiguration,
  DataChannelDirection,
  Role,
  SignalingEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  SignalingNotifyMetadata,
  SignalingNotifyNetworkStatus,
  SignalingNotifySpotlightChanged,
  SignalingNotifySpotlightFocused,
  SignalingNotifySpotlightUnfocused,
  Simulcast,
  SimulcastRid,
  SoraAbendTitle,
  SoraCloseEvent,
  SoraCloseEventInitDict,
  SoraCloseEventType,
  SoraConnection,
  SpotlightFocusRid,
  TimelineEvent,
  TimelineEventLogType,
  TransportType,
  VideoCodecType,
};
