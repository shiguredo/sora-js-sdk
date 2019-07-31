/* @flow */
import ConnectionBase from './base';

export default class ConnectionPublisher extends ConnectionBase {
  connect(stream: ?MediaStream.prototype) {
    this.role = 'upstream';
    if (this.options && this.options.multistream) {
      return this._multiStream(stream);
    }
    else {
      return this._singleStream(stream);
    }
  }

  _singleStream(stream: MediaStream.prototype) {
    return this.disconnect()
      .then(this._createOffer)
      .then(this._signaling.bind(this))
      .then(this._connectPeerConnection.bind(this))
      .then(this._setRemoteDescription.bind(this))
      .then(message => {
        if (typeof this._pc.addStream === 'undefined') {
          stream.getTracks().forEach(track => {
            this._pc.addTrack(track, stream);
          });
        }
        else {
          this._pc.addStream(stream);
        }
        this.stream = stream;
        return Promise.resolve(message);
      })
      .then(this._createAnswer.bind(this))
      .then(this._sendAnswer.bind(this))
      .then(this._onIceCandidate.bind(this))
      .then(() => {
        return this.stream;
      });
  }

  _multiStream(stream: MediaStream.prototype) {
    return this.disconnect()
      .then(this._createOffer)
      .then(this._signaling.bind(this))
      .then(this._connectPeerConnection.bind(this))
      .then(message => {
        if (typeof this._pc.addStream === 'undefined') {
          stream.getTracks().forEach(track => {
            this._pc.addTrack(track, stream);
          });
        }
        else {
          this._pc.addStream(stream);
        }
        if (typeof this._pc.ontrack === 'undefined') {
          this._pc.onaddstream = event => {
            if (this.connectionId !== event.stream.id) {
              this.remoteConnectionIds.push(stream.id);
              this._callbacks.addstream(event);
            }
          };
        } else {
          this._pc.ontrack = event => {
            const stream = event.streams[0];
            if (!stream) return;
            if (stream.id === 'default') return;
            if (stream.id === this.connectionId) return;
            if (-1 < this.remoteConnectionIds.indexOf(stream.id)) return;
            event.stream = stream;
            this.remoteConnectionIds.push(stream.id);
            this._callbacks.addstream(event);
          };
        }
        this._pc.onremovestream = event => {
          const index = this.remoteConnectionIds.indexOf(event.stream.id);
          if (-1 < index) {
            delete this.remoteConnectionIds[index];
          }
          this._callbacks.removestream(event);
        };
        this.stream = stream;
        return this._setRemoteDescription(message);
      })
      .then(this._createAnswer.bind(this))
      .then(this._sendAnswer.bind(this))
      .then(this._onIceCandidate.bind(this))
      .then(() => {
        return this.stream;
      });
  }
}
