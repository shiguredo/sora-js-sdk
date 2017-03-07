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
      notify: function() {}
    };
  }

  on(kind: string, callback: Function) {
    if (kind in this._callbacks) {
      this._callbacks[kind] = callback;
    }
  }

  disconnect() {
    this.clientId = null;
    return new Promise(
      (resolve, _) => {
        try {
          if (this.stream) {
            this.stream.getTracks().forEach((t) => {
              t.stop();
            });
            this.stream = null;
          }
        }
        catch (_) {
          this.stream = null;
        }
        return resolve();
      })
      .then(() => {
        try {
          if (this._ws) {
            this._ws.onclose = () => {
              this._ws = null;
              return Promise.resolve();
            };
            this._ws.close();
          }
        }
        catch (_) {
          this._ws = null;
          return Promise.resolve();
        }
      })
      .then(() => {
        try {
          if (this._pc && this._pc.signalingState !== 'closed') {
            this._pc.close();
          }
          const timer_id = setInterval(() => {
            if (this._pc && this._pc.signalingState === 'closed') {
              clearInterval(timer_id);
              this._pc = null;
              return Promise.resolve();
            }
            else {
              clearInterval(timer_id);
            }
          }, 1000);
        }
        catch (_) {
          this._pc = null;
          return Promise.resolve();
        }
      });
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
        // TODO(yuito): signaling message を作る
        const signalingMessage = {
          type: 'connect',
          role: this.role,
          channel_id: this.channelId,
          access_token: this.metadata
        };
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
          resolve(data);
        } else if (data.type == 'ping') {
          this._ws.send(JSON.stringify({ type: 'pong' }));
        } else if (data.type == 'notify') {
          this._callbacks.notify(data);
        }
      };
    });
  }

  _connectPeerConnection(message: Object) {
    return RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' })
      .then(certificate => {
        message.config.certificates = [certificate];
        this._pc = new RTCPeerConnection(message.config, {});
        this._pc.oniceconnectionstatechange = (_) => {
          // TODO(yuito): iceConnectionState, iceGatheringState あたりをログに出す
        };
        return message;
      });
  }

  _setRemoteDescription(message: Object) {
    return this._pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
  }

  _createAnswer() {
    return this._pc.createAnswer({})
      .then(sessionDescription => {
        return this._pc.setLocalDescription(sessionDescription);
      })
      .then(() => {
        this._ws.send(JSON.stringify({ type: 'answer', sdp: this._pc.localDescription.sdp }));
        return;
      });
  }

  _onIceCandidate() {
    return new Promise((resolve, _) => {
      this._pc.onicecandidate = event => {
        if (event.candidate === null) {
          resolve();
        }
        else {
          const message = event.candidate.toJSON();
          message.type = 'candidate';
          this._ws.send(JSON.stringify(message));
        }
      };
    });
  }
}

module.exports = ConnectionBase;
