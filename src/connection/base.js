/* @flow */
export type ConnectionOptions = {
  audio?: boolean,
  audioCodecType?: string,
  audioBitRate?: number,
  video?: boolean,
  videoCodecType?: string,
  videoBitRate?: number,
  multistream?: boolean,
  spotlight?: number,
  simulcast?: boolean,
  simulcastQuality?: 'low' | 'middle' | 'high'
}

import { createSignalingMessage, trace, isSafari, isUnifiedChrome, replaceAnswerSdp } from '../utils';

class ConnectionBase {
  channelId: string;
  metadata: string;
  signalingUrl: string;
  options: ConnectionOptions;
  constraints: ?Object;
  debug: boolean;
  clientId: ?string;
  remoteClientIds: string[];
  stream: ?MediaStream.prototype;
  role: ?string;
  authMetadata: ?string;
  _ws: WebSocket.prototype;
  _pc: window.RTCPeerConnection.prototype;
  _callbacks: Object;

  constructor(signalingUrl: string, channelId: string, metadata: string, options: ConnectionOptions, debug: boolean) {
    this.channelId = channelId;
    this.metadata = metadata;
    this.signalingUrl = signalingUrl;
    this.options = options;
    this.constraints = null;
    this.debug = debug;
    this.clientId = null;
    this.remoteClientIds = [];
    this.stream = null;
    this.role = null;
    this._ws = null;
    this._pc = null;
    this._callbacks = {
      disconnect: function() {},
      push: function() {},
      addstream: function() {},
      removestream: function() {},
      notify: function() {},
      log: function() {}
    };
    this.authMetadata = null;
  }

  on(kind: string, callback: Function) {
    if (kind in this._callbacks) {
      this._callbacks[kind] = callback;
    }
  }

  disconnect() {
    this.clientId = null;
    this.authMetadata = null;
    this.remoteClientIds = [];
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
        if (!this._ws) {
          clearInterval(timer_id);
          return reject('WebSocket Closing Error');
        }
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
      // Safari は signalingState が常に stable のため個別に処理する
      if (isSafari() && this._pc) {
        this._pc.oniceconnectionstatechange = null;
        this._pc.close();
        this._pc = null;
        return resolve();
      }
      if (!this._pc || this._pc.signalingState === 'closed') return resolve();

      let counter = 5;
      const timer_id = setInterval(() =>{
        if (!this._pc) {
          clearInterval(timer_id);
          return reject('PeerConnection Closing Error');
        }
        if (this._pc.signalingState === 'closed') {
          clearInterval(timer_id);
          this._pc.oniceconnectionstatechange = null;
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

  _signaling(offer: {type: 'offer', sdp: string}) {
    this._trace('CREATE OFFER SDP', offer);
    return new Promise((resolve, reject) => {
      const signalingMessage = createSignalingMessage(
        offer.sdp, this.role, this.channelId, this.metadata, this.options);
      if (this._ws === null) {
        this._ws = new WebSocket(this.signalingUrl);
      }
      this._ws.onclose = (e) => {
        reject(e);
      };
      this._ws.onopen = () => {
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
          if ('metadata' in data) {
            this.authMetadata = data.metadata;
          }
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
        } else if (data.type == 'notify') {
          this._callbacks.notify(data);
        }
      };
    });
  }

  _createOffer() {
    let config = { iceServers: [] };
    if (isUnifiedChrome()) {
      config = Object.assign({}, config, { sdpSemantics: 'unified-plan' });
    }
    const pc = new window.RTCPeerConnection(config);
    if (isSafari()) {
      pc.addTransceiver('video').setDirection('recvonly');
      pc.addTransceiver('audio').setDirection('recvonly');
      return pc.createOffer()
        .then(offer => {
          pc.close();
          return Promise.resolve(offer);
        });
    }
    return pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
      .then(offer => {
        pc.close();
        return Promise.resolve(offer);
      });
  }

  _connectPeerConnection(message: Object) {
    if (!message.config) {
      message.config = {};
    }
    if (window.RTCPeerConnection.generateCertificate === undefined) {
      if (isUnifiedChrome()) {
        message.config = Object.assign(message.config, { sdpSemantics: 'unified-plan' });
      }
      this._trace('PEER CONNECTION CONFIG', message.config);
      this._pc = new window.RTCPeerConnection(message.config, this.constraints);
      this._pc.oniceconnectionstatechange = (_) => {
        this._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE',this._pc.iceConnectionState);
      };
      return Promise.resolve(message);
    }
    else {
      return window.RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' })
        .then(certificate => {
          message.config.certificates = [certificate];
          if (isUnifiedChrome()) {
            message.config = Object.assign(message.config, { sdpSemantics: 'unified-plan' });
          }
          this._trace('PEER CONNECTION CONFIG', message.config);
          this._pc = new window.RTCPeerConnection(message.config, this.constraints);
          this._pc.oniceconnectionstatechange = (_) => {
            this._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this._pc.iceConnectionState);
          };
          return message;
        });
    }
  }

  _setRemoteDescription(message: Object) {
    return this._pc.setRemoteDescription(new window.RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
  }

  _createAnswer() {
    return this._pc.createAnswer()
      .then(sessionDescription => {
        if (this.options.simulcast) {
          sessionDescription.sdp = replaceAnswerSdp(sessionDescription.sdp);
        }
        return this._pc.setLocalDescription(sessionDescription);
      });
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
    return new Promise((resolve, reject) => {
      const timerId = setInterval(() => {
        if (this._pc === null) {
          clearInterval(timerId);
          const error = new Error();
          error.message = 'ICECANDIDATE TIMEOUT';
          reject(error);
        }
        else if (this._pc && this._pc.iceConnectionState === 'connected') {
          clearInterval(timerId);
          resolve();
        }
      }, 100);
      this._pc.onicecandidate = event => {
        this._trace('ONICECANDIDATE ICEGATHERINGSTATE', this._pc.iceGatheringState);
        if (event.candidate === null) {
          clearInterval(timerId);
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
    this._callbacks.log(title, message);
    if (!this.debug) { return; }
    trace(this.clientId, title, message);
  }
}

module.exports = ConnectionBase;
