import { Callbacks, ConnectionOptions, JSONType, DataChannelConfiguration, SignalingOfferMessage, SignalingReOfferMessage, SignalingUpdateMessage } from "./types";
import SoraE2EE from "@sora/e2ee";
declare global {
    interface Algorithm {
        namedCurve: string;
    }
}
/**
 * Sora との WebRTC 接続を扱う基底クラス
 *
 * @param signalingUrlCandidates - シグナリングに使用する URL の候補
 * @param role - ロール
 * @param channelId - チャネルID
 * @param metadata - メタデータ
 * @param options - コネクションオプション
 * @param debug - デバッグフラグ
 */
export default class ConnectionBase {
    /**
     * ロール(sendonly | sendrecv | recvonly)
     */
    role: string;
    /**
     * チャネルID
     */
    channelId: string;
    /**
     * メタデータ
     */
    metadata: JSONType | undefined;
    /**
     * シグナリングに使用する URL 候補
     */
    signalingUrlCandidates: string | string[];
    /**
     * 接続オプション
     */
    options: ConnectionOptions;
    /**
     * PeerConnection に渡す configuration
     */
    constraints: any;
    /**
     * デバッグフラグ
     */
    debug: boolean;
    /**
     * クライアントID
     */
    clientId: string | null;
    /**
     * コネクションID
     */
    connectionId: string | null;
    /**
     * リモートコネクションIDのリスト
     */
    remoteConnectionIds: string[];
    /**
     * メディアストリーム
     */
    stream: MediaStream | null;
    /**
     * type offer に含まれる認証 metadata
     */
    authMetadata: JSONType;
    /**
     * PeerConnection インスタンス
     */
    pc: RTCPeerConnection | null;
    /**
     * サイマルキャストで使用する RTCRtpEncodingParameters のリスト
     */
    encodings: RTCRtpEncodingParameters[];
    /**
     * WebSocket インスタンス
     */
    private ws;
    /**
     * 初回シグナリング時接続タイムアウト用のタイマーID
     */
    private connectionTimeoutTimerId;
    /**
     * WebSocket 切断監視用のタイマーID
     */
    private monitorSignalingWebSocketEventTimerId;
    /**
     * PeerConnection state 切断監視用のタイマーID
     */
    private monitorIceConnectionStateChangeTimerId;
    /**
     * 接続中の DataChannel リスト
     */
    private soraDataChannels;
    /**
     * 初回シグナリング接続時のタイムアウトに使用するタイムアウト時間(デフォルト 60000ms)
     */
    private connectionTimeout;
    /**
     * シグナリング候補のURLへの接続確認タイムアウトに使用するタイムアウト時間(デフォルト 3000ms)
     */
    private signalingCandidateTimeout;
    /**
     * 切断処理のタイムアウトに使用するタイムアウト時間(デフォルト 3000ms)
     */
    private disconnectWaitTimeout;
    /**
     * audio / video の msid
     */
    private mids;
    /**
     * シグナリングを DataChannel へ switch したかどうかのフラグ
     */
    private signalingSwitched;
    /**
     * シグナリング type offer に含まれる DataChannel レコード
     */
    private signalingOfferMessageDataChannels;
    /**
     * イベントコールバックのリスト
     */
    protected callbacks: Callbacks;
    /**
     * E2EE インスタンス
     */
    protected e2ee: SoraE2EE | null;
    constructor(signalingUrlCandidates: string | string[], role: string, channelId: string, metadata: JSONType, options: ConnectionOptions, debug: boolean);
    /**
     * SendRecv Object で発火するイベントのコールバックを設定するメソッド
     *
     * @example
     * ```
     * const sendrecv = connection.sendrecv("sora");
     * sendrecv.on("track", (event) => {
     *   // callback 処理
     * });
     * ```
     *
     * @remarks
     * addstream イベントは非推奨です. track イベントを使用してください
     *
     * removestream イベントは非推奨です. removetrack イベントを使用してください
     *
     * @param kind - イベントの種類(disconnect, push, track, removetrack, notify, log, timeout, timeline, signaling, message, datachannel)
     * @param callback - コールバック関数
     *
     * @public
     */
    on<T extends keyof Callbacks, U extends Callbacks[T]>(kind: T, callback: U): void;
    /**
     * audio track を停止するメソッド
     *
     * @example
     * ```
     * const sendrecv = connection.sendrecv("sora");
     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
     * await sendrecv.connect(mediaStream);
     *
     * sendrecv.stopAudioTrack(mediaStream);
     * ```
     *
     * @remarks
     * stream の audio track を停止後、PeerConnection の senders から対象の sender を削除します
     *
     * @param stream - audio track を削除する MediaStream
     *
     * @public
     */
    stopAudioTrack(stream: MediaStream): Promise<void>;
    /**
     * video track を停止するメソッド
     *
     * @example
     * ```
     * const sendrecv = connection.sendrecv("sora");
     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
     * await sendrecv.connect(mediaStream);
     *
     * sendrecv.stopVideoTrack(mediaStream);
     * ```
     *
     * @remarks
     * stream の video track を停止後、PeerConnection の senders から対象の sender を削除します
     *
     * @param stream - video track を削除する MediaStream
     *
     * @public
     */
    stopVideoTrack(stream: MediaStream): Promise<void>;
    /**
     * audio track を入れ替えするメソッド
     *
     * @example
     * ```
     * const sendrecv = connection.sendrecv("sora");
     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
     * await sendrecv.connect(mediaStream);
     *
     * const replacedMediaStream = await navigator.mediaDevices.getUserMedia({audio: true});
     * await sendrecv.replaceAudioTrack(mediaStream, replacedMediaStream.getAudioTracks()[0]);
     * ```
     *
     * @remarks
     * stream の audio track を停止後、新しい audio track をセットします
     *
     * @param stream - audio track を削除する MediaStream
     * @param audioTrack - 新しい audio track
     *
     * @public
     */
    replaceAudioTrack(stream: MediaStream, audioTrack: MediaStreamTrack): Promise<void>;
    /**
     * video track を入れ替えするメソッド
     *
     * @example
     * ```
     * const sendrecv = connection.sendrecv("sora");
     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
     * await sendrecv.connect(mediaStream);
     *
     * const replacedMediaStream = await navigator.mediaDevices.getUserMedia({video: true});
     * await sendrecv.replaceVideoTrack(mediaStream, replacedMediaStream.getVideoTracks()[0]);
     * ```
     *
     * @remarks
     * stream の video track を停止後、新しい video track をセットします
     *
     * @param stream - video track を削除する MediaStream
     * @param videoTrack - 新しい video track
     *
     * @public
     */
    replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void>;
    /**
     * stream を停止するメソッド
     */
    private stopStream;
    /**
     * connect 処理中に例外が発生した場合の切断処理をするメソッド
     */
    private signalingTerminate;
    /**
     * PeerConnection の state に異常が発生した場合の切断処理をするメソッド
     *
     * @param title - disconnect callback に渡すイベントのタイトル
     */
    private abendPeerConnectionState;
    /**
     * 何かしらの異常があった場合の切断処理
     *
     * @param title - disconnect callback に渡すイベントのタイトル
     * @param params - 切断時の状況を入れる Record
     */
    private abend;
    /**
     * 接続状態の初期化をするメソッド
     */
    private initializeConnection;
    /**
     * WebSocket を切断するメソッド
     *
     * @remarks
     * 正常/異常どちらの切断でも使用する
     *
     * @param title - type disconnect 時の reason
     */
    private disconnectWebSocket;
    /**
     * DataChannel を切断するメソッド
     *
     * @remarks
     * 正常/異常どちらの切断でも使用する
     */
    private disconnectDataChannel;
    /**
     * PeerConnection を切断するメソッド
     *
     * @remarks
     * 正常/異常どちらの切断でも使用する
     */
    private disconnectPeerConnection;
    /**
     * 切断処理をするメソッド
     *
     * @example
     * ```
     * await sendrecv.disconnect();
     * ```
     *
     * @public
     */
    disconnect(): Promise<void>;
    /**
     * E2EE の初期設定をするメソッド
     */
    protected setupE2EE(): void;
    /**
     * E2EE を開始するメソッド
     */
    protected startE2EE(): void;
    /**
     * シグナリングに使う WebSocket インスタンスを作成するメソッド
     *
     * @remarks
     * シグナリング候補の URL 一覧に順に接続します
     *
     * 接続できた URL がない場合は例外が発生します
     *
     * @param signalingUrlCandidates - シグナリング候補の URL. 後方互換のため string | string[] を受け取る
     *
     * @returns
     * 接続できた WebScoket インスタンスを返します
     */
    protected getSignalingWebSocket(signalingUrlCandidates: string | string[]): Promise<WebSocket>;
    /**
     * シグナリング処理を行うメソッド
     *
     * @remarks
     * シグナリング候補の URL 一覧に順に接続します
     *
     * 接続できた URL がない場合は例外が発生します
     *
     * @param ws - WebSocket インスタンス
     * @param redirect - クラスター接続時にリダイレクトされた場合のフラグ
     *
     * @returns
     * Sora から受け取った type offer メッセージを返します
     */
    protected signaling(ws: WebSocket, redirect?: boolean): Promise<SignalingOfferMessage>;
    /**
     * PeerConnection 接続処理をするメソッド
     *
     * @param message - シグナリング処理で受け取った type offer メッセージ
     */
    protected connectPeerConnection(message: SignalingOfferMessage): Promise<void>;
    /**
     * setRemoteDescription 処理を行うメソッド
     *
     * @param message - シグナリング処理で受け取った type offer | type update | type re-offer メッセージ
     */
    protected setRemoteDescription(message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage): Promise<void>;
    /**
     * createAnswer 処理を行うメソッド
     *
     * @remarks
     * サイマルキャスト用の setParameters 処理もここで行う
     *
     * @param message - シグナリング処理で受け取った type offer | type update | type re-offer メッセージ
     */
    protected createAnswer(message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage): Promise<void>;
    /**
     * シグナリングサーバーに type answer を投げるメソッド
     */
    protected sendAnswer(): void;
    /**
     * iceCnadidate 処理をするメソッド
     */
    protected onIceCandidate(): Promise<void>;
    /**
     * connectionState が "connected" になるのを監視するメソッド
     *
     * @remarks
     * PeerConnection.connectionState が実装されていない場合は何もしない
     */
    protected waitChangeConnectionStateConnected(): Promise<void>;
    /**
     * 初回シグナリング接続時の WebSocket の切断を監視するメソッド
     *
     * @remarks
     * 意図しない切断があった場合には異常終了処理を実行する
     */
    protected monitorSignalingWebSocketEvent(): Promise<void>;
    /**
     * WebSocket の切断を監視するメソッド
     *
     * @remarks
     * 意図しない切断があった場合には異常終了処理を実行する
     */
    protected monitorWebSocketEvent(): void;
    /**
     * 初回シグナリング後 PeerConnection の state を監視するメソッド
     *
     * @remarks
     * connectionState, iceConnectionState を監視して不正な場合に切断する
     */
    protected monitorPeerConnectionState(): void;
    /**
     * 初回シグナリングの接続タイムアウト処理をするメソッド
     */
    protected setConnectionTimeout(): Promise<MediaStream>;
    /**
     * setConnectionTimeout でセットしたタイマーを止めるメソッド
     */
    protected clearConnectionTimeout(): void;
    /**
     * monitorSignalingWebSocketEvent でセットしたタイマーを止めるメソッド
     */
    protected clearMonitorSignalingWebSocketEvent(): void;
    /**
     * monitorPeerConnectionState でセットしたタイマーを止めるメソッド
     */
    protected clearMonitorIceConnectionStateChange(): void;
    /**
     * trace log を出力するメソッド
     *
     * @param title - ログのタイトル
     * @param message - ログの本文
     */
    protected trace(title: string, message: unknown): void;
    /**
     * WebSocket のシグナリングログ処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     */
    protected writeWebSocketSignalingLog(eventType: string, data?: unknown): void;
    /**
     * DataChannel のシグナリングログ処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     */
    protected writeDataChannelSignalingLog(eventType: string, channel: RTCDataChannel, data?: unknown): void;
    /**
     * WebSocket のタイムラインログ処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     */
    protected writeWebSocketTimelineLog(eventType: string, data?: unknown): void;
    /**
     * DataChannel のタイムラインログ処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     */
    protected writeDataChannelTimelineLog(eventType: string, channel: RTCDataChannel, data?: unknown): void;
    /**
     * PeerConnection のタイムラインログ処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     */
    protected writePeerConnectionTimelineLog(eventType: string, data?: unknown): void;
    /**
     * Sora との接続のタイムラインログ処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     */
    protected writeSoraTimelineLog(eventType: string, data?: unknown): void;
    /**
     * createOffer 処理をするメソッド
     *
     * @param eventType - イベントタイプ
     * @param data - イベントデータ
     *
     * @returns
     * 生成した RTCSessionDescription を返します
     */
    private createOffer;
    /**
     * シグナリングサーバーから受け取った type e2ee メッセージを処理をするメソッド
     *
     * @param data - E2EE 用バイナリメッセージ
     */
    private signalingOnMessageE2EE;
    /**
     * シグナリングサーバーから受け取った type offer メッセージを処理をするメソッド
     *
     * @param message - type offer メッセージ
     */
    private signalingOnMessageTypeOffer;
    /**
     * シグナリングサーバーに type update を投げるメソッド
     */
    private sendUpdateAnswer;
    /**
     * シグナリングサーバーに type re-answer を投げるメソッド
     */
    private sendReAnswer;
    /**
     * シグナリングサーバーから受け取った type update メッセージを処理をするメソッド
     *
     * @param message - type update メッセージ
     */
    private signalingOnMessageTypeUpdate;
    /**
     * シグナリングサーバーから受け取った type re-offer メッセージを処理をするメソッド
     *
     * @param message - type re-offer メッセージ
     */
    private signalingOnMessageTypeReOffer;
    /**
     * シグナリングサーバーから受け取った type ping メッセージを処理をするメソッド
     *
     * @param message - type ping メッセージ
     */
    private signalingOnMessageTypePing;
    /**
     * シグナリングサーバーから受け取った type notify メッセージを処理をするメソッド
     *
     * @param message - type notify メッセージ
     */
    private signalingOnMessageTypeNotify;
    /**
     * シグナリングサーバーから受け取った type switched メッセージを処理をするメソッド
     *
     * @param message - type switched メッセージ
     */
    private signalingOnMessageTypeSwitched;
    /**
     * シグナリングサーバーから受け取った type redirect メッセージを処理をするメソッド
     *
     * @param message - type redirect メッセージ
     */
    private signalingOnMessageTypeRedirect;
    /**
     * sender の parameters に encodings をセットするメソッド
     *
     * @remarks
     * サイマルキャスト用の処理
     */
    private setSenderParameters;
    /**
     * PeerConnection から RTCStatsReport を取得するためのメソッド
     */
    private getStats;
    /**
     * PeerConnection の ondatachannel callback メソッド
     *
     * @param dataChannelEvent - DataChannel イベント
     */
    private onDataChannel;
    /**
     * シグナリングサーバーへメッセージを送信するメソッド
     *
     * @param message - 送信するメッセージ
     */
    private sendSignalingMessage;
    /**
     * シグナリングサーバーに E2E 用メッセージを投げるメソッド
     *
     * @param message - 送信するバイナリメッセージ
     */
    private sendE2EEMessage;
    /**
     * シグナリングサーバーに stats メッセージを投げるメソッド
     *
     * @param reports - RTCStatsReport のリスト
     */
    private sendStatsMessage;
    /**
     * audio transceiver を取得するメソッド
     */
    private getAudioTransceiver;
    /**
     * video transceiver を取得するメソッド
     */
    private getVideoTransceiver;
    /**
     * disconnect callback に渡す Event オブジェクトを生成するためのメソッド
     *
     * @param type - Event タイプ(normal | abend)
     * @param title - Event タイトル
     * @param initDict - Event に設定するオプションパラメーター
     */
    private soraCloseEvent;
    /**
     * DataChannel を使用してメッセージを送信するメソッド
     *
     * @param label - メッセージを送信する DataChannel のラベル
     * @param message - Uint8Array
     */
    sendMessage(label: string, message: Uint8Array): void;
    /**
     * E2EE の自分のフィンガープリント
     */
    get e2eeSelfFingerprint(): string | undefined;
    /**
     * E2EE のリモートのフィンガープリントリスト
     */
    get e2eeRemoteFingerprints(): Record<string, string> | undefined;
    /**
     * audio が有効かどうか
     */
    get audio(): boolean;
    /**
     * video が有効かどうか
     */
    get video(): boolean;
    /**
     * シグナリングに使用する URL
     *
     * @deprecated
     */
    get signalingUrl(): string | string[];
    /**
     * 接続中のシグナリング URL
     */
    get connectedSignalingUrl(): string;
    /**
     * DataChannel メッセージング用の DataChannel 情報のリスト
     */
    get datachannels(): DataChannelConfiguration[];
}
