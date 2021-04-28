export type JSONType = null | boolean | number | string | JSONType[] | { [prop: string]: JSONType | undefined };

export type SimulcastRid = "r0" | "r1" | "r2";

export type SpotlightFocusRid = "none" | SimulcastRid;

export type Simulcast = boolean | { rid: SimulcastRid };

export type AudioCodecType = "OPUS";

export type SignalingAudio =
  | boolean
  | {
      codec_type?: AudioCodecType;
      bit_rate?: number;
      opus_params?: {
        channels?: number;
        clock_rate?: number;
        maxplaybackrate?: number;
        minptime?: number;
        ptime?: number;
        stereo?: boolean;
        sprop_stereo?: boolean;
        useinbandfec?: boolean;
        usedtx?: boolean;
      };
    };

export type VideoCodecType = "VP9" | "VP8" | "AV1" | "H264" | "H265";

export type SignalingVideo =
  | boolean
  | {
      codec_type?: VideoCodecType;
      bit_rate?: number;
    };

export type Role = "sendrecv" | "sendonly" | "recvonly";

export type SignalingConnectMessage = {
  type: "connect";
  role: Role;
  channel_id: string;
  client_id?: string;
  metadata?: JSONType;
  signaling_notify_metadata?: JSONType;
  multistream?: boolean;
  spotlight?: number | boolean;
  spotlight_number?: number;
  simulcast?: Simulcast;
  simulcast_rid?: SimulcastRid;
  audio: SignalingAudio;
  video: SignalingVideo;
  sdp: string;
  sora_client: string;
  environment: string;
  e2ee?: boolean;
  spotlight_focus_rid?: SpotlightFocusRid;
  spotlight_unfocus_rid?: SpotlightFocusRid;
  data_channel_signaling?: boolean;
  ignore_disconnect_websocket?: boolean;
};

export type SignalingMessage =
  | SignalingOfferMessage
  | SignalingUpdateMessage
  | SignalingReOfferMessage
  | SignalingPingMessage
  | SignalingPushMessage
  | SignalingNotifyMessage;

export type SignalingOfferMessage = {
  type: "offer";
  sdp: string;
  client_id: string;
  connection_id: string;
  metadata?: JSONType;
  config?: RTCConfiguration;
  encodings?: RTCRtpEncodingParameters[];
  ignore_disconnect_websocket?: boolean;
  data_channel_signaling?: boolean;
};

export type SignalingUpdateMessage = {
  type: "update";
  sdp: string;
};

export type SignalingReOfferMessage = {
  type: "re-offer";
  sdp: string;
};

export type SignalingPingMessage = {
  type: "ping";
  stats: boolean;
};

export type SignalingPushMessage = {
  type: "push";
  data: Record<string, unknown>;
};

export type SignalingNotifyMessage =
  | SignalingNotifyConnectionCreated
  | SignalingNotifyConnectionUpdated
  | SignalingNotifyConnectionDestroyed
  | SignalingNotifySpotlightChanged
  | SignalingNotifySpotlightFocused
  | SignalingNotifySpotlightUnfocused
  | SignalingNotifyNetworkStatus;

export type SignalingNotifyMetadata = {
  client_id?: string;
  connection_id?: string;
  authn_metadata?: JSONType;
  authz_metadata?: JSONType;
  metadata?: JSONType;
};

export type SignalingNotifyConnectionCreated = {
  type: "notify";
  event_type: "connection.created";
  role: Role;
  client_id?: string;
  connection_id?: string;
  audio?: boolean;
  video?: boolean;
  authn_metadata?: JSONType;
  authz_metadata?: JSONType;
  metadata?: JSONType;
  metadata_list?: SignalingNotifyMetadata[];
  data?: SignalingNotifyMetadata[];
  minutes: number;
  channel_connections: number;
  channel_sendrecv_connections: number;
  channel_sendonly_connections: number;
  channel_recvonly_connections: number;
  turn_transport_type: "udp" | "tcp";
};

export type SignalingNotifyConnectionUpdated = {
  type: "notify";
  event_type: "connection.updated";
  role: Role;
  client_id?: string;
  connection_id?: string;
  audio?: boolean;
  video?: boolean;
  minutes: number;
  channel_connections: number;
  channel_sendrecv_connections: number;
  channel_sendonly_connections: number;
  channel_recvonly_connections: number;
  turn_transport_type: "udp" | "tcp";
};

