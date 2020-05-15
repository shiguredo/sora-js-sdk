import ConnectionBase from "./base";

export default class ConnectionSubscriber extends ConnectionBase {
  connect(): Promise<MediaStream | void> {
    if (this.options.multistream) {
      return this._multiStream();
    } else {
      return this._singleStream();
    }
  }
  async _singleStream(): Promise<MediaStream> {
    let timeoutTimerId = 0;
    if (this.options.timeout && 0 < this.options.timeout) {
      timeoutTimerId = setTimeout(() => {
        const error = new Error();
        error.message = "CONNECTION TIMEOUT";
        this._callbacks.timeout();
        this.disconnect();
        Promise.reject(error);
      }, this.options.timeout);
    }

    await this.disconnect();
    const offer = await this._createOffer();
    const signalingMessage = await this._signaling(offer);
    await this._connectPeerConnection(signalingMessage);
    if (this._pc) {
      this._pc.ontrack = (event): void => {
        this.stream = event.streams[0];
        const streamId = this.stream.id;
        if (streamId === "default") return;
        if (this.e2ee) {
          this.e2ee.setupReceiverTransform(event.receiver);
        }
        this._callbacks.track(event);
        if (-1 < this.remoteConnectionIds.indexOf(streamId)) return;
        // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
        event.stream = this.stream;
        this.remoteConnectionIds.push(streamId);
        this._callbacks.addstream(event);
      };
    }
    await this._setRemoteDescription(signalingMessage);
    await this._createAnswer(signalingMessage);
    this._sendAnswer();
    await this._onIceCandidate();
    clearTimeout(timeoutTimerId);
    return this.stream || new MediaStream();
  }

  async _multiStream(): Promise<void> {
    let timeoutTimerId = 0;
    if (this.options.timeout && 0 < this.options.timeout) {
      timeoutTimerId = setTimeout(() => {
        const error = new Error();
        error.message = "CONNECTION TIMEOUT";
        this._callbacks.timeout();
        this.disconnect();
        Promise.reject(error);
      }, this.options.timeout);
    }

    await this.disconnect();
    const offer = await this._createOffer();
    const signalingMessage = await this._signaling(offer);
    await this._connectPeerConnection(signalingMessage);
    if (this._pc) {
      this._pc.ontrack = (event): void => {
        const stream = event.streams[0];
        if (stream.id === "default") return;
        if (stream.id === this.connectionId) return;
        if (this.e2ee) {
          this.e2ee.setupReceiverTransform(event.receiver);
        }
        this._callbacks.track(event);
        if (-1 < this.remoteConnectionIds.indexOf(stream.id)) return;
        // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
        event.stream = stream;
        this.remoteConnectionIds.push(stream.id);
        this._callbacks.addstream(event);
      };
      // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
      this._pc.onremovestream = (event): void => {
        const index = this.remoteConnectionIds.indexOf(event.stream.id);
        if (-1 < index) {
          delete this.remoteConnectionIds[index];
        }
        this._callbacks.removestream(event);
      };
    }
    await this._setRemoteDescription(signalingMessage);
    await this._createAnswer(signalingMessage);
    this._sendAnswer();
    await this._onIceCandidate();
    clearTimeout(timeoutTimerId);
    return;
  }
}
