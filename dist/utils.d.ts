import { ConnectionOptions, DataChannelEvent, JSONType, PreKeyBundle, SignalingConnectMessage, SignalingEvent, SignalingNotifyMetadata, SignalingNotifyConnectionCreated, SignalingNotifyConnectionDestroyed } from "./types";
export declare function isSafari(): boolean;
export declare function isChrome(): boolean;
export declare function createSignalingMessage(offerSDP: string, role: string, channelId: string | null | undefined, metadata: JSONType | undefined, options: ConnectionOptions): SignalingConnectMessage;
export declare function getSignalingNotifyAuthnMetadata(message: SignalingNotifyConnectionCreated | SignalingNotifyConnectionDestroyed | SignalingNotifyMetadata): JSONType;
export declare function getSignalingNotifyData(message: SignalingNotifyConnectionCreated): SignalingNotifyMetadata[];
export declare function getPreKeyBundle(message: JSONType): PreKeyBundle | null;
export declare function trace(clientId: string | null, title: string, value: unknown): void;
export declare class ConnectError extends Error {
    code?: number;
    reason?: string;
}
export declare function createWebSocketSignalingEvent(eventType: string, data: unknown): SignalingEvent;
export declare function createDataChannelSignalingEvent(eventType: string, data: unknown): SignalingEvent;
export declare function createDataChannelEvent(eventType: string, channel: RTCDataChannel): DataChannelEvent;
