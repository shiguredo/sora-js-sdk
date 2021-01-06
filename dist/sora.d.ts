import ConnectionBase from "./base";
import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { stopAudioMediaDevice, stopVideoMediaDevice, startAudioMediaDevice, startVideoMediaDevice } from "./helpers";
import { AudioCodecType, Callbacks, ConnectionOptions, Json, Role, SimulcastRid, VideoCodecType } from "./types";
declare class SoraConnection {
    signalingUrl: string;
    debug: boolean;
    constructor(signalingUrl: string, debug?: boolean);
    publisher(channelId: string, metadata?: Json, options?: ConnectionOptions): ConnectionPublisher;
    subscriber(channelId: string, metadata?: Json, options?: ConnectionOptions): ConnectionSubscriber;
    sendrecv(channelId: string, metadata?: Json, options?: ConnectionOptions): ConnectionPublisher;
    sendonly(channelId: string, metadata?: Json, options?: ConnectionOptions): ConnectionPublisher;
    recvonly(channelId: string, metadata?: Json, options?: ConnectionOptions): ConnectionSubscriber;
}
declare const _default: {
    initE2EE: (wasmUrl: string) => Promise<void>;
    connection: (signalingUrl: string, debug?: boolean) => SoraConnection;
    version: () => string;
    helpers: {
        startAudioMediaDevice: typeof startAudioMediaDevice;
        startVideoMediaDevice: typeof startVideoMediaDevice;
        stopAudioMediaDevice: typeof stopAudioMediaDevice;
        stopVideoMediaDevice: typeof stopVideoMediaDevice;
    };
};
export default _default;
export type { AudioCodecType, Callbacks, ConnectionBase, ConnectionOptions, ConnectionPublisher, ConnectionSubscriber, Role, SimulcastRid, SoraConnection, VideoCodecType, };
