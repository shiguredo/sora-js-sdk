
/*!
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 1.14.0-dev
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.Sora = factory());
}(this, function () { 'use strict';

  function trace(clientId, title, value) {
    let prefix = '';

    if (window.performance) {
      prefix = '[' + (window.performance.now() / 1000).toFixed(3) + ']';
    }

    if (clientId) {
      prefix = prefix + '[' + clientId + ']';
    }

    if (isEdge()) {
      console.log(prefix + ' ' + title + '\n', value); // eslint-disable-line
    } else {
      console.info(prefix + ' ' + title + '\n', value); // eslint-disable-line
    }
  }

  function browser() {
    const ua = window.navigator.userAgent.toLocaleLowerCase();

    if (ua.indexOf('edge') !== -1) {
      return 'edge';
    } else if (ua.indexOf('chrome') !== -1 && ua.indexOf('edge') === -1) {
      return 'chrome';
    } else if (ua.indexOf('safari') !== -1 && ua.indexOf('chrome') === -1) {
      return 'safari';
    } else if (ua.indexOf('opera') !== -1) {
      return 'opera';
    } else if (ua.indexOf('firefox') !== -1) {
      return 'firefox';
    }

    return;
  }

  function enabledSimulcast(role, video) {
    /**
      simulcast validator
      VP9 x
       simulcast_pub Chrome o
      simulcast_pub Firefox x
      simulcast_pub Safari 12.1.1 x
      simulcast_pub Safari 12.1 x
      simulcast_pub Safari 12.0 x
      simulcast_sub Chrome o
      simulcast_sub Firefox o
      simulcast_sub Safari 12.1.1 o
      simulcast_sub Safari 12.1 o
      simulcast_sub Safari 12.0 o ※H.264 のみ
    **/
    if (video.codec_type === 'VP9') {
      return false;
    }

    if (role === 'upstream' && browser() === 'firefox') {
      return false;
    }

    if (role === 'upstream' && browser() === 'safari') {
      return false;
    }

    if (role === 'downstream' && browser() === 'safari') {
      const appVersion = window.navigator.appVersion.toLowerCase();
      const versions = /version\/([\d.]+)/.exec(appVersion);

      if (!versions) {
        return false;
      }

      const version = versions.pop(); // version 12.0 以降であれば有効

      if (12.0 < parseFloat(version)) {
        return true;
      }

      if (12.0 == parseFloat(version) && video.codec_type === 'H264') {
        // role が downstream で 'H264' の場合のみ有効
        return true;
      }

      return false;
    }

    return true;
  }

  function isEdge() {
    return browser() === 'edge';
  }
  function isSafari() {
    return browser() === 'safari';
  }
  function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
    if (role !== 'upstream' && role !== 'downstream') {
      throw new Error('Unknown role type');
    }

    if (channelId === null || channelId === undefined) {
      throw new Error('channelId can not be null or undefined');
    }

    const message = {
      type: 'connect',
      sdk_version: '1.14.0-dev',
      sdk_type: 'JavaScript',
      role: role,
      channel_id: channelId,
      sdp: offerSDP,
      user_agent: window.navigator.userAgent,
      audio: true,
      video: true
    };

    if (metadata) {
      message.metadata = metadata;
    }

    if ('multistream' in options && options.multistream === true) {
      // multistream
      message.multistream = true; // spotlight

      if ('spotlight' in options) {
        message.spotlight = options.spotlight;
      }
    } else if ('simulcast' in options || 'simulcastQuality' in options) {
      // simulcast
      if ('simulcast' in options && options.simulcast === true) {
        message.simulcast = true;
      }

      const simalcastQualities = ['low', 'middle', 'high'];

      if ('simulcastQuality' in options && 0 <= simalcastQualities.indexOf(options.simulcastQuality)) {
        message.simulcast = {
          quality: options.simulcastQuality
        };
      }
    } // client_id


    if ('clientId' in options && options.clientId) {
      message.client_id = options.clientId;
    } // parse options


    const audioPropertyKeys = ['audioCodecType', 'audioBitRate'];
    const videoPropertyKeys = ['videoCodecType', 'videoBitRate'];
    const copyOptions = Object.assign({}, options);
    Object.keys(copyOptions).forEach(key => {
      if (key === 'audio' && typeof copyOptions[key] === 'boolean') return;
      if (key === 'video' && typeof copyOptions[key] === 'boolean') return;
      if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
      if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
      delete copyOptions[key];
    });

    if ('audio' in copyOptions) {
      message.audio = copyOptions.audio;
    }

    const hasAudioProperty = Object.keys(copyOptions).some(key => {
      return 0 <= audioPropertyKeys.indexOf(key);
    });

    if (message.audio && hasAudioProperty) {
      message.audio = {};

      if ('audioCodecType' in copyOptions) {
        message.audio['codec_type'] = copyOptions.audioCodecType;
      }

      if ('audioBitRate' in copyOptions) {
        message.audio['bit_rate'] = copyOptions.audioBitRate;
      }
    }

    if ('video' in copyOptions) {
      message.video = copyOptions.video;
    }

    const hasVideoProperty = Object.keys(copyOptions).some(key => {
      return 0 <= videoPropertyKeys.indexOf(key);
    });

    if (message.video && hasVideoProperty) {
      message.video = {};

      if ('videoCodecType' in copyOptions) {
        message.video['codec_type'] = copyOptions.videoCodecType;
      }

      if ('videoBitRate' in copyOptions) {
        message.video['bit_rate'] = copyOptions.videoBitRate;
      }
    }

    if (message.simulcast && !enabledSimulcast(message.role, message.video)) {
      throw new Error('Simulcast can not be used with this browser');
    }

    return message;
  }

  class ConnectionBase {
    constructor(signalingUrl, channelId, metadata, options, debug) {
      this.channelId = channelId;
      this.metadata = metadata;
      this.signalingUrl = signalingUrl;
      this.options = options;
      this.constraints = null;
      this.debug = debug;
      this.clientId = null;
      this.connectionId = null;
      this.remoteConnectionIds = [];
      this.stream = null;
      this.role = null;
      this._ws = null;
      this._pc = null;
      this._callbacks = {
        disconnect: function () {},
        push: function () {},
        addstream: function () {},
        removestream: function () {},
        notify: function () {},
        log: function () {}
      };
      this.authMetadata = null;
    }

    on(kind, callback) {
      if (kind in this._callbacks) {
        this._callbacks[kind] = callback;
      }
    }

    disconnect() {
      this.clientId = null;
      this.connectionId = null;
      this.authMetadata = null;
      this.remoteConnectionIds = [];
      const closeStream = new Promise((resolve, _) => {
        if (!this.stream) return resolve();
        this.stream.getTracks().forEach(t => {
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
        const timer_id = setInterval(() => {
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

    _signaling(offer) {
      this._trace('CREATE OFFER SDP', offer);

      return new Promise((resolve, reject) => {
        const signalingMessage = createSignalingMessage(offer.sdp, this.role, this.channelId, this.metadata, this.options);

        if (this._ws === null) {
          this._ws = new WebSocket(this.signalingUrl);
        }

        this._ws.onclose = e => {
          reject(e);
        };

        this._ws.onopen = () => {
          this._trace('SIGNALING CONNECT MESSAGE', signalingMessage);

          this._ws.send(JSON.stringify(signalingMessage));
        };

        this._ws.onmessage = event => {
          const data = JSON.parse(event.data);

          if (data.type == 'offer') {
            this.clientId = data.client_id;
            this.connectionId = data.connection_id;

            this._ws.onclose = e => {
              this.disconnect().then(() => {
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
            this._ws.send(JSON.stringify({
              type: 'pong'
            }));
          } else if (data.type == 'push') {
            this._callbacks.push(data);
          } else if (data.type == 'notify') {
            this._callbacks.notify(data);
          }
        };
      });
    }

    _createOffer() {
      let config = {
        iceServers: []
      };
      const pc = new window.RTCPeerConnection(config);

      if (isSafari()) {
        pc.addTransceiver('video', {
          direction: 'recvonly'
        });
        pc.addTransceiver('audio', {
          direction: 'recvonly'
        });
        return pc.createOffer().then(offer => {
          pc.close();
          return Promise.resolve(offer);
        });
      }

      return pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }).then(offer => {
        pc.close();
        return Promise.resolve(offer);
      });
    }

    _connectPeerConnection(message) {
      if (!message.config) {
        message.config = {};
      }

      if (window.RTCPeerConnection.generateCertificate === undefined) {
        this._trace('PEER CONNECTION CONFIG', message.config);

        this._pc = new window.RTCPeerConnection(message.config, this.constraints);

        this._pc.oniceconnectionstatechange = _ => {
          this._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this._pc.iceConnectionState);
        };

        return Promise.resolve(message);
      } else {
        return window.RTCPeerConnection.generateCertificate({
          name: 'ECDSA',
          namedCurve: 'P-256'
        }).then(certificate => {
          message.config.certificates = [certificate];

          this._trace('PEER CONNECTION CONFIG', message.config);

          this._pc = new window.RTCPeerConnection(message.config, this.constraints);

          this._pc.oniceconnectionstatechange = _ => {
            this._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', this._pc.iceConnectionState);
          };

          return message;
        });
      }
    }

    _setRemoteDescription(message) {
      return this._pc.setRemoteDescription(new window.RTCSessionDescription({
        type: 'offer',
        sdp: message.sdp
      })).then(() => {
        return Promise.resolve(message);
      });
    }

    _createAnswer(message) {
      // simulcast の場合
      if (this.options.simulcast && this.role === 'upstream' && message.encodings) {
        const transceiver = this._pc.getTransceivers().find(t => {
          if (t.mid && 0 <= t.mid.indexOf('video')) {
            return t;
          }
        });

        if (!transceiver) {
          return Promise.reject('Simulcast Error');
        }

        this._setSenderParameters(transceiver, message.encodings);

        return this._setSenderParameters(transceiver, message.encodings).then(() => {
          return this._pc.createAnswer();
        }).then(sessionDescription => {
          return this._pc.setLocalDescription(sessionDescription);
        });
      }

      return this._pc.createAnswer().then(sessionDescription => {
        return this._pc.setLocalDescription(sessionDescription);
      });
    }

    _setSenderParameters(transceiver, encodings) {
      const originalParameters = transceiver.sender.getParameters();
      originalParameters.encodings = encodings;
      return transceiver.sender.setParameters(originalParameters);
    }

    _sendAnswer() {
      this._trace('ANSWER SDP', this._pc.localDescription.sdp);

      this._ws.send(JSON.stringify({
        type: 'answer',
        sdp: this._pc.localDescription.sdp
      }));

      return;
    }

    _sendUpdateAnswer() {
      this._trace('ANSWER SDP', this._pc.localDescription.sdp);

      this._ws.send(JSON.stringify({
        type: 'update',
        sdp: this._pc.localDescription.sdp
      }));

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
          } else if (this._pc && this._pc.iceConnectionState === 'connected') {
            clearInterval(timerId);
            resolve();
          }
        }, 100);

        this._pc.onicecandidate = event => {
          this._trace('ONICECANDIDATE ICEGATHERINGSTATE', this._pc.iceGatheringState);

          if (event.candidate === null) {
            clearInterval(timerId);
            resolve();
          } else {
            const message = event.candidate.toJSON();
            message.type = 'candidate';

            this._trace('ONICECANDIDATE CANDIDATE MESSAGE', message);

            this._ws.send(JSON.stringify(message));
          }
        };
      });
    }

    _update(message) {
      return this._setRemoteDescription(message).then(this._createAnswer.bind(this)).then(this._sendUpdateAnswer.bind(this));
    }

    _trace(title, message) {
      this._callbacks.log(title, message);

      if (!this.debug) {
        return;
      }

      trace(this.clientId, title, message);
    }

  }

  class ConnectionPublisher extends ConnectionBase {
    connect(stream) {
      this.role = 'upstream';

      if (this.options && this.options.multistream) {
        return this._multiStream(stream);
      } else {
        return this._singleStream(stream);
      }
    }

    _singleStream(stream) {
      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(this._setRemoteDescription.bind(this)).then(message => {
        if (typeof this._pc.addStream === 'undefined') {
          stream.getTracks().forEach(track => {
            this._pc.addTrack(track, stream);
          });
        } else {
          this._pc.addStream(stream);
        }

        this.stream = stream;
        return Promise.resolve(message);
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this)).then(() => {
        return this.stream;
      });
    }

    _multiStream(stream) {
      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(message => {
        if (typeof this._pc.addStream === 'undefined') {
          stream.getTracks().forEach(track => {
            this._pc.addTrack(track, stream);
          });
        } else {
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
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this)).then(() => {
        return this.stream;
      });
    }

  }

  class ConnectionSubscriber extends ConnectionBase {
    connect() {
      this.role = 'downstream';

      if (this.options && this.options.multistream) {
        return this._multiStream();
      } else {
        return this._singleStream();
      }
    }

    _singleStream() {
      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(message => {
        if (typeof this._pc.ontrack === 'undefined') {
          this._pc.onaddstream = function (event) {
            this.stream = event.stream;
            this.remoteConnectionIds.push(this.stream.id);

            this._callbacks.addstream(event);
          }.bind(this);
        } else {
          this._pc.ontrack = function (event) {
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
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this)).then(() => {
        return this.stream;
      });
    }

    _multiStream() {
      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(message => {
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
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this));
    }

  }

  var sora = {
    connection: function (signalingUrl, debug = false) {
      return new SoraConnection(signalingUrl, debug);
    },
    version: function () {
      return '1.14.0-dev';
    }
  };

  class SoraConnection {
    constructor(signalingUrl, debug = false) {
      this.signalingUrl = signalingUrl;
      this.debug = debug;
    }

    publisher(channelId, metadata, options = {
      audio: true,
      video: true
    }) {
      return new ConnectionPublisher(this.signalingUrl, channelId, metadata, options, this.debug);
    }

    subscriber(channelId, metadata, options = {
      audio: true,
      video: true
    }) {
      return new ConnectionSubscriber(this.signalingUrl, channelId, metadata, options, this.debug);
    }

  }

  return sora;

}));
