import ConnectionBase from './base'

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
  // biome-ignore lint/suspicious/noConfusingVoidType: stream が <MediaStream | void> なのでどうしようもない
  async connect(): Promise<MediaStream | void> {
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
    if (this.pc) {
      this.pc.ontrack = async (event): Promise<void> => {
        const stream = event.streams[0]
        if (stream.id === 'default') {
          return
        }
        if (stream.id === this.connectionId) {
          return
        }
        const data = {
          'stream.id': stream.id,
          id: event.track.id,
          label: event.track.label,
          enabled: event.track.enabled,
          kind: event.track.kind,
          muted: event.track.muted,
          readyState: event.track.readyState,
        }
        this.writePeerConnectionTimelineLog('ontrack', data)
        this.callbacks.track(event)
        stream.onremovetrack = (event): void => {
          this.callbacks.removetrack(event)
          if (event.target) {
            const streamId = (event.target as MediaStream).id
            const index = this.remoteConnectionIds.indexOf(streamId)
            if (-1 < index) {
              delete this.remoteConnectionIds[index]
            }
          }
        }
        if (-1 < this.remoteConnectionIds.indexOf(stream.id)) {
          return
        }
        this.remoteConnectionIds.push(stream.id)
      }
    }
    await this.setRemoteDescription(signalingMessage)
    await this.createAnswer(signalingMessage)
    this.sendAnswer()
    if (!this.options.skipIceCandidateEvent) {
      await this.onIceCandidate()
    }
    await this.waitChangeConnectionStateConnected()
    return
  }
}
