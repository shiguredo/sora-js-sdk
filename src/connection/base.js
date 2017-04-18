/* @flow */
type ConnectionOptions = {
  audio: boolean,
  audioCodecType?: string,
  video: boolean,
  videoCodecType?: string,
  videoBitRate?: number,
  videoSnapshot?: boolean,
  multistream?: boolean
}

import { createSignalingMessage, isEdge, trace } from '../utils';

const RTCPeerConnection = window.RTCPeerConnection;
const RTCSessionDescription = window.RTCSessionDescription;


class ConnectionBase {
  channelId: string;
  metadata: string;
  signalingUrl: string;
  options: ConnectionOptions;
  debug: boolean;
  clientId: ?string;
  stream: ?MediaStream.prototype;
  role: ?string;
  _ws: WebSocket.prototype;
  _pc: RTCPeerConnection.prototype;
  _callbacks: Object;

  constructor(signalingUrl: string, channelId: string, metadata: string, options: ConnectionOptions, debug: boolean) {
    this.channelId = channelId;
    this.metadata = metadata;
    this.signalingUrl = signalingUrl;
    this.options = options;
    this.debug = debug;
    this.clientId = null;
    this.stream = null;
    this.role = null;
    this._ws = null;
    this._pc = null;
    this._callbacks = {
      disconnect: function() {},
      push: function() {},
      snapshot: function() {},
      addstream: function() {},
      removestream: function() {}
    };
  }

  on(kind: string, callback: Function) {
    if (kind in this._callbacks) {
      this._callbacks[kind] = callback;
    }
  }

  disconnect() {
    this.clientId = null;
    const closeStream = new Promise((resolve, _) => {
      if (!this.stream) return resolve();
      this.stream.getTracks().forEach((t) => {
        t.stop();
      });
      this.stream = null;
      return resolve();
    });
    const closeWebSocket = new Promise((resolve, reject) => {
      if (!this._ws) return resolve();
      this._ws.onclose = () => {};

      let counter = 5;
      const timer_id = setInterval(() => {
        if (this._ws.readyState === 3) {
          this._ws = null;
          clearInterval(timer_id);
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timer_id);
          return reject('WebSocket Closing Error');
        }
      }, 1000);
      this._ws.close();
    });
    const closePeerConnection = new Promise((resolve, reject) => {
      if (!this._pc || this._pc.signalingState === 'closed') return resolve();

      let counter = 5;
      const timer_id = setInterval(() =>{
        if (this._pc.signalingState === 'closed') {
          clearInterval(timer_id);
          this._pc = null;
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timer_id);
          return reject('PeerConnection Closing Error');
        }
      }, 1000);
      this._pc.close();
    });
    return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
  }

  _signaling() {
    return new Promise((resolve, reject) => {
      if (this._ws === null) {
        this._ws = new WebSocket(this.signalingUrl);
      }
      this._ws.onclose = (e) => {
        reject(e);
      };
      this._ws.onerror = (e) => {
        reject(e);
      };
      this._ws.onopen = () => {
        const signalingMessage = createSignalingMessage(this.role, this.channelId, this.metadata, this.options);
        this._trace('SIGNALING CONNECT MESSAGE', signalingMessage);
        this._ws.send(JSON.stringify(signalingMessage));
      };
      this._ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type == 'offer') {
          this.clientId = data.client_id;
          this._ws.onclose = (e) => {
            this.disconnect()
              .then(() => {
                this._callbacks.disconnect(e);
              });
          };
          this._ws.onerror = null;
          this._trace('SIGNALING OFFER MESSAGE', data);
          this._trace('OFFER SDP', data.sdp);
          resolve(data);
        } else if (data.type == 'update') {
          this._trace('UPDATE SDP', data.sdp);
          this._update(data);
        } else if (data.type == 'ping') {
          this._ws.send(JSON.stringify({ type: 'pong' }));
        } else if (data.type == 'push') {
          this._callbacks.push(data);
        } else if (data.type == 'snapshot') {
          this._callbacks.snapshot(data);
        }
      };
    });
  }

  _connectPeerConnection(message: Object) {
    if (RTCPeerConnection.generateCertificate === undefined) {
      this._trace('PEER CONNECTION CONFIG', message.config);
      this._pc = new RTCPeerConnection(message.config);
      this._pc.oniceconnectionstatechange = (_) => {
        this._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE',this._pc.iceConnectionState);
      };
      return Promise.resolve(message);
    }
    else {
      return RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' })
        .then(certificate => {
          message.config.certificates = [certificate];
          this._trace('PEER CONNECTION CONFIG', message.config);
          this._pc = new RTCPeerConnection(message.config, {});
          this._pc.oniceconnectionstatechange = (_) => {
            this._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE',this._pc.iceConnectionState);
          };
          return message;
        });
    }
  }

  _setRemoteDescription(message: Object) {
    if (isEdge()) {
      return new Promise((resolve, reject) => {
        this._pc.setRemoteDescription(
          new RTCSessionDescription({ type: 'offer', sdp: message.sdp }),
          () => { resolve(); },
          e => { reject(e); }
        );
      });
    }
    else {
      return this._pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
    }
  }

  _createAnswer() {
    if (isEdge()) {
      return new Promise((resolve, reject) => {
        this._pc.createAnswer(
          sessionDescription => {
            this._pc.setLocalDescription(
              sessionDescription,
              () => { resolve(); },
              e => { reject(e); }
            );
          },
          e => { reject(e); }
        );
      });
    }
    else {
      return this._pc.createAnswer({})
        .then(sessionDescription => {
          return this._pc.setLocalDescription(sessionDescription);
        });
    }
  }

  _sendAnswer() {
    this._trace('ANSWER SDP', this._pc.localDescription.sdp);
    this._ws.send(JSON.stringify({ type: 'answer', sdp: this._pc.localDescription.sdp }));
    return;
  }

  _sendUpdateAnswer() {
    this._trace('ANSWER SDP', this._pc.localDescription.sdp);
    this._ws.send(JSON.stringify({ type: 'update', sdp: this._pc.localDescription.sdp }));
    return;
  }

  _onIceCandidate() {
    return new Promise((resolve, _) => {
      this._pc.onicecandidate = event => {
        this._trace('ONICECANDIDATE ICEGATHERINGSTATE', this._pc.iceGatheringState);
        if (event.candidate === null) {
          resolve();
        }
        else {
          const message = event.candidate.toJSON();
          message.type = 'candidate';
          this._trace('ONICECANDIDATE CANDIDATE MESSAGE', message);
          this._ws.send(JSON.stringify(message));
        }
      };
    });
  }

  _update(message: Object) {
    return this._setRemoteDescription(message)
      .then(this._createAnswer.bind(this))
      .then(this._sendUpdateAnswer.bind(this));
  }

  _trace(title: string, message: Object | string) {
    if (!this.debug) { return; }
    trace(this.clientId, title, message);
  }
}

module.exports = ConnectionBase;
