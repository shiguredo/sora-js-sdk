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
    // options.multistream が明示的に false を指定した時だけレガシーストリームにする
    if (this.options.multistream === false) {
      const stream = await Promise.race([
        this.legacyStream().finally(() => {
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
   * レガシーストリームで Sora へ接続するメソッド
   *
   * @deprecated この関数は非推奨です、マルチストリームを利用してください。
   *
   */
  private async legacyStream(): Promise<MediaStream> {
    await this.disconnect()
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates)
    const signalingMessage = await this.signaling(ws)
    await this.connectPeerConnection(signalingMessage)
    if (this.pc) {
      this.pc.ontrack = async (event): Promise<void> => {
        this.stream = event.streams[0]
        const streamId = this.stream.id
        if (streamId === 'default') {
          return
        }
        const data = {
          'stream.id': streamId,
          id: event.track.id,
          label: event.track.label,
          enabled: event.track.enabled,
          kind: event.track.kind,
          muted: event.track.muted,
          readyState: event.track.readyState,
        }
        this.writePeerConnectionTimelineLog('ontrack', data)
        this.callbacks.track(event)
        this.stream.onremovetrack = (event): void => {
          this.callbacks.removetrack(event)
          if (event.target) {
            const streamId = (event.target as MediaStreamTrack).id
            const index = this.remoteConnectionIds.indexOf(streamId)
            if (-1 < index) {
              delete this.remoteConnectionIds[index]
            }
          }
        }
        if (-1 < this.remoteConnectionIds.indexOf(streamId)) {
          return
        }
        this.remoteConnectionIds.push(streamId)
      }
    }
    await this.setRemoteDescription(signalingMessage)
    await this.createAnswer(signalingMessage)
    this.sendAnswer()
    if (this.pc?.getConfiguration().iceTransportPolicy === 'all') {
      await this.onIceCandidate()
    }
    await this.waitChangeConnectionStateConnected()
    return this.stream || new MediaStream()
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
    if (this.pc?.getConfiguration().iceTransportPolicy === 'all') {
      await this.onIceCandidate()
    }
    await this.waitChangeConnectionStateConnected()
    return
  }
}
