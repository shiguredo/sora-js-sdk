import ConnectionBase from "./base";
/**
 * Role が "sendonly" または "sendrecv" の場合に Sora との WebRTC 接続を扱うクラス
 */
export default class ConnectionPublisher extends ConnectionBase {
    /**
     * Sora へ接続するメソッド
     *
     * @example
     * ```typescript
     * const sendrecv = connection.sendrecv("sora");
     * const mediaStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
     * await sendrecv.connect(mediaStream);
     * ```
     *
     * @param stream - メディアストリーム
     *
     * @public
     */
    connect(stream: MediaStream): Promise<MediaStream>;
    /**
     * シングルストリームで Sora へ接続するメソッド
     *
     * @param stream - メディアストリーム
     */
    private singleStream;
    /**
     * マルチストリームで Sora へ接続するメソッド
     *
     * @param stream - メディアストリーム
     */
    private multiStream;
}
