/*!
 * sora-js-sdk
 * WebRTC SFU Sora Javascript SDK
 * @version: 1.12.0-dev
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 */
(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define("Sora", [], factory);
	else if(typeof exports === 'object')
		exports["Sora"] = factory();
	else
		root["Sora"] = factory();
})(typeof self !== 'undefined' ? self : this, function() {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 1);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _utils = __webpack_require__(3);

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ConnectionBase = function () {
  function ConnectionBase(signalingUrl, channelId, metadata, options, debug) {
    _classCallCheck(this, ConnectionBase);

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
      disconnect: function disconnect() {},
      push: function push() {},
      addstream: function addstream() {},
      removestream: function removestream() {},
      notify: function notify() {},
      log: function log() {}
    };
    this.authMetadata = null;
  }

  _createClass(ConnectionBase, [{
    key: 'on',
    value: function on(kind, callback) {
      if (kind in this._callbacks) {
        this._callbacks[kind] = callback;
      }
    }
  }, {
    key: 'disconnect',
    value: function disconnect() {
      var _this = this;

      this.clientId = null;
      this.connectionId = null;
      this.authMetadata = null;
      this.remoteConnectionIds = [];
      var closeStream = new Promise(function (resolve, _) {
        if (!_this.stream) return resolve();
        _this.stream.getTracks().forEach(function (t) {
          t.stop();
        });
        _this.stream = null;
        return resolve();
      });
      var closeWebSocket = new Promise(function (resolve, reject) {
        if (!_this._ws) return resolve();
        _this._ws.onclose = function () {};

        var counter = 5;
        var timer_id = setInterval(function () {
          if (!_this._ws) {
            clearInterval(timer_id);
            return reject('WebSocket Closing Error');
          }
          if (_this._ws.readyState === 3) {
            _this._ws = null;
            clearInterval(timer_id);
            return resolve();
          }
          --counter;
          if (counter < 0) {
            clearInterval(timer_id);
            return reject('WebSocket Closing Error');
          }
        }, 1000);
        _this._ws.close();
      });
      var closePeerConnection = new Promise(function (resolve, reject) {
        // Safari は signalingState が常に stable のため個別に処理する
        if ((0, _utils.isSafari)() && _this._pc) {
          _this._pc.oniceconnectionstatechange = null;
          _this._pc.close();
          _this._pc = null;
          return resolve();
        }
        if (!_this._pc || _this._pc.signalingState === 'closed') return resolve();

        var counter = 5;
        var timer_id = setInterval(function () {
          if (!_this._pc) {
            clearInterval(timer_id);
            return reject('PeerConnection Closing Error');
          }
          if (_this._pc.signalingState === 'closed') {
            clearInterval(timer_id);
            _this._pc.oniceconnectionstatechange = null;
            _this._pc = null;
            return resolve();
          }
          --counter;
          if (counter < 0) {
            clearInterval(timer_id);
            return reject('PeerConnection Closing Error');
          }
        }, 1000);
        _this._pc.close();
      });
      return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
    }
  }, {
    key: '_signaling',
    value: function _signaling(offer) {
      var _this2 = this;

      this._trace('CREATE OFFER SDP', offer);
      return new Promise(function (resolve, reject) {
        var signalingMessage = (0, _utils.createSignalingMessage)(offer.sdp, _this2.role, _this2.channelId, _this2.metadata, _this2.options);
        if (_this2._ws === null) {
          _this2._ws = new WebSocket(_this2.signalingUrl);
        }
        _this2._ws.onclose = function (e) {
          reject(e);
        };
        _this2._ws.onopen = function () {
          _this2._trace('SIGNALING CONNECT MESSAGE', signalingMessage);
          _this2._ws.send(JSON.stringify(signalingMessage));
        };
        _this2._ws.onmessage = function (event) {
          var data = JSON.parse(event.data);
          if (data.type == 'offer') {
            _this2.clientId = data.client_id;
            _this2.connectionId = data.connection_id;
            _this2._ws.onclose = function (e) {
              _this2.disconnect().then(function () {
                _this2._callbacks.disconnect(e);
              });
            };
            _this2._ws.onerror = null;
            if ('metadata' in data) {
              _this2.authMetadata = data.metadata;
            }
            _this2._trace('SIGNALING OFFER MESSAGE', data);
            _this2._trace('OFFER SDP', data.sdp);
            resolve(data);
          } else if (data.type == 'update') {
            _this2._trace('UPDATE SDP', data.sdp);
            _this2._update(data);
          } else if (data.type == 'ping') {
            _this2._ws.send(JSON.stringify({ type: 'pong' }));
          } else if (data.type == 'push') {
            _this2._callbacks.push(data);
          } else if (data.type == 'notify') {
            _this2._callbacks.notify(data);
          }
        };
      });
    }
  }, {
    key: '_createOffer',
    value: function _createOffer() {
      var config = { iceServers: [] };
      if ((0, _utils.isUnifiedChrome)()) {
        config = Object.assign({}, config, { sdpSemantics: 'unified-plan' });
      }
      var pc = new window.RTCPeerConnection(config);
      if ((0, _utils.isSafari)()) {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        return pc.createOffer().then(function (offer) {
          pc.close();
          return Promise.resolve(offer);
        });
      }
      return pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }).then(function (offer) {
        pc.close();
        return Promise.resolve(offer);
      });
    }
  }, {
    key: '_connectPeerConnection',
    value: function _connectPeerConnection(message) {
      var _this3 = this;

      if (!message.config) {
        message.config = {};
      }
      if (window.RTCPeerConnection.generateCertificate === undefined) {
        if ((0, _utils.isUnifiedChrome)()) {
          message.config = Object.assign(message.config, { sdpSemantics: 'unified-plan' });
        }
        this._trace('PEER CONNECTION CONFIG', message.config);
        this._pc = new window.RTCPeerConnection(message.config, this.constraints);
        this._pc.oniceconnectionstatechange = function (_) {
          _this3._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', _this3._pc.iceConnectionState);
        };
        return Promise.resolve(message);
      } else {
        return window.RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' }).then(function (certificate) {
          message.config.certificates = [certificate];
          if ((0, _utils.isUnifiedChrome)()) {
            message.config = Object.assign(message.config, { sdpSemantics: 'unified-plan' });
          }
          _this3._trace('PEER CONNECTION CONFIG', message.config);
          _this3._pc = new window.RTCPeerConnection(message.config, _this3.constraints);
          _this3._pc.oniceconnectionstatechange = function (_) {
            _this3._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', _this3._pc.iceConnectionState);
          };
          return message;
        });
      }
    }
  }, {
    key: '_setRemoteDescription',
    value: function _setRemoteDescription(message) {
      return this._pc.setRemoteDescription(new window.RTCSessionDescription({ type: 'offer', sdp: message.sdp })).then(function () {
        return Promise.resolve(message);
      });
    }
  }, {
    key: '_createAnswer',
    value: function _createAnswer(message) {
      var _this4 = this;

      // simulcast rid の場合
      if (this.options.simulcastRid && this.stream) {
        var localVideoTrack = this.stream.getVideoTracks()[0];
        var transceiver = this._pc.getTransceivers().find(function (t) {
          if (0 <= t.mid.indexOf('video')) {
            return t;
          }
        });
        if (!transceiver) {
          return Promise.reject('Simulcast Rid Error');
        }
        transceiver.direction = 'sendonly';
        return transceiver.sender.replaceTrack(localVideoTrack).then(function () {
          return _this4._setSenderParameters(transceiver, message.encodings);
        }).then(function () {
          return _this4._pc.createAnswer();
        }).then(function (sessionDescription) {
          return _this4._pc.setLocalDescription(sessionDescription);
        });
      }
      return this._pc.createAnswer().then(function (sessionDescription) {
        if (_this4.options.simulcast) {
          sessionDescription.sdp = (0, _utils.replaceAnswerSdp)(sessionDescription.sdp);
        }
        return _this4._pc.setLocalDescription(sessionDescription);
      });
    }
  }, {
    key: '_setSenderParameters',
    value: function _setSenderParameters(transceiver, encodings) {
      var originalParameters = transceiver.sender.getParameters();
      if (encodings) {
        originalParameters.encodings = encodings;
      }
      return transceiver.sender.setParameters(originalParameters);
    }
  }, {
    key: '_sendAnswer',
    value: function _sendAnswer() {
      this._trace('ANSWER SDP', this._pc.localDescription.sdp);
      this._ws.send(JSON.stringify({ type: 'answer', sdp: this._pc.localDescription.sdp }));
      return;
    }
  }, {
    key: '_sendUpdateAnswer',
    value: function _sendUpdateAnswer() {
      this._trace('ANSWER SDP', this._pc.localDescription.sdp);
      this._ws.send(JSON.stringify({ type: 'update', sdp: this._pc.localDescription.sdp }));
      return;
    }
  }, {
    key: '_onIceCandidate',
    value: function _onIceCandidate() {
      var _this5 = this;

      return new Promise(function (resolve, reject) {
        var timerId = setInterval(function () {
          if (_this5._pc === null) {
            clearInterval(timerId);
            var error = new Error();
            error.message = 'ICECANDIDATE TIMEOUT';
            reject(error);
          } else if (_this5._pc && _this5._pc.iceConnectionState === 'connected') {
            clearInterval(timerId);
            resolve();
          }
        }, 100);
        _this5._pc.onicecandidate = function (event) {
          _this5._trace('ONICECANDIDATE ICEGATHERINGSTATE', _this5._pc.iceGatheringState);
          if (event.candidate === null) {
            clearInterval(timerId);
            resolve();
          } else {
            var message = event.candidate.toJSON();
            message.type = 'candidate';
            _this5._trace('ONICECANDIDATE CANDIDATE MESSAGE', message);
            _this5._ws.send(JSON.stringify(message));
          }
        };
      });
    }
  }, {
    key: '_update',
    value: function _update(message) {
      return this._setRemoteDescription(message).then(this._createAnswer.bind(this)).then(this._sendUpdateAnswer.bind(this));
    }
  }, {
    key: '_trace',
    value: function _trace(title, message) {
      this._callbacks.log(title, message);
      if (!this.debug) {
        return;
      }
      (0, _utils.trace)(this.clientId, title, message);
    }
  }]);

  return ConnectionBase;
}();

