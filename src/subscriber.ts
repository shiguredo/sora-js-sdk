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
   * const recvonly = connection.recvonly("sora");
   * await recvonly.connect();
   * ```
   *
   * @public
   */
  async connect(): Promise<void> {
    await Promise.race([
      this.multiStream().finally(() => {
        this.clearConnectionTimeout();
        this.clearMonitorSignalingWebSocketEvent();
      }),
      this.setConnectionTimeout(),
      this.monitorSignalingWebSocketEvent(),
    ]);
    this.monitorWebSocketEvent();
    this.monitorPeerConnectionState();
  }

  /**
   * マルチストリームで Sora へ接続するメソッド
   */
  private async multiStream(): Promise<void> {
    await this.disconnect();
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
    const signalingMessage = await this.signaling(ws);
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      this.pc.ontrack = (event): void => {
        const stream = event.streams[0];
        // noUncheckedIndexedAccess により event.streams[0] は MediaStream | undefined になる
        // stream が存在しない場合は以降の処理を行わない
        if (!stream) {
          return;
        }
        if (stream.id === "default") {
          return;
        }
        if (stream.id === this.connectionId) {
          return;
        }
        const data = {
          enabled: event.track.enabled,
          id: event.track.id,
          kind: event.track.kind,
          label: event.track.label,
          muted: event.track.muted,
          readyState: event.track.readyState,
          "stream.id": stream.id,
        };
        this.writePeerConnectionTimelineLog("ontrack", data);
        this.callbacks.track(event);
        stream.onremovetrack = (event): void => {
          this.callbacks.removetrack(event);
          if (event.target) {
            const streamId = (event.target as MediaStream).id;
            const index = this.remoteConnectionIds.indexOf(streamId);
            if (index !== -1) {
              this.remoteConnectionIds.splice(index, 1);
            }
          }
        };
        if (this.remoteConnectionIds.includes(stream.id)) {
          return;
        }
        this.remoteConnectionIds.push(stream.id);
      };
    }
    await this.setRemoteDescription(signalingMessage);
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    if (!this.options.skipIceCandidateEvent) {
      await this.onIceCandidate();
    }
    await this.waitChangeConnectionStateConnected();
  }
}
