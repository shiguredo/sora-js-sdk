import ConnectionBase from "./base";
/**
 * Role が "recvonly" の場合に Sora との WebRTC 接続を扱うクラス
 */
export default class ConnectionSubscriber extends ConnectionBase {
    /**
     * Sora へ接続するメソッド
     *
     * @example
     * ```typescript
     * const recvonly = connection.sendrecv("sora");
     * await recvonly.connect();
     * ```
     *
     * @public
     */
    connect(): Promise<MediaStream | void>;
    /**
     * シングルストリームで Sora へ接続するメソッド
     */
    private singleStream;
    /**
     * マルチストリームで Sora へ接続するメソッド
     */
    private multiStream;
}
