import ConnectionBase from './base'
import { isFirefox } from './utils'

/**
 * messaging_only 専用のクラス
 * 利用する場合は Sora 側での設定が必要
 * Role は "sendonly" に固定される
 */
export default class ConnectionMessaging extends ConnectionBase {
  /**
   * Sora へ接続するメソッド、legacyStream は利用できない
   *
   * @example
   * ```typescript
   * const messaging = connection.messaging("sora");
   * await messaging.connect();
   * ```
   *
   * @public
   */
  async connect(): Promise<void> {
    // options が
    await Promise.race([
      this.multiStream().finally(() => {
        this.clearConnectionTimeout()
        this.clearMonitorSignalingWebSocketEvent()
      }),
      this.setConnectionTimeout(),
      this.monitorSignalingWebSocketEvent(),
    ])
    this.monitorWebSocketEvent()
    this.monitorPeerConnectionState()
  }

  /**
   * マルチストリームで Sora へ接続するメソッド
   */
  private async multiStream(): Promise<void> {
    await this.disconnect()
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates)
    const signalingMessage = await this.signaling(ws)
    await this.connectPeerConnection(signalingMessage)
    await this.setRemoteDescription(signalingMessage)
    await this.createAnswer(signalingMessage)
    this.sendAnswer()
    if (!this.options.skipIceCandidateEvent) {
      await this.onIceCandidate()
    }
    await this.waitChangeConnectionStateConnected()
  }
}
