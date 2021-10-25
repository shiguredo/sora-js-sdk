import SoraE2EE from "@sora/e2ee";

import ConnectionBase from "./base";
import ConnectionPublisher from "./publisher";
import ConnectionSubscriber from "./subscriber";
import { applyMediaStreamConstraints } from "./helpers";
import type {
  AudioCodecType,
  Callbacks,
  ConnectionOptions,
  JSONType,
  DataChannelConfiguration,
  DataChannelDirection,
  Role,
  SignalingEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  SignalingNotifyMetadata,
  SignalingNotifyNetworkStatus,
  SignalingNotifySpotlightChanged,
  SignalingNotifySpotlightFocused,
  SignalingNotifySpotlightUnfocused,
  Simulcast,
  SimulcastRid,
  SoraAbendTitle,
  SoraCloseEvent,
  SoraCloseEventInitDict,
  SoraCloseEventType,
  SpotlightFocusRid,
  TimelineEvent,
  TimelineEventLogType,
  TransportType,
  VideoCodecType,
} from "./types";

/**
 * Role 毎の Connection インスタンスを生成するためのクラス
 *
 * @param signalingUrlCandidates - シグナリングに使用する URL の候補
 * @param debug - デバッグフラグ
 */
class SoraConnection {
  /**
   * シグナリングに使用する URL の候補
   */
  signalingUrlCandidates: string | string[];
  /**
   * デバッグフラグ
   */
  debug: boolean;

  constructor(signalingUrlCandidates: string | string[], debug = false) {
    this.signalingUrlCandidates = signalingUrlCandidates;
    this.debug = debug;
  }
  /**
   * role sendrecv で接続するための Connecion インスタンスを生成するメソッド
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
  sendrecv(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrlCandidates, "sendrecv", channelId, metadata, options, this.debug);
  }
  /**
   * role sendonly で接続するための Connecion インスタンスを生成するメソッド
   *
   * @param channelId - チャネルID
   * @param metadata - メタデータ
   * @param options - コネクションオプション
   *
   * @returns
   * role sendonly な Connection オブジェクトを返します
   *
   * @public
   */
  sendonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionPublisher {
    return new ConnectionPublisher(this.signalingUrlCandidates, "sendonly", channelId, metadata, options, this.debug);
  }
  /**
   * role recvonly で接続するための Connecion インスタンスを生成するメソッド
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
  recvonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true }
  ): ConnectionSubscriber {
    return new ConnectionSubscriber(this.signalingUrlCandidates, "recvonly", channelId, metadata, options, this.debug);
  }
  /**
   * シグナリングに使用する URL の候補
   *
   * @public
   * @deprecated
   */
  get signalingUrl(): string | string[] {
    return this.signalingUrlCandidates;
  }
}

/**
 * Sora JS SDK package
 */
export default {
  /**
   * E2EE で使用する WASM の読み込みを行うメソッド
   *
   * @param wasmUrl - E2EE WASM の URL
   *
   * @public
   */
  initE2EE: async function (wasmUrl: string): Promise<void> {
    await SoraE2EE.loadWasm(wasmUrl);
  },
  /**
   * SoraConnection インスタンスを生成するメソッド
   *
   * @param wasmUrl - シグナリングに使用する URL 候補
   * @param debug - デバッグフラグ
   *
   * @public
   */
  connection: function (signalingUrlCandidates: string | string[], debug = false): SoraConnection {
    return new SoraConnection(signalingUrlCandidates, debug);
  },
  /**
   * SDK のバージョンを返すメソッド
   *
   * @public
   */
  version: function (): string {
    return "__SORA_JS_SDK_VERSION__";
  },
  /**
   * WebRTC のユーティリティ関数群
   *
   * @public
   */
  helpers: {
    applyMediaStreamConstraints,
  },
};

export type {
  AudioCodecType,
  Callbacks,
  ConnectionBase,
  ConnectionOptions,
  ConnectionPublisher,
  ConnectionSubscriber,
  DataChannelConfiguration,
  DataChannelDirection,
  Role,
  SignalingEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  SignalingNotifyMetadata,
  SignalingNotifyNetworkStatus,
  SignalingNotifySpotlightChanged,
  SignalingNotifySpotlightFocused,
  SignalingNotifySpotlightUnfocused,
  Simulcast,
  SimulcastRid,
  SoraAbendTitle,
  SoraCloseEvent,
  SoraCloseEventInitDict,
  SoraCloseEventType,
  SoraConnection,
  SpotlightFocusRid,
  TimelineEvent,
  TimelineEventLogType,
  TransportType,
  VideoCodecType,
};
