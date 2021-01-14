export type Json = null | boolean | number | string | Json[] | { [prop: string]: Json | undefined };

export type SimulcastRid = "r0" | "r1" | "r2";
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

export type VideoCodecType = "VP9" | "VP8" | "H264" | "H265";

export type SignalingVideo =
  | boolean
  | {
      codec_type?: VideoCodecType;
      bit_rate?: number;
    };

export type Role = "upstream" | "downstream" | "sendrecv" | "sendonly" | "recvonly";

export type Encoding = {
  rid: string;
  maxBitrate?: number;
  maxFramerate?: number;
  scaleResolutionDownBy?: number;
};

export type Browser = "edge" | "chrome" | "safari" | "opera" | "firefox" | null;

export type SignalingConnectMessage = {
  type: "connect";
  role: Role;
  channel_id: string;
  client_id?: string;
  metadata?: Json;
  signaling_notify_metadata?: Json;
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
};

export type SignalingOfferMessage = {
  type: "offer";
  sdp: string;
  client_id: string;
  connection_id: string;
  metadata?: Json;
  config?: RTCConfiguration;
  encodings?: RTCRtpEncodingParameters[];
};

export type SignalingUpdateMessage = {
  type: "update";
  sdp: string;
};

export type SignalingPingMessage = {
  type: "ping";
  stats: boolean;
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
  authn_metadata?: Json;
  authz_metadata?: Json;
  metadata?: Json;
};

export type SignalingNotifyConnectionCreated = {
  type: "notify";
  event_type: "connection.created";
  role: Role;
  client_id?: string;
  connection_id?: string;
  audio?: boolean;
  video?: boolean;
  authn_metadata?: Json;
  authz_metadata?: Json;
  metadata?: Json;
  metadata_list?: SignalingNotifyMetadata[];
  data?: SignalingNotifyMetadata[];
  minutes: number;
  channel_connections: number;
  channel_sendrecv_connections: number;
  channel_sendonly_connections: number;
  channel_recvonly_connections: number;
  channel_upstream_connections: number;
  channel_downstream_connections: number;
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
  channel_upstream_connections: number;
  channel_downstream_connections: number;
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
  channel_connections: number;
  channel_sendrecv_connections: number;
  channel_sendonly_connections: number;
  channel_recvonly_connections: number;
  channel_upstream_connections: number;
  channel_downstream_connections: number;
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
  simulcast?: boolean;
  simulcastRid?: SimulcastRid;
  clientId?: string;
  timeout?: number;
  e2ee?: boolean;
  signalingNotifyMetadata?: Json;
};

type PushMessage = {
  type: "push";
  data: Record<string, unknown>;
};

type NotifyMessage = {
  [key: string]: unknown;
  type: "notify";
  event_type: string;
};

export type Callbacks = {
  disconnect: (event: CloseEvent) => void;
  push: (event: PushMessage) => void;
  addstream: (event: RTCTrackEvent) => void;
  track: (event: RTCTrackEvent) => void;
  removestream: (event: MediaStreamTrackEvent) => void;
  removetrack: (event: MediaStreamTrackEvent) => void;
  notify: (event: NotifyMessage) => void;
  log: (title: string, message: Json) => void;
  timeout: () => void;
};

export type PreKeyBundle = {
  identityKey: string;
  signedPreKey: string;
  preKeySignature: string;
};
