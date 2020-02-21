/* @flow */
import ConnectionBase from './base';

export default class ConnectionSubscriber extends ConnectionBase {
  connect() {
    if (this.options && this.options.multistream) {
      return this._multiStream();
    } else {
      return this._singleStream();
    }
  }
  _singleStream() {
    return new Promise((resolve, reject) => {
      let timeoutTimerId = null;
      if (this.options.timeout && 0 < parseInt(this.options.timeout)) {
        timeoutTimerId = setTimeout(() => {
          const error = new Error();
          error.message = 'CONNECTION TIMEOUT';
          this._callbacks.timeout();
          this.disconnect();
          reject(error);
        }, this.options.timeout);
      }

      this.disconnect()
        .then(this._createOffer)
        .then(this._signaling.bind(this))
        .then(this._connectPeerConnection.bind(this))
        .then(message => {
          if (typeof this._pc.ontrack === 'undefined') {
            this._pc.onaddstream = function(event) {
              this.stream = event.stream;
              this.remoteConnectionIds.push(this.stream.id);
              this._callbacks.addstream(event);
            }.bind(this);
          } else {
            this._pc.ontrack = function(event) {
              this.stream = event.streams[0];
              const streamId = this.stream.id;
              if (streamId === 'default') return;
              if (-1 < this.remoteConnectionIds.indexOf(streamId)) return;
              event.stream = this.stream;
              this.remoteConnectionIds.push(streamId);
              this._callbacks.addstream(event);
            }.bind(this);
          }
          return this._setRemoteDescription(message);
        })
        .then(this._createAnswer.bind(this))
        .then(this._sendAnswer.bind(this))
        .then(this._onIceCandidate.bind(this))
        .then(() => {
          clearTimeout(timeoutTimerId);
          resolve(this.stream);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  _multiStream() {
    return new Promise((resolve, reject) => {
      let timeoutTimerId = null;
      if (this.options.timeout && 0 < parseInt(this.options.timeout)) {
        timeoutTimerId = setTimeout(() => {
          const error = new Error();
          error.message = 'CONNECTION TIMEOUT';
          this._callbacks.timeout();
          this.disconnect();
          reject(error);
        }, this.options.timeout);
      }

      this.disconnect()
        .then(this._createOffer)
        .then(this._signaling.bind(this))
        .then(this._connectPeerConnection.bind(this))
        .then(message => {
          if (typeof this._pc.ontrack === 'undefined') {
            this._pc.onaddstream = event => {
              this.remoteConnectionIds.push(event.id);
              this._callbacks.addstream(event);
            };
          } else {
            this._pc.ontrack = event => {
              const stream = event.streams[0];
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
          return this._setRemoteDescription(message);
        })
        .then(this._createAnswer.bind(this))
        .then(this._sendAnswer.bind(this))
        .then(this._onIceCandidate.bind(this))
        .then(() => {
          clearTimeout(timeoutTimerId);
          resolve();
        })
        .catch(error => {
          reject(error);
        });
    });
  }
}
