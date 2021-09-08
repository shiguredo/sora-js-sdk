import { Callbacks, ConnectionOptions, JSONType, SignalingOfferMessage, SignalingReOfferMessage, SignalingUpdateMessage } from "./types";
import SoraE2EE from "@sora/e2ee";
declare global {
    interface Algorithm {
        namedCurve: string;
    }
}
export default class ConnectionBase {
    role: string;
    channelId: string;
    metadata: JSONType | undefined;
    signalingUrlCandidates: string | string[];
    options: ConnectionOptions;
    constraints: any;
    debug: boolean;
    clientId: string | null;
    connectionId: string | null;
    remoteConnectionIds: string[];
    stream: MediaStream | null;
    authMetadata: JSONType;
    pc: RTCPeerConnection | null;
    encodings: RTCRtpEncodingParameters[];
    protected ws: WebSocket | null;
    protected callbacks: Callbacks;
    protected e2ee: SoraE2EE | null;
    protected connectionTimeoutTimerId: number;
    protected monitorSignalingWebSocketEventTimerId: number;
    protected monitorIceConnectionStateChangeTimerId: number;
    protected dataChannels: {
        [key in string]?: RTCDataChannel;
    };
    private dataChannelsCompress;
    private connectionTimeout;
    private signalingCandidateTimeout;
    private disconnectWaitTimeout;
    private mids;
    private signalingSwitched;
    constructor(signalingUrlCandidates: string | string[], role: string, channelId: string, metadata: JSONType, options: ConnectionOptions, debug: boolean);
    on<T extends keyof Callbacks, U extends Callbacks[T]>(kind: T, callback: U): void;
    stopAudioTrack(stream: MediaStream): Promise<void>;
    stopVideoTrack(stream: MediaStream): Promise<void>;
    replaceAudioTrack(stream: MediaStream, audioTrack: MediaStreamTrack): Promise<void>;
    replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void>;
    private stopStream;
    /**
     * connect 処理中に例外が発生した場合の切断処理
     */
    private signalingTerminate;
    /**
     * PeerConnection の state に異常が発生した場合の切断処理
     */
    private abendPeerConnectionState;
    /**
     * 何かしらの異常があった場合の切断処理
     */
    private abend;
    private initializeConnection;
    private disconnectWebSocket;
    private disconnectDataChannel;
    private disconnectPeerConnection;
    disconnect(): Promise<void>;
    protected setupE2EE(): void;
    protected startE2EE(): void;
    protected getSignalingWebSocket(signalingUrlCandidates: string | string[]): Promise<WebSocket>;
    protected signaling(ws: WebSocket, redirect?: boolean): Promise<SignalingOfferMessage>;
    protected connectPeerConnection(message: SignalingOfferMessage): Promise<void>;
    protected setRemoteDescription(message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage): Promise<void>;
    protected createAnswer(message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage): Promise<void>;
    protected sendAnswer(): void;
    protected onIceCandidate(): Promise<void>;
    protected waitChangeConnectionStateConnected(): Promise<void>;
    protected monitorSignalingWebSocketEvent(): Promise<void>;
    protected monitorWebSocketEvent(): void;
    protected monitorPeerConnectionState(): void;
    protected setConnectionTimeout(): Promise<MediaStream>;
    protected clearConnectionTimeout(): void;
    protected clearMonitorSignalingWebSocketEvent(): void;
    protected clearMonitorIceConnectionStateChange(): void;
    protected trace(title: string, message: unknown): void;
    protected writeWebSocketSignalingLog(eventType: string, data?: unknown): void;
    protected writeDataChannelSignalingLog(eventType: string, channel: RTCDataChannel, data?: unknown): void;
    protected writeWebSocketTimelineLog(eventType: string, data?: unknown): void;
    protected writeDataChannelTimelineLog(eventType: string, channel: RTCDataChannel, data?: unknown): void;
    protected writePeerConnectionTimelineLog(eventType: string, data?: unknown): void;
    protected writeSoraTimelineLog(eventType: string, data?: unknown): void;
    private createOffer;
    private signalingOnMessageE2EE;
    private signalingOnMessageTypeOffer;
    private sendUpdateAnswer;
    private sendReAnswer;
    private signalingOnMessageTypeUpdate;
    private signalingOnMessageTypeReOffer;
    private signalingOnMessageTypePing;
    private signalingOnMessageTypeNotify;
    private signalingOnMessageTypeSwitched;
    private signalingOnMessageTypeRedirect;
    private setSenderParameters;
    private getStats;
    private onDataChannel;
    private sendMessage;
    private sendE2EEMessage;
    private sendStatsMessage;
    private getAudioTransceiver;
    private getVideoTransceiver;
    private soraCloseEvent;
    get e2eeSelfFingerprint(): string | undefined;
    get e2eeRemoteFingerprints(): Record<string, string> | undefined;
    get audio(): boolean;
    get video(): boolean;
    get signalingUrl(): string | string[];
    get connectedSignalingUrl(): string;
}
