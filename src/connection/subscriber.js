/* @flow */
import ConnectionBase from './base';

class ConnectionSubscriber extends ConnectionBase {
  connect() {
    this.role = 'downstream';
    if (this.options && this.options.multistream) {
      return this._multiStream();
    }
    else {
      return this._singleStream();
    }
  }
  _singleStream() {
    return this.disconnect()
      .then(this._createOffer)
      .then(this._signaling.bind(this))
      .then(this._connectPeerConnection.bind(this))
      .then(message => {
        if (typeof this._pc.ontrack === 'undefined') {
          this._pc.onaddstream = function(event) {
            this.stream = event.stream;
            this.remoteClientIds.push(this.stream.id);
            this._callbacks.addstream(event);
          }.bind(this);
        }
        else {
          this._pc.ontrack = function(event) {
            this.stream = event.streams[0];
            const streamId = this.stream.id;
            if (streamId === 'default') return;
            if (-1 < this.remoteClientIds.indexOf(streamId)) return;
            event.stream = this.stream;
            this.remoteClientIds.push(streamId);
            this._callbacks.addstream(event);
          }.bind(this);
        }
        return this._setRemoteDescription(message);
      })
      .then(this._createAnswer.bind(this))
      .then(this._sendAnswer.bind(this))
      .then(this._onIceCandidate.bind(this))
      .then(() => {
        return this.stream;
      });
  }

  _multiStream() {
    return this.disconnect()
      .then(this._createOffer)
      .then(this._signaling.bind(this))
      .then(this._connectPeerConnection.bind(this))
      .then(message => {
        if (typeof this._pc.ontrack === 'undefined') {
          this._pc.onaddstream = event => {
            this.remoteClientIds.push(event.id);
            this._callbacks.addstream(event);
          };
        } else {
          this._pc.ontrack = event => {
            const stream = event.streams[0];
            if (stream.id === 'default') return;
            if (stream.id === this.clientId) return;
            if (-1 < this.remoteClientIds.indexOf(stream.id)) return;
            event.stream = stream;
            this.remoteClientIds.push(stream.id);
            this._callbacks.addstream(event);
          };
        }
        this._pc.onremovestream = event => {
          const index = this.remoteClientIds.indexOf(event.stream.id);
          if (-1 < index) {
            delete this.remoteClientIds[index];
          }
          this._callbacks.removestream(event);
        };
        return this._setRemoteDescription(message);
      })
      .then(this._createAnswer.bind(this))
      .then(this._sendAnswer.bind(this))
      .then(this._onIceCandidate.bind(this));
  }
}

module.exports = ConnectionSubscriber;
