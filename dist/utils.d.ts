import { ConnectionOptions, Json, PreKeyBundle, SignalingConnectMessage } from "./types";
export declare function isEdge(): boolean;
export declare function isSafari(): boolean;
export declare function isChrome(): boolean;
export declare function createSignalingMessage(offerSDP: string, role: string, channelId: string | null | undefined, metadata: Json | undefined, options: ConnectionOptions): SignalingConnectMessage;
export declare function getSignalingNotifyAuthnMetadata(message: Record<string, unknown>): Json;
export declare function getSignalingNotifyData(message: Record<string, unknown>): Record<string, unknown>[];
export declare function getPreKeyBundle(message: Json): PreKeyBundle | null;
export declare function trace(clientId: string | null, title: string, value: unknown): void;
export declare class ConnectError extends Error {
    code?: number;
    reason?: string;
}
