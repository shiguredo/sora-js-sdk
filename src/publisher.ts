import ConnectionBase from './base'

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
        this.clearConnectionTimeout()
        this.clearMonitorSignalingWebSocketEvent()
      }),
      this.setConnectionTimeout(),
      this.monitorSignalingWebSocketEvent(),
    ])
    this.monitorWebSocketEvent()
    this.monitorPeerConnectionState()
    return stream
  }

  /**
   * マルチストリームで Sora へ接続するメソッド
   *
   * @param stream - メディアストリーム
   */
  private async multiStream(stream: MediaStream): Promise<MediaStream> {
    await this.disconnect()
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates)
    const signalingMessage = await this.signaling(ws)
    await this.connectPeerConnection(signalingMessage)
    if (this.pc) {
      this.pc.ontrack = async (event): Promise<void> => {
        const stream = event.streams[0]
        if (!stream) {
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
        if (stream.id === 'default') {
          return
        }
        if (stream.id === this.connectionId) {
          return
        }
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
    stream.getTracks().filter((track) => {
      if (this.pc) {
        this.pc.addTrack(track, stream)
      }
    })
    this.stream = stream
    await this.createAnswer(signalingMessage)
    this.sendAnswer()
    await this.onIceCandidate()
    await this.waitChangeConnectionStateConnected()
    return stream
  }
}
