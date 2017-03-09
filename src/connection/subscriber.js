/* @flow */
import ConnectionBase from './base';

class ConnectionSubscriber extends ConnectionBase {
  connect() {
    this.role = 'downstream';
    return this.disconnect()
      .then(this._signaling.bind(this))
      .then(message => {
        if (!message.config) {
          message.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        }
        return this._connectPeerConnection(message);
      })
      .then(message => {
        this._pc.onaddstream = function(event) {
          this.stream = event.stream;
        }.bind(this);
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

module.exports = ConnectionSubscriber;
