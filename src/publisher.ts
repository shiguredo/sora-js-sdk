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
  async connect(stream: MediaStream): Promise<MediaStream> {
    // options.multistream が明示的に false を指定した時だけレガシーストリームにする
    await Promise.race([
      this.multiStream(stream).finally(() => {
        this.clearConnectionTimeout();
        this.clearMonitorSignalingWebSocketEvent();
      }),
      this.setConnectionTimeout(),
      this.monitorSignalingWebSocketEvent(),
    ]);
    this.monitorWebSocketEvent();
    this.monitorPeerConnectionState();
    return stream;
  }

  /**
   * マルチストリームで Sora へ接続するメソッド
   *
   * @param stream - メディアストリーム
   */
  private async multiStream(stream: MediaStream): Promise<MediaStream> {
    await this.disconnect();
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
    const signalingMessage = await this.signaling(ws);
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      this.pc.ontrack = (event): void => {
        const stream = event.streams[0];
        if (!stream) {
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
        if (stream.id === "default") {
          return;
        }
        if (stream.id === this.connectionId) {
          return;
        }
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
    for (const track of stream.getTracks()) {
      if (this.pc) {
        this.pc.addTrack(track, stream);
      }
    }
    this.stream = stream;
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    if (!this.options.skipIceCandidateEvent) {
      await this.onIceCandidate();
    }
    await this.waitChangeConnectionStateConnected();
    return stream;
  }
}
