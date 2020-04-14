import ConnectionBase from "./base";

export default class ConnectionPublisher extends ConnectionBase {
  connect(stream: MediaStream): Promise<MediaStream> {
    if (this.options && this.options.multistream) {
      return this._multiStream(stream);
    } else {
      return this._singleStream(stream);
    }
  }

  async _singleStream(stream: MediaStream): Promise<MediaStream> {
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
    await this._setRemoteDescription(signalingMessage);
    stream.getTracks().forEach((track) => {
      if (this._pc) {
        this._pc.addTrack(track, stream);
      }
    });
    this.stream = stream;
    await this._createAnswer(signalingMessage);
    this._sendAnswer();
    await this._onIceCandidate();
    clearTimeout(timeoutTimerId);
    return stream;
  }

  async _multiStream(stream: MediaStream): Promise<MediaStream> {
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
      if (typeof this._pc.ontrack === "undefined") {
        // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
        this._pc.onaddstream = (event): void => {
          if (this.connectionId !== event.stream.id) {
            this.remoteConnectionIds.push(stream.id);
            this._callbacks.addstream(event);
          }
        };
      } else {
        this._pc.ontrack = (event): void => {
          const stream = event.streams[0];
          if (!stream) return;
          if (stream.id === "default") return;
          if (stream.id === this.connectionId) return;
          if (-1 < this.remoteConnectionIds.indexOf(stream.id)) return;
          // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
          event.stream = stream;
          this.remoteConnectionIds.push(stream.id);
          this._callbacks.addstream(event);
        };
      }
    }
    if (this._pc) {
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
    stream.getTracks().forEach((track) => {
      if (this._pc) {
        this._pc.addTrack(track, stream);
      }
    });
    await this._createAnswer(signalingMessage);
    this._sendAnswer();
    await this._onIceCandidate();
    clearTimeout(timeoutTimerId);
    return stream;
  }
}