module.exports = ConnectionBase;

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _publisher = __webpack_require__(2);

var _publisher2 = _interopRequireDefault(_publisher);

var _subscriber = __webpack_require__(4);

var _subscriber2 = _interopRequireDefault(_subscriber);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Sora = {
  connection: function connection(signalingUrl) {
    var debug = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    return new SoraConnection(signalingUrl, debug);
  },
  version: function version() {
    return "1.12.0-dev";
  }
};

var SoraConnection = function () {
  function SoraConnection(signalingUrl) {
    var debug = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

    _classCallCheck(this, SoraConnection);

    this.signalingUrl = signalingUrl;
    this.debug = debug;
  }

  _createClass(SoraConnection, [{
    key: 'publisher',
    value: function publisher(channelId, metadata) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { audio: true, video: true };

      return new _publisher2.default(this.signalingUrl, channelId, metadata, options, this.debug);
    }
  }, {
    key: 'subscriber',
    value: function subscriber(channelId, metadata) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : { audio: true, video: true };

      return new _subscriber2.default(this.signalingUrl, channelId, metadata, options, this.debug);
    }
  }]);

  return SoraConnection;
}();

module.exports = Sora;

/***/ }),
/* 2 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _base = __webpack_require__(0);

var _base2 = _interopRequireDefault(_base);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var ConnectionPublisher = function (_ConnectionBase) {
  _inherits(ConnectionPublisher, _ConnectionBase);

  function ConnectionPublisher() {
    _classCallCheck(this, ConnectionPublisher);

    return _possibleConstructorReturn(this, (ConnectionPublisher.__proto__ || Object.getPrototypeOf(ConnectionPublisher)).apply(this, arguments));
  }

  _createClass(ConnectionPublisher, [{
    key: 'connect',
    value: function connect(stream) {
      this.role = 'upstream';
      if (this.options && this.options.multistream) {
        return this._multiStream(stream);
      } else {
        return this._singleStream(stream);
      }
    }
  }, {
    key: '_singleStream',
    value: function _singleStream(stream) {
      var _this2 = this;

      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(function (message) {
        // simulcast rid の場合には addStream/addTrack しない
        if (!(_this2.options.simulcast && _this2.options.simulcastRid)) {
          if (typeof _this2._pc.addStream === 'undefined') {
            stream.getTracks().forEach(function (track) {
              _this2._pc.addTrack(track, stream);
            });
          } else {
            _this2._pc.addStream(stream);
          }
        }
        _this2.stream = stream;
        return _this2._setRemoteDescription(message);
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this)).then(function () {
        return _this2.stream;
      });
    }
  }, {
    key: '_multiStream',
    value: function _multiStream(stream) {
      var _this3 = this;

      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(function (message) {
        if (typeof _this3._pc.addStream === 'undefined') {
          stream.getTracks().forEach(function (track) {
            _this3._pc.addTrack(track, stream);
          });
        } else {
          _this3._pc.addStream(stream);
        }
        if (typeof _this3._pc.ontrack === 'undefined') {
          _this3._pc.onaddstream = function (event) {
            if (_this3.connectionId !== event.stream.id) {
              _this3.remoteConnectionIds.push(stream.id);
              _this3._callbacks.addstream(event);
            }
          };
        } else {
          _this3._pc.ontrack = function (event) {
            var stream = event.streams[0];
            if (!stream) return;
            if (stream.id === 'default') return;
            if (stream.id === _this3.connectionId) return;
            if (-1 < _this3.remoteConnectionIds.indexOf(stream.id)) return;
            event.stream = stream;
            _this3.remoteConnectionIds.push(stream.id);
            _this3._callbacks.addstream(event);
          };
        }
        _this3._pc.onremovestream = function (event) {
          var index = _this3.remoteConnectionIds.indexOf(event.stream.id);
          if (-1 < index) {
            delete _this3.remoteConnectionIds[index];
          }
          _this3._callbacks.removestream(event);
        };
        _this3.stream = stream;
        return _this3._setRemoteDescription(message);
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this)).then(function () {
        return _this3.stream;
      });
    }
  }]);

  return ConnectionPublisher;
}(_base2.default);

module.exports = ConnectionPublisher;

/***/ }),
/* 3 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.trace = trace;
exports.isUnifiedChrome = isUnifiedChrome;
exports.isUnifiedSafari = isUnifiedSafari;
exports.isEdge = isEdge;
exports.isSafari = isSafari;
exports.isChrome = isChrome;
exports.replaceAnswerSdp = replaceAnswerSdp;
exports.createSignalingMessage = createSignalingMessage;
function trace(clientId, title, value) {
  var prefix = '';
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
  var ua = window.navigator.userAgent.toLocaleLowerCase();
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

function isPlanB() {
  return browser() === 'chrome' || browser() === 'safari';
}

function enabledSimulcast(role, video) {
  /**
    simulcast validator
    VP9 x
     simulcast_pub Chrome o
    simulcast_pub Firefox x
    simulcast_pub Safari 12.1 o
    simulcast_pub Safari 12.0 x
    simulcast_sub Chrome o
    simulcast_sub Firefox o
    simulcast_sub Safari 12.1 o
    simulcast_sub Safari 12.0 o ※H.264 のみ
  **/
  if (video.codec_type === 'VP9') {
    return false;
  }
  if (role === 'upstream' && browser() === 'firefox') {
    return false;
  }
  if (browser() === 'safari') {
    var appVersion = window.navigator.appVersion.toLowerCase();
    var version = /version\/([\d.]+)/.exec(appVersion).pop();
    // version 12.0 以降であれば有効
    if (12.0 < parseFloat(version)) {
      return true;
    }
    if (12.0 == parseFloat(version) && role === 'downstream' && video.codec_type === 'H264') {
      // role が downstream で 'H264' の場合のみ有効
      return true;
    }
    return false;
  }
  return true;
}

