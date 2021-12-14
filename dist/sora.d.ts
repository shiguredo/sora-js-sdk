import ConnectionBase from "./base";
import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { applyMediaStreamConstraints } from "./helpers";
import type { AudioCodecType, Callbacks, ConnectionOptions, DataChannelConfiguration, DataChannelDirection, DataChannelEvent, DataChannelMessageEvent, JSONType, Role, SignalingEvent, SignalingNotifyConnectionCreated, SignalingNotifyConnectionDestroyed, SignalingNotifyConnectionUpdated, SignalingNotifyMessage, SignalingNotifyMetadata, SignalingNotifyNetworkStatus, SignalingNotifySpotlightChanged, SignalingNotifySpotlightFocused, SignalingNotifySpotlightUnfocused, SignalingPushMessage, Simulcast, SimulcastRid, SoraAbendTitle, SoraCloseEvent, SoraCloseEventInitDict, SoraCloseEventType, SpotlightFocusRid, TimelineEvent, TimelineEventLogType, TransportType, VideoCodecType } from "./types";
/**
 * Role 毎の Connection インスタンスを生成するためのクラス
 *
 * @param signalingUrlCandidates - シグナリングに使用する URL の候補
 * @param debug - デバッグフラグ
 */
declare class SoraConnection {
    /**
     * シグナリングに使用する URL の候補
     */
    signalingUrlCandidates: string | string[];
    /**
     * デバッグフラグ
     */
    debug: boolean;
    constructor(signalingUrlCandidates: string | string[], debug?: boolean);
    /**
     * role sendrecv で接続するための Connecion インスタンスを生成するメソッド
     *
     * @example
     * ```typescript
     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
     * const sendrecv = connection.sendrecv("sora");
     * ```
     *
     * @param channelId - チャネルID
     * @param metadata - メタデータ
     * @param options - コネクションオプション
     *
     * @returns
     * role sendrecv な Connection オブジェクトを返します
     *
     * @public
     */
    sendrecv(channelId: string, metadata?: JSONType, options?: ConnectionOptions): ConnectionPublisher;
    /**
     * role sendonly で接続するための Connecion インスタンスを生成するメソッド
     *
     * @param channelId - チャネルID
     * @param metadata - メタデータ
     * @param options - コネクションオプション
     *
     * @example
     * ```typescript
     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
     * const sendonly = connection.sendonly("sora");
     * ```
     *
     * @returns
     * role sendonly な Connection オブジェクトを返します
     *
     * @public
     */
    sendonly(channelId: string, metadata?: JSONType, options?: ConnectionOptions): ConnectionPublisher;
    /**
     * role recvonly で接続するための Connecion インスタンスを生成するメソッド
     *
     * @example
     * ```typescript
     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
     * const recvonly = connection.recvonly("sora");
     * ```
     *
     * @param channelId - チャネルID
     * @param metadata - メタデータ
     * @param options - コネクションオプション
     *
     * @returns
     * role recvonly な Connection オブジェクトを返します
     *
     * @public
     */
    recvonly(channelId: string, metadata?: JSONType, options?: ConnectionOptions): ConnectionSubscriber;
    /**
     * シグナリングに使用する URL の候補
     *
     * @public
     * @deprecated
     */
    get signalingUrl(): string | string[];
}
declare const _default: {
    /**
     * E2EE で使用する WASM の読み込みを行うメソッド
     *
     * @example
     * ```typescript
     * Sora.initE2EE("http://192.0.2.100/wasm.wasm");
     * ```
     * @param wasmUrl - E2EE WASM の URL
     *
     * @public
     */
    initE2EE: (wasmUrl: string) => Promise<void>;
    /**
     * SoraConnection インスタンスを生成するメソッド
     *
     * @example
     * ```typescript
     * const connection = Sora.connection('ws://192.0.2.100:5000/signaling', true);
     * ```
     *
     * @param signalingUrlCandidates - シグナリングに使用する URL 候補
     * @param debug - デバッグフラグ
     *
     * @public
     *
     */
    connection: (signalingUrlCandidates: string | string[], debug?: boolean) => SoraConnection;
    /**
     * SDK のバージョンを返すメソッド
     *
     * @public
     */
    version: () => string;
    /**
     * WebRTC のユーティリティ関数群
     *
     * @public
     */
    helpers: {
        applyMediaStreamConstraints: typeof applyMediaStreamConstraints;
    };
};
/**
 * Sora JS SDK package
 */
export default _default;
export type { AudioCodecType, Callbacks, ConnectionBase, ConnectionOptions, ConnectionPublisher, ConnectionSubscriber, DataChannelConfiguration, DataChannelDirection, DataChannelEvent, DataChannelMessageEvent, JSONType, Role, SignalingEvent, SignalingNotifyConnectionCreated, SignalingNotifyConnectionDestroyed, SignalingNotifyConnectionUpdated, SignalingNotifyMessage, SignalingNotifyMetadata, SignalingNotifyNetworkStatus, SignalingNotifySpotlightChanged, SignalingNotifySpotlightFocused, SignalingNotifySpotlightUnfocused, SignalingPushMessage, Simulcast, SimulcastRid, SoraAbendTitle, SoraCloseEvent, SoraCloseEventInitDict, SoraCloseEventType, SoraConnection, SpotlightFocusRid, TimelineEvent, TimelineEventLogType, TransportType, VideoCodecType, };
