import ConnectionBase from "./base";

export default class ConnectionPublisher extends ConnectionBase {
  async connect(stream: MediaStream): Promise<MediaStream> {
    this.writePeerConnectionTimelineLog("start-connecting-to-sora");
    if (this.options.multistream) {
      await Promise.race([
        this.multiStream(stream).finally(() => {
          this.clearConnectionTimeout();
        }),
        this.setConnectionTimeout(),
      ]);
    } else {
      await Promise.race([
        this.singleStream(stream).finally(() => {
          this.clearConnectionTimeout();
        }),
        this.setConnectionTimeout(),
      ]);
    }
    this.writePeerConnectionTimelineLog("connected-to-sora");
    return stream;
  }

  private async singleStream(stream: MediaStream): Promise<MediaStream> {
    await this.disconnect();
    this.setupE2EE();
    const offer = await this.createOffer();
    const signalingMessage = await this.signaling(offer);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    await this.setRemoteDescription(signalingMessage);
    stream.getTracks().forEach((track) => {
      if (this.pc) {
        this.pc.addTrack(track, stream);
      }
    });
    this.stream = stream;
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
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

  private async multiStream(stream: MediaStream): Promise<MediaStream> {
    await this.disconnect();
    this.setupE2EE();
    const offer = await this.createOffer();
    const signalingMessage = await this.signaling(offer);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      this.pc.ontrack = (event): void => {
        this.writePeerConnectionTimelineLog("ontrack");
        const stream = event.streams[0];
        if (!stream) {
          return;
        }
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
            const index = this.remoteConnectionIds.indexOf(event.target.id);
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
    stream.getTracks().forEach((track) => {
      if (this.pc) {
        this.pc.addTrack(track, stream);
      }
    });
    this.stream = stream;
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
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
