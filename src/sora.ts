import type ConnectionBase from './base'
import { applyMediaStreamConstraints } from './helpers'
import ConnectionMessaging from './messaging'
import ConnectionPublisher from './publisher'
import ConnectionSubscriber from './subscriber'
import type {
  AudioCodecType,
  Callbacks,
  ConnectionOptions,
  DataChannelConfiguration,
  DataChannelDirection,
  DataChannelEvent,
  DataChannelMessageEvent,
  DataChannelSignalingMessage,
  ForwardingFilter,
  ForwardingFilterAction,
  ForwardingFilterRule,
  ForwardingFilterRuleField,
  ForwardingFilterRuleKindValue,
  ForwardingFilterRuleOperator,
  ForwardingFilterRuleValue,
  JSONRPCErrorResponse,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCSuccessResponse,
  JSONType,
  MessagingHeaderField,
  MessagingHeaderFieldType,
  Role,
  RPCOptions,
  SignalingAudio,
  SignalingCloseMessage,
  SignalingConnectDataChannel,
  SignalingConnectMessage,
  SignalingEvent,
  SignalingMessageDirection,
  SignalingMessageEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  SignalingNotifyMetadata,
  SignalingNotifyNetworkStatus,
  SignalingNotifySpotlightChanged,
  SignalingNotifySpotlightFocused,
  SignalingNotifySpotlightUnfocused,
  SignalingOfferMessage,
  SignalingOfferMessageDataChannel,
  SignalingPingMessage,
  SignalingPushMessage,
  SignalingRedirectMessage,
  SignalingReOfferMessage,
  SignalingReqStatsMessage,
  SignalingSwitchedMessage,
  SignalingUpdateMessage,
  SignalingVideo,
  Simulcast,
  SimulcastRequestRid,
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
  WebSocketSignalingMessage,
} from './types'

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
  signalingUrlCandidates: string | string[]
  /**
   * デバッグフラグ
   */
  debug: boolean

  constructor(signalingUrlCandidates: string | string[], debug = false) {
    this.signalingUrlCandidates = signalingUrlCandidates
    this.debug = debug
  }
  /**
   * role sendrecv で接続するための Connection インスタンスを生成するメソッド
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
  sendrecv(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true },
  ): ConnectionPublisher {
    return new ConnectionPublisher(
      this.signalingUrlCandidates,
      'sendrecv',
      channelId,
      metadata,
      options,
      this.debug,
    )
  }
  /**
   * role sendonly で接続するための Connection インスタンスを生成するメソッド
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
  sendonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true },
  ): ConnectionPublisher {
    return new ConnectionPublisher(
      this.signalingUrlCandidates,
      'sendonly',
      channelId,
      metadata,
      options,
      this.debug,
    )
  }
  /**
   * role recvonly で接続するための Connection インスタンスを生成するメソッド
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
  recvonly(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: true, video: true },
  ): ConnectionSubscriber {
    return new ConnectionSubscriber(
      this.signalingUrlCandidates,
      'recvonly',
      channelId,
      metadata,
      options,
      this.debug,
    )
  }

  messaging(
    channelId: string,
    metadata: JSONType = null,
    options: ConnectionOptions = { audio: false, video: false },
  ): ConnectionMessaging {
    options.audio = false
    options.video = false
    options.dataChannelSignaling = true
    return new ConnectionMessaging(
      this.signalingUrlCandidates,
      // messaging は role sendonly として扱う
      'sendonly',
      channelId,
      metadata,
      options,
      this.debug,
    )
  }

  /**
   * シグナリングに使用する URL の候補
   *
   * @public
   * @deprecated
   */
  get signalingUrl(): string | string[] {
    return this.signalingUrlCandidates
  }
}

/**
 * Sora JS SDK package
 */
export default {
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
  connection: (signalingUrlCandidates: string | string[], debug = false): SoraConnection => {
    return new SoraConnection(signalingUrlCandidates, debug)
  },
  /**
   * SDK のバージョンを返すメソッド
   *
   * @public
   */
  version: (): string => {
    return __SORA_JS_SDK_VERSION__
  },
  /**
   * WebRTC のユーティリティ関数群
   *
   * @public
   */
  helpers: {
    applyMediaStreamConstraints,
  },
}

export type {
  AudioCodecType,
  Callbacks,
  ConnectionBase,
  ConnectionMessaging,
  ConnectionOptions,
  ConnectionPublisher,
  ConnectionSubscriber,
  DataChannelConfiguration,
  DataChannelDirection,
  DataChannelEvent,
  DataChannelMessageEvent,
  DataChannelSignalingMessage,
  ForwardingFilter,
  ForwardingFilterAction,
  ForwardingFilterRule,
  ForwardingFilterRuleField,
  ForwardingFilterRuleKindValue,
  ForwardingFilterRuleOperator,
  ForwardingFilterRuleValue,
  JSONRPCErrorResponse,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCSuccessResponse,
  JSONType,
  MessagingHeaderField,
  MessagingHeaderFieldType,
  Role,
  RPCOptions,
  SignalingAudio,
  SignalingCloseMessage,
  SignalingConnectDataChannel,
  SignalingConnectMessage,
  SignalingEvent,
  SignalingMessageDirection,
  SignalingMessageEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyConnectionDestroyed,
  SignalingNotifyConnectionUpdated,
  SignalingNotifyMessage,
  SignalingNotifyMetadata,
  SignalingNotifyNetworkStatus,
  SignalingNotifySpotlightChanged,
  SignalingNotifySpotlightFocused,
  SignalingNotifySpotlightUnfocused,
  SignalingOfferMessage,
  SignalingOfferMessageDataChannel,
  SignalingPingMessage,
  SignalingPushMessage,
  SignalingRedirectMessage,
  SignalingReOfferMessage,
  SignalingReqStatsMessage,
  SignalingSwitchedMessage,
  SignalingUpdateMessage,
  SignalingVideo,
  Simulcast,
  SimulcastRequestRid,
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
  WebSocketSignalingMessage,
}