export type SignalingNotifyConnectionDestroyed = {
  type: "notify";
  event_type: "connection.destroyed";
  role: Role;
  client_id?: string;
  connection_id?: string;
  audio?: boolean;
  video?: boolean;
  minutes: number;
  authn_metadata?: JSONType;
  authz_metadata?: JSONType;
  metadata?: JSONType;
  channel_connections: number;
  channel_sendrecv_connections: number;
  channel_sendonly_connections: number;
  channel_recvonly_connections: number;
  turn_transport_type: "udp" | "tcp";
};

export type SignalingNotifySpotlightChanged = {
  type: "notify";
  event_type: "spotlight.changed";
  client_id: string | null;
  connection_id: string | null;
  spotlight_id: string;
  fixed?: boolean;
  audio: boolean;
  video: boolean;
};

export type SignalingNotifySpotlightFocused = {
  type: "notify";
  event_type: "spotlight.focused";
  client_id: string | null;
  connection_id: string;
  audio: boolean;
  video: boolean;
  fixed: boolean;
};

export type SignalingNotifySpotlightUnfocused = {
  type: "notify";
  event_type: "spotlight.unfocused";
  client_id: string | null;
  connection_id: string;
  audio: boolean;
  video: boolean;
  fixed: boolean;
};

export type SignalingNotifyNetworkStatus = {
  type: "notify";
  event_type: "network.status";
  unstable_level: 0 | 1 | 2 | 3;
};

export type ConnectionOptions = {
  audio?: boolean;
  audioCodecType?: AudioCodecType;
  audioBitRate?: number;
  audioOpusParamsChannels?: number;
  audioOpusParamsClockRate?: number;
  audioOpusParamsMaxplaybackrate?: number;
  audioOpusParamsStereo?: boolean;
  audioOpusParamsSpropStereo?: boolean;
  audioOpusParamsMinptime?: number;
  audioOpusParamsPtime?: number;
  audioOpusParamsUseinbandfec?: boolean;
  audioOpusParamsUsedtx?: boolean;
  video?: boolean;
  videoCodecType?: VideoCodecType;
  videoBitRate?: number;
  multistream?: boolean;
  spotlight?: boolean | number;
  spotlightNumber?: number;
  spotlightFocusRid?: SpotlightFocusRid;
  spotlightUnfocusRid?: SpotlightFocusRid;
  simulcast?: boolean;
  simulcastRid?: SimulcastRid;
  clientId?: string;
  timeout?: number;
  e2ee?: boolean;
  signalingNotifyMetadata?: JSONType;
  dataChannelSignaling?: boolean;
  ignoreDisconnectWebSocket?: boolean;
};

export type Callbacks = {
  disconnect: (event: CloseEvent) => void;
  push: (event: SignalingPushMessage, transportType: TransportType) => void;
  addstream: (event: RTCTrackEvent) => void;
  track: (event: RTCTrackEvent) => void;
  removestream: (event: MediaStreamTrackEvent) => void;
  removetrack: (event: MediaStreamTrackEvent) => void;
  notify: (event: SignalingNotifyMessage, transportType: TransportType) => void;
  log: (title: string, message: JSONType) => void;
  timeout: () => void;
  datachannel: (event: DataChannelEvent) => void;
  signaling: (event: SignalingEvent) => void;
};

export type PreKeyBundle = {
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
};

export type Browser = "edge" | "chrome" | "safari" | "opera" | "firefox" | null;

const DATA_CHANNEL_LABELS = ["signaling", "notify", "e2ee", "stats", "push"] as const;

export type DataChannelLabel = typeof DATA_CHANNEL_LABELS[number];

export function isDataChannelLabel(dataChannelType: string): dataChannelType is DataChannelLabel {
  return (DATA_CHANNEL_LABELS as readonly string[]).indexOf(dataChannelType) >= 0;
}

export type TransportType = "websocket" | "datachannel";

export interface SignalingEvent extends Event {
  transportType?: TransportType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export interface DataChannelEvent extends Event {
  binaryType: RTCDataChannel["binaryType"];
  bufferedAmount: RTCDataChannel["bufferedAmount"];
  bufferedAmountLowThreshold: RTCDataChannel["bufferedAmountLowThreshold"];
  id: RTCDataChannel["id"];
  label: RTCDataChannel["label"];
  maxPacketLifeTime: RTCDataChannel["maxPacketLifeTime"];
  maxRetransmits: RTCDataChannel["maxRetransmits"];
  negotiated: RTCDataChannel["negotiated"];
  ordered: RTCDataChannel["ordered"];
  protocol: RTCDataChannel["protocol"];
  readyState: RTCDataChannel["readyState"];
  reliable: boolean;
}
