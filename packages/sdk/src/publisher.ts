import ConnectionBase from "./base";
import { LyraModule, LyraEncoder } from "@shiguredo/lyra-wasm";

let NOW = undefined;
let TOTAL_BYTES = 0;

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
    if (this.options.multistream) {
      await Promise.race([
        this.multiStream(stream).finally(() => {
          this.clearConnectionTimeout();
          this.clearMonitorSignalingWebSocketEvent();
        }),
        this.setConnectionTimeout(),
        this.monitorSignalingWebSocketEvent(),
      ]);
    } else {
      await Promise.race([
        this.singleStream(stream).finally(() => {
          this.clearConnectionTimeout();
          this.clearMonitorSignalingWebSocketEvent();
        }),
        this.setConnectionTimeout(),
        this.monitorSignalingWebSocketEvent(),
      ]);
    }
    this.monitorWebSocketEvent();
    this.monitorPeerConnectionState();
    return stream;
  }

  /**
   * シングルストリームで Sora へ接続するメソッド
   *
   * @param stream - メディアストリーム
   */
  private async singleStream(stream: MediaStream): Promise<MediaStream> {
    await this.disconnect();
    this.setupE2EE();
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
    const signalingMessage = await this.signaling(ws);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    console.log("set4");
    await this.setRemoteDescription(signalingMessage);
    stream.getTracks().forEach((track) => {
      if (this.pc) {
        this.pc.addTrack(track, stream);
      }
    });
    this.stream = stream;
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    console.log("getSenders(1)");
    if (this.pc && this.e2ee) {
      this.pc.getSenders().forEach((sender) => {
        if (this.e2ee) {
          this.e2ee.setupSenderTransform(sender);
        }
      });
    }
    await this.onIceCandidate();
    await this.waitChangeConnectionStateConnected();
    return stream;
  }

  /**
   * マルチストリームで Sora へ接続するメソッド
   *
   * @param stream - メディアストリーム
   */
  private async multiStream(stream: MediaStream): Promise<MediaStream> {
    await this.disconnect();
    this.setupE2EE();
    const ws = await this.getSignalingWebSocket(this.signalingUrlCandidates);
    const signalingMessage = await this.signaling(ws);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      console.log("set ontrack");
      this.pc.ontrack = (event): void => {
        if (event.track.kind == "audio") {
          console.log("ontrack: audio (pub)");
          const receiverStreams = event.receiver.createEncodedStreams();
          const transformStream = new TransformStream({
            transform: decodeFunction,
          });
          receiverStreams.readable.pipeThrough(transformStream).pipeTo(receiverStreams.writable);
        }

        const stream = event.streams[0];
        if (!stream) {
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
        if (stream.id === "default") {
          return;
        }
        if (stream.id === this.connectionId) {
          return;
        }
        if (this.e2ee) {
          this.e2ee.setupReceiverTransform(event.receiver);
        }
        this.callbacks.track(event);
        stream.onremovetrack = (event): void => {
          this.callbacks.removetrack(event);
          if (event.target) {
            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
            const index = this.remoteConnectionIds.indexOf(event.target.id as string);
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
    console.log("set3");
    await this.setRemoteDescription(signalingMessage);
    stream.getTracks().forEach((track) => {
      if (this.pc) {
        console.log("add track: " + track.kind);
        this.pc.addTrack(track, stream);
      }
    });
    if (this.pc) {
      // lyra
      const lyraModule = await LyraModule.load("./", "./");
      const lyraEncoder = lyraModule.createEncoder({ sampleRate: 16000, bitrate: 3200 });
      this.pc.getSenders().forEach((sender) => {
        if (sender == undefined || sender.track == undefined) {
          console.log("skip");
          return;
        }

        if (sender.track.kind === "audio") {
          console.log("set transform stream for audio");
          NOW = undefined;
          TOTAL_BYTES = 0;

          // @ts-ignore
          const senderStreams = sender.createEncodedStreams();
          const transformStream = new TransformStream({
            transform: (encodedFrame, controller) => encodeFunction(lyraEncoder, encodedFrame, controller),
          });
          senderStreams.readable.pipeThrough(transformStream).pipeTo(senderStreams.writable);
        }
      });
    }

    this.stream = stream;
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    console.log("getSenders(0)");
    if (this.pc && this.e2ee) {
      this.pc.getSenders().forEach((sender) => {
        if (this.e2ee) {
          this.e2ee.setupSenderTransform(sender);
        }
      });
    }
    await this.onIceCandidate();
    await this.waitChangeConnectionStateConnected();
    return stream;
  }
}

function encodeFunction(lyraEncoder: LyraEncoder, encodedFrame: RTCEncodedAudioFrame, controller) {
  if (NOW === undefined) {
    NOW = performance.now();
  }
  const rawDataI16 = new Int16Array(encodedFrame.data);
  const rawDataF32 = new Float32Array(rawDataI16.length);
  for (const [i, v] of rawDataI16.entries()) {
    rawDataF32[i] = v / 0x7fff;
  }
  const encoded = lyraEncoder.encode(rawDataF32);
  if (encoded === undefined) {
    // dtx
    throw Error("TODO");
  }
  encodedFrame.data = encoded.buffer;

  // TODO: Handle DTX
  // TODO: Reduce extra conversion between i16 and f32 (by updating lyra-wasm interface)

  if (performance.now() - NOW > 1000) {
    console.log(`bps: ${(TOTAL_BYTES * 8 * 1000) / (performance.now() - NOW)}`);
    NOW = performance.now();
    TOTAL_BYTES = 0;
  }
  TOTAL_BYTES += encodedFrame.data.byteLength;

  //console.log(encodedFrame.data.byteLength);
  controller.enqueue(encodedFrame);
}

function decodeFunction(encodedFrame, controller) {
  console.log("here");
  controller.enqueue(encodedFrame);
}
