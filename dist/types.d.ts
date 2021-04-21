export declare type JSONType = null | boolean | number | string | JSONType[] | {
    [prop: string]: JSONType | undefined;
};
export declare type SimulcastRid = "r0" | "r1" | "r2";
export declare type SpotlightFocusRid = "none" | SimulcastRid;
export declare type Simulcast = boolean | {
    rid: SimulcastRid;
};
export declare type AudioCodecType = "OPUS";
export declare type SignalingAudio = boolean | {
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
export declare type VideoCodecType = "VP9" | "VP8" | "AV1" | "H264" | "H265";
export declare type SignalingVideo = boolean | {
    codec_type?: VideoCodecType;
    bit_rate?: number;
};
export declare type Role = "sendrecv" | "sendonly" | "recvonly";
export declare type SignalingConnectMessage = {
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
};
export declare type SignalingMessage = SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage | SignalingPingMessage | SignalingPushMessage | SignalingNotifyMessage;
export declare type SignalingOfferMessage = {
    type: "offer";
    sdp: string;
    client_id: string;
    connection_id: string;
    metadata?: JSONType;
    config?: RTCConfiguration;
    encodings?: RTCRtpEncodingParameters[];
    ignore_disconnect_websocket?: boolean;
};
export declare type SignalingUpdateMessage = {
    type: "update";
    sdp: string;
};
export declare type SignalingReOfferMessage = {
    type: "re-offer";
    sdp: string;
};
export declare type SignalingPingMessage = {
    type: "ping";
    stats: boolean;
};
export declare type SignalingPushMessage = {
    type: "push";
    data: Record<string, unknown>;
};
export declare type SignalingNotifyMessage = SignalingNotifyConnectionCreated | SignalingNotifyConnectionUpdated | SignalingNotifyConnectionDestroyed | SignalingNotifySpotlightChanged | SignalingNotifySpotlightFocused | SignalingNotifySpotlightUnfocused | SignalingNotifyNetworkStatus;
export declare type SignalingNotifyMetadata = {
    client_id?: string;
    connection_id?: string;
    authn_metadata?: JSONType;
    authz_metadata?: JSONType;
    metadata?: JSONType;
};
export declare type SignalingNotifyConnectionCreated = {
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
export declare type SignalingNotifyConnectionUpdated = {
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
export declare type SignalingNotifyConnectionDestroyed = {
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
export declare type SignalingNotifySpotlightChanged = {
    type: "notify";
    event_type: "spotlight.changed";
    client_id: string | null;
    connection_id: string | null;
    spotlight_id: string;
    fixed?: boolean;
    audio: boolean;
    video: boolean;
};
export declare type SignalingNotifySpotlightFocused = {
    type: "notify";
    event_type: "spotlight.focused";
    client_id: string | null;
    connection_id: string;
    audio: boolean;
    video: boolean;
    fixed: boolean;
};
export declare type SignalingNotifySpotlightUnfocused = {
    type: "notify";
    event_type: "spotlight.unfocused";
    client_id: string | null;
    connection_id: string;
    audio: boolean;
    video: boolean;
    fixed: boolean;
};
export declare type SignalingNotifyNetworkStatus = {
    type: "notify";
    event_type: "network.status";
    unstable_level: 0 | 1 | 2 | 3;
};
export declare type ConnectionOptions = {
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
};
export declare type Callbacks = {
    disconnect: (event: CloseEvent) => void;
    push: (event: SignalingPushMessage) => void;
    addstream: (event: RTCTrackEvent) => void;
    track: (event: RTCTrackEvent) => void;
    removestream: (event: MediaStreamTrackEvent) => void;
    removetrack: (event: MediaStreamTrackEvent) => void;
    notify: (event: SignalingNotifyMessage) => void;
    log: (title: string, message: JSONType) => void;
    timeout: () => void;
    datachannel: (event: DataChannelEvent) => void;
    signaling: (event: SignalingEvent) => void;
};
export declare type PreKeyBundle = {
    identityKey: string;
    signedPreKey: string;
    preKeySignature: string;
};
export declare type Browser = "edge" | "chrome" | "safari" | "opera" | "firefox" | null;
declare const DATA_CHANNEL_LABELS: readonly ["signaling", "notify", "e2ee", "stats", "push"];
export declare type DataChannelLabel = typeof DATA_CHANNEL_LABELS[number];
export declare function isDataChannelLabel(dataChannelType: string): dataChannelType is DataChannelLabel;
export declare type TransportType = "websocket" | "datachannel";
export interface SignalingEvent extends Event {
    transportType?: TransportType;
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
export {};
