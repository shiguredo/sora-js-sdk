import ConnectionBase from "./base";
import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { applyMediaStreamConstraints } from "./helpers";
import type { AudioCodecType, Callbacks, ConnectionOptions, JSONType, Role, SignalingEvent, SignalingNotifyConnectionCreated, SignalingNotifyConnectionDestroyed, SignalingNotifyConnectionUpdated, SignalingNotifyMessage, SignalingNotifyMetadata, SignalingNotifyNetworkStatus, SignalingNotifySpotlightChanged, SignalingNotifySpotlightFocused, SignalingNotifySpotlightUnfocused, Simulcast, SimulcastRid, SpotlightFocusRid, TimelineEvent, TimelineEventLogType, TransportType, VideoCodecType } from "./types";
declare class SoraConnection {
    signalingUrlCandidates: string | string[];
    debug: boolean;
    constructor(signalingUrlCandidates: string | string[], debug?: boolean);
    sendrecv(channelId: string, metadata?: JSONType, options?: ConnectionOptions): ConnectionPublisher;
    sendonly(channelId: string, metadata?: JSONType, options?: ConnectionOptions): ConnectionPublisher;
    recvonly(channelId: string, metadata?: JSONType, options?: ConnectionOptions): ConnectionSubscriber;
    get signalingUrl(): string | string[];
}
declare const _default: {
    initE2EE: (wasmUrl: string) => Promise<void>;
    connection: (signalingUrlCandidates: string | string[], debug?: boolean) => SoraConnection;
    version: () => string;
    helpers: {
        applyMediaStreamConstraints: typeof applyMediaStreamConstraints;
    };
};
export default _default;
export type { AudioCodecType, Callbacks, ConnectionBase, ConnectionOptions, ConnectionPublisher, ConnectionSubscriber, Role, SignalingEvent, SignalingNotifyConnectionCreated, SignalingNotifyConnectionDestroyed, SignalingNotifyConnectionUpdated, SignalingNotifyMessage, SignalingNotifyMetadata, SignalingNotifyNetworkStatus, SignalingNotifySpotlightChanged, SignalingNotifySpotlightFocused, SignalingNotifySpotlightUnfocused, Simulcast, SimulcastRid, SoraConnection, SpotlightFocusRid, TimelineEvent, TimelineEventLogType, TransportType, VideoCodecType, };
