/* @flow */
import ConnectionBase from './base';

class ConnectionPublisher extends ConnectionBase {
  connect(stream: ?MediaStream.prototype) {
    this.role = 'upstream';
    return this.disconnect()
      .then(this._signaling.bind(this))
      .then(message => {
        if (!message.config) {
          message.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
        }
        return this._connectPeerConnection(message);
      })
      .then(message => {
        this._pc.addStream(stream);
        this.stream = stream;
        return this._setRemoteDescription(message);
      })
      .then(this._createAnswer.bind(this))
      .then(this._onIceCandidate.bind(this))
      .then(() => {
        return this.stream;
      });
  }
}

module.exports = ConnectionPublisher;