function enabledSimulcastRid(role, video) {
  /**
    simulcast_rid validator
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
    var appVersion = window.navigator.appVersion.toLowerCase();
    var version = /version\/([\d.]+)/.exec(appVersion).pop();
    // version 12.0 以降であれば有効
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

function isUnifiedChrome() {
  if (browser() !== 'chrome') {
    return false;
  }
  var ua = window.navigator.userAgent.toLocaleLowerCase();
  var splitedUserAgent = /chrome\/([\d.]+)/.exec(ua);
  if (!splitedUserAgent || splitedUserAgent.length < 2) {
    return false;
  }
  return 71 <= parseInt(splitedUserAgent[1]);
}

function isUnifiedSafari(sdp) {
  if (browser() !== 'safari') {
    return false;
  }
  return sdp.includes('a=group:BUNDLE 0 1');
}

function isEdge() {
  return browser() === 'edge';
}

function isSafari() {
  return browser() === 'safari';
}

function isChrome() {
  return browser() === 'chrome';
}

function replaceAnswerSdp(sdp) {
  var ssrcPattern = new RegExp(/m=video[\s\S]*?(a=ssrc:(\d+)\scname:.+\r\n(a=ssrc:\2\smsid:.+\r\na=ssrc:\2\smslabel:.+\r\na=ssrc:\2\slabel:.+\r\n)?)/); // eslint-disable-line
  var found = sdp.match(ssrcPattern);
  if (!found) {
    return sdp;
  }

  var ssrcAttributes = found[1];
  ssrcPattern = found[1];
  var ssrcId = parseInt(found[2]);
  var ssrcIdPattern = new RegExp(ssrcId.toString(), 'g');
  var ssrcGroup = ['a=ssrc-group:SIM'];
  var ssrcAttributeList = [];
  for (var i = 0; i < 3; i += 1) {
    ssrcGroup.push((ssrcId + i).toString());
    ssrcAttributeList.push(ssrcAttributes.replace(ssrcIdPattern, (ssrcId + i).toString()));
  }
  return sdp.replace(ssrcPattern, [ssrcGroup.join(' '), '\r\n', ssrcAttributeList.join('')].join(''));
}

function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
  var message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    metadata: metadata,
    sdp: offerSDP,
    userAgent: window.navigator.userAgent,
    audio: true,
    video: true
  };
  Object.keys(message).forEach(function (key) {
    if (message[key] === undefined) {
      message[key] = null;
    }
  });

  if ('multistream' in options && options.multistream === true) {
    // multistream
    message.multistream = true;
    if (!isUnifiedChrome() && !isUnifiedSafari(offerSDP) && isPlanB()) {
      message.plan_b = true;
    }
    // spotlight
    if ('spotlight' in options) {
      message.spotlight = options.spotlight;
    }
  } else if ('simulcast' in options || 'simulcastQuality' in options) {
    // simulcast
    if ('simulcast' in options && options.simulcast === true) {
      message.simulcast = true;
      // simulcast rid
      if ('simulcastRid' in options && options.simulcastRid === true) {
        message.simulcast_rid = true;
      }
    }
    var simalcastQualities = ['low', 'middle', 'high'];
    if ('simulcastQuality' in options && 0 <= simalcastQualities.indexOf(options.simulcastQuality)) {
      message.simulcast = {
        quality: options.simulcastQuality
      };
    }
  }

  // client_id
  if ('clientId' in options && options.clientId) {
    message.client_id = options.clientId;
  }

  // parse options
  var audioPropertyKeys = ['audioCodecType', 'audioBitRate'];
  var videoPropertyKeys = ['videoCodecType', 'videoBitRate'];
  var copyOptions = Object.assign({}, options);
  Object.keys(copyOptions).forEach(function (key) {
    if (key === 'audio' && typeof copyOptions[key] === 'boolean') return;
    if (key === 'video' && typeof copyOptions[key] === 'boolean') return;
    if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    delete copyOptions[key];
  });

  if ('audio' in copyOptions) {
    message.audio = copyOptions.audio;
  }
  var hasAudioProperty = Object.keys(copyOptions).some(function (key) {
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
  var hasVideoProperty = Object.keys(copyOptions).some(function (key) {
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
  if (message.simulcast && message.simulcastRid && !enabledSimulcast(message.role, message.video)) {
    throw new Error('Simulcast Rid can not be used with this browser');
  }
  return message;
}

/***/ }),
/* 4 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _base = __webpack_require__(0);

var _base2 = _interopRequireDefault(_base);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var ConnectionSubscriber = function (_ConnectionBase) {
  _inherits(ConnectionSubscriber, _ConnectionBase);

  function ConnectionSubscriber() {
    _classCallCheck(this, ConnectionSubscriber);

    return _possibleConstructorReturn(this, (ConnectionSubscriber.__proto__ || Object.getPrototypeOf(ConnectionSubscriber)).apply(this, arguments));
  }

  _createClass(ConnectionSubscriber, [{
    key: 'connect',
    value: function connect() {
      this.role = 'downstream';
      if (this.options && this.options.multistream) {
        return this._multiStream();
      } else {
        return this._singleStream();
      }
    }
  }, {
    key: '_singleStream',
    value: function _singleStream() {
      var _this2 = this;

      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(function (message) {
        if (typeof _this2._pc.ontrack === 'undefined') {
          _this2._pc.onaddstream = function (event) {
            this.stream = event.stream;
            this.remoteConnectionIds.push(this.stream.id);
            this._callbacks.addstream(event);
          }.bind(_this2);
        } else {
          _this2._pc.ontrack = function (event) {
            this.stream = event.streams[0];
            var streamId = this.stream.id;
            if (streamId === 'default') return;
            if (-1 < this.remoteConnectionIds.indexOf(streamId)) return;
            event.stream = this.stream;
            this.remoteConnectionIds.push(streamId);
            this._callbacks.addstream(event);
          }.bind(_this2);
        }
        return _this2._setRemoteDescription(message);
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this)).then(function () {
        return _this2.stream;
      });
    }
  }, {
    key: '_multiStream',
    value: function _multiStream() {
      var _this3 = this;

      return this.disconnect().then(this._createOffer).then(this._signaling.bind(this)).then(this._connectPeerConnection.bind(this)).then(function (message) {
        if (typeof _this3._pc.ontrack === 'undefined') {
          _this3._pc.onaddstream = function (event) {
            _this3.remoteConnectionIds.push(event.id);
            _this3._callbacks.addstream(event);
          };
        } else {
          _this3._pc.ontrack = function (event) {
            var stream = event.streams[0];
            if (stream.id === 'default') return;
            if (stream.id === _this3.connectionId) return;
            if (-1 < _this3.remoteConnectionIds.indexOf(stream.id)) return;
            event.stream = stream;
            _this3.remoteConnectionIds.push(stream.id);
            _this3._callbacks.addstream(event);
          };
        }
        _this3._pc.onremovestream = function (event) {
          var index = _this3.remoteConnectionIds.indexOf(event.stream.id);
          if (-1 < index) {
            delete _this3.remoteConnectionIds[index];
          }
          _this3._callbacks.removestream(event);
        };
        return _this3._setRemoteDescription(message);
      }).then(this._createAnswer.bind(this)).then(this._sendAnswer.bind(this)).then(this._onIceCandidate.bind(this));
    }
  }]);

  return ConnectionSubscriber;
}(_base2.default);

module.exports = ConnectionSubscriber;

/***/ })
/******/ ]);
});