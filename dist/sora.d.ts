import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { AudioCodecType, ConnectionOptions, SimulcastQuality, VideoCodecType } from "./types";
declare class SoraConnection {
    signalingUrl: string;
    debug: boolean;
    constructor(signalingUrl: string, debug?: boolean);
    publisher(channelId: string, metadata?: string | null, options?: ConnectionOptions): ConnectionPublisher;
    subscriber(channelId: string, metadata?: string | null, options?: ConnectionOptions): ConnectionSubscriber;
    sendrecv(channelId: string, metadata?: string | null, options?: ConnectionOptions): ConnectionPublisher;
    sendonly(channelId: string, metadata?: string | null, options?: ConnectionOptions): ConnectionPublisher;
    recvonly(channelId: string, metadata?: string | null, options?: ConnectionOptions): ConnectionSubscriber;
}
declare const _default: {
    connection: (signalingUrl: string, debug?: boolean) => SoraConnection;
    version: () => string;
};
export default _default;
export type { AudioCodecType, ConnectionOptions, SimulcastQuality, VideoCodecType };
