import ConnectionBase from "./base";
import { LYRA_MODULE } from "./base";
import { LyraDecoder } from "@shiguredo/lyra-wasm";

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
  async connect(): Promise<MediaStream | void> {
    if (this.options.multistream) {
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
      return;
    } else {
      const stream = await Promise.race([
        this.singleStream().finally(() => {
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
  }

  /**
   * シングルストリームで Sora へ接続するメソッド
   */
  private async singleStream(): Promise<MediaStream> {
    await this.disconnect();
    this.setupE2EE();
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
    const signalingMessage = await this.signaling(ws);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      this.pc.ontrack = (event): void => {
        this.stream = event.streams[0];
        const streamId = this.stream.id;
        if (streamId === "default") {
          return;
        }
        const data = {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "stream.id": streamId,
          id: event.track.id,
          label: event.track.label,
          enabled: event.track.enabled,
          kind: event.track.kind,
          muted: event.track.muted,
          readyState: event.track.readyState,
        };
        this.writePeerConnectionTimelineLog("ontrack", data);
        if (this.e2ee) {
          this.e2ee.setupReceiverTransform(event.receiver);
        }
        this.callbacks.track(event);
        this.stream.onremovetrack = (event): void => {
          this.callbacks.removetrack(event);
          if (event.target) {
            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
            const targetId = event.target.id as string;
            const index = this.remoteConnectionIds.indexOf(targetId);
            if (-1 < index) {
              delete this.remoteConnectionIds[index];
              // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
              event.stream = event.target;
              this.callbacks.removestream(event);
            }
          }
        };
        if (-1 < this.remoteConnectionIds.indexOf(streamId)) {
          return;
        }
        // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
        event.stream = this.stream;
        this.remoteConnectionIds.push(streamId);
        this.callbacks.addstream(event);
      };
    }
    await this.setRemoteDescription(signalingMessage);
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    await this.onIceCandidate();
    await this.waitChangeConnectionStateConnected();
    return this.stream || new MediaStream();
  }

  /**
   * マルチストリームで Sora へ接続するメソッド
   */
  private async multiStream(): Promise<void> {
    await this.disconnect();
    this.setupE2EE();
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
    const signalingMessage = await this.signaling(ws);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      this.pc.ontrack = (event): void => {
        if (LYRA_MODULE && this.options.audioCodecType == "LYRA") {
          // @ts-ignore
          // eslint-disable-next-line
          const receiverStreams = event.receiver.createEncodedStreams();
          if (event.track.kind == "audio") {
            const lyraDecoder = LYRA_MODULE.createDecoder({ sampleRate: 16000 });
            const transformStream = new TransformStream({
              transform: (data, controller) => decodeFunction(lyraDecoder, data, controller),
            });
            // eslint-disable-next-line
            receiverStreams.readable.pipeThrough(transformStream).pipeTo(receiverStreams.writable);
          } else {
            // eslint-disable-next-line
            receiverStreams.readable.pipeTo(receiverStreams.writable);
          }
        }

        const stream = event.streams[0];
        if (stream.id === "default") {
          return;
        }
        if (stream.id === this.connectionId) {
          return;
        }
        const data = {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "stream.id": stream.id,
          id: event.track.id,
          label: event.track.label,
          enabled: event.track.enabled,
          kind: event.track.kind,
          muted: event.track.muted,
          readyState: event.track.readyState,
        };
        this.writePeerConnectionTimelineLog("ontrack", data);
        if (this.e2ee) {
          this.e2ee.setupReceiverTransform(event.receiver);
        }
        this.callbacks.track(event);
        stream.onremovetrack = (event): void => {
          this.callbacks.removetrack(event);
          if (event.target) {
            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
            const targetId = event.target.id as string;
            const index = this.remoteConnectionIds.indexOf(targetId);
            if (-1 < index) {
              delete this.remoteConnectionIds[index];
              // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
              event.stream = event.target;
              this.callbacks.removestream(event);
            }
          }
        };
        if (-1 < this.remoteConnectionIds.indexOf(stream.id)) {
          return;
        }
        // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
        event.stream = stream;
        this.remoteConnectionIds.push(stream.id);
        this.callbacks.addstream(event);
      };
    }
    await this.setRemoteDescription(signalingMessage);
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    await this.onIceCandidate();
    await this.waitChangeConnectionStateConnected();
    return;
  }
}

// @ts-ignore
function decodeFunction(lyraDecoder: LyraDecoder, encodedFrame, controller) {
  // TODO: handle DTX(?)
  // eslint-disable-next-line
  const decodedF32 = lyraDecoder.decode(new Uint8Array(encodedFrame.data));
  const decodedI16 = new Int16Array(decodedF32.length);
  for (const [i, v] of decodedF32.entries()) {
    const v2 = (v >> 8) | ((v << 8) & 0xff);
    decodedI16[i] = v2 * 0x7fff;
  }
  // eslint-disable-next-line
  encodedFrame.data = decodedI16.buffer;
  // eslint-disable-next-line
  controller.enqueue(encodedFrame);
}
