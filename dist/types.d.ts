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
export declare type SignalingConnectDataChannel = {
    label?: string;
    direction?: DataChannelDirection;
    compress?: boolean;
    max_packet_life_time?: number;
    max_retransmits?: number;
    protocol?: string;
    ordered?: boolean;
};
export declare type SignalingConnectMessage = {
    type: "connect";
    role: Role;
    channel_id: string;
    client_id?: string;
    metadata?: JSONType;
    signaling_notify_metadata?: JSONType;
    multistream?: boolean;
    spotlight?: boolean;
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
    redirect?: true;
    data_channels?: SignalingConnectDataChannel[];
};
export declare type SignalingMessage = SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage | SignalingPingMessage | SignalingPushMessage | SignalingNotifyMessage | SignalingReqStatsMessage | SignalingSwitchedMessage | SignalingRedirectMessage;
export declare type SignalingOfferMessageDataChannel = {
    label: string;
    direction: DataChannelDirection;
    compress: boolean;
};
export declare type SignalingOfferMessage = {
    type: "offer";
    sdp: string;
    client_id: string;
    connection_id: string;
    metadata?: JSONType;
    config?: RTCConfiguration;
    encodings?: RTCRtpEncodingParameters[];
    ignore_disconnect_websocket?: boolean;
    data_channel_signaling?: boolean;
    data_channels?: SignalingOfferMessageDataChannel[];
    mid?: {
        audio?: string;
        video?: string;
    };
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
export declare type SignalingReqStatsMessage = {
    type: "req-stats";
};
export declare type SignalingSwitchedMessage = {
    type: "switched";
    ignore_disconnect_websocket: boolean;
};
export declare type SignalingRedirectMessage = {
    type: "redirect";
    location: string;
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
export declare type DataChannelDirection = "sendonly" | "sendrecv" | "recvonly";
export declare type DataChannelConfiguration = {
    label: string;
    direction: DataChannelDirection;
    compress?: boolean;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    protocol?: string;
    ordered?: boolean;
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
    spotlight?: boolean;
    spotlightNumber?: number;
    spotlightFocusRid?: SpotlightFocusRid;
    spotlightUnfocusRid?: SpotlightFocusRid;
    simulcast?: boolean;
    simulcastRid?: SimulcastRid;
    clientId?: string;
    timeout?: number;
    connectionTimeout?: number;
    e2ee?: boolean;
    signalingNotifyMetadata?: JSONType;
    dataChannelSignaling?: boolean;
    ignoreDisconnectWebSocket?: boolean;
    disconnectWaitTimeout?: number;
    signalingCandidateTimeout?: number;
    dataChannels?: DataChannelConfiguration[];
};
export declare type Callbacks = {
    disconnect: (event: SoraCloseEvent) => void;
    push: (event: SignalingPushMessage, transportType: TransportType) => void;
    addstream: (event: RTCTrackEvent) => void;
    track: (event: RTCTrackEvent) => void;
    removestream: (event: MediaStreamTrackEvent) => void;
    removetrack: (event: MediaStreamTrackEvent) => void;
    notify: (event: SignalingNotifyMessage, transportType: TransportType) => void;
    log: (title: string, message: JSONType) => void;
    timeout: () => void;
    timeline: (event: TimelineEvent) => void;
    signaling: (event: SignalingEvent) => void;
    message: (event: DataChannelMessageEvent) => void;
    datachannel: (event: DataChannelEvent) => void;
};
export declare type PreKeyBundle = {
    identityKey: string;
    signedPreKey: string;
    preKeySignature: string;
};
export declare type Browser = "edge" | "chrome" | "safari" | "opera" | "firefox" | null;
export declare type TransportType = "websocket" | "datachannel" | "peerconnection";
export declare type TimelineEventLogType = "websocket" | "datachannel" | "peerconnection" | "sora";
export interface SignalingEvent extends Event {
    transportType: TransportType;
    data?: any;
}
export interface DataChannelMessageEvent extends Event {
    label: string;
    data: ArrayBuffer;
}
export interface DataChannelEvent extends Event {
    datachannel: DataChannelConfiguration;
}
export interface TimelineEvent extends Event {
    logType: TimelineEventLogType;
    data?: any;
    dataChannelId?: number | null;
    dataChannelLabel?: string;
}
export interface SoraCloseEvent extends Event {
    title: string;
    code?: number;
    reason?: string;
    params?: Record<string, unknown>;
}
export declare type SoraCloseEventType = "normal" | "abend";
export declare type SoraCloseEventInitDict = {
    code?: number;
    reason?: string;
    params?: Record<string, unknown>;
};
export declare type SoraAbendTitle = "CONNECTION-STATE-FAILED" | "DATA-CHANNEL-ONERROR" | "ICE-CONNECTION-STATE-DISCONNECTED-TIMEOUT" | "ICE-CONNECTION-STATE-FAILED" | "INTERNAL-ERROR" | "WEBSOCKET-ONCLOSE" | "WEBSOCKET-ONERROR";
