import ConnectionBase from "./base";

export default class ConnectionSubscriber extends ConnectionBase {
  async connect(): Promise<MediaStream | void> {
    this.writePeerConnectionTimelineLog("start-connecting-to-sora");
    if (this.options.multistream) {
      return await Promise.race([
        this.multiStream().finally(() => {
          this.clearConnectionTimeout();
          this.writePeerConnectionTimelineLog("connected-to-sora");
        }),
        this.setConnectionTimeout(),
      ]);
    } else {
      return await Promise.race([
        this.singleStream().finally(() => {
          this.clearConnectionTimeout();
          this.writePeerConnectionTimelineLog("connected-to-sora");
        }),
        this.setConnectionTimeout(),
      ]);
    }
  }

  private async singleStream(): Promise<MediaStream> {
    await this.disconnect();
    this.setupE2EE();
    const offer = await this.createOffer();
    const signalingMessage = await this.signaling(offer);
    this.startE2EE();
    await this.connectPeerConnection(signalingMessage);
    if (this.pc) {
      this.pc.ontrack = (event): void => {
        this.writePeerConnectionTimelineLog("ontrack");
        this.stream = event.streams[0];
        const streamId = this.stream.id;
        if (streamId === "default") {
          return;
        }
        if (this.e2ee) {
          this.e2ee.setupReceiverTransform(event.receiver);
        }
        this.callbacks.track(event);
        this.stream.onremovetrack = (event): void => {
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

  private async multiStream(): Promise<void> {
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
    await this.createAnswer(signalingMessage);
    this.sendAnswer();
    await this.onIceCandidate();
    await this.waitChangeConnectionStateConnected();
    return;
  }
}
