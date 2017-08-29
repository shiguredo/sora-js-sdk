/*!
 * sora-js-sdk
 * WebRTC SFU Sora Signaling Library
 * @version: 1.5.0
 * @author: Shiguredo Inc.
 * @license: Apache License 2.0
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
})(this, function() {
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

var RTCPeerConnection = window.RTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription;

var ConnectionBase = function () {
  function ConnectionBase(signalingUrl, channelId, metadata, options, debug) {
    _classCallCheck(this, ConnectionBase);

    this.channelId = channelId;
    this.metadata = metadata;
    this.signalingUrl = signalingUrl;
    this.options = options;
    this.debug = debug;
    this.clientId = null;
    this.remoteClientIds = [];
    this.stream = null;
    this.role = null;
    this._ws = null;
    this._pc = null;
    this._callbacks = {
      disconnect: function disconnect() {},
      push: function push() {},
      snapshot: function snapshot() {},
      addstream: function addstream() {},
      removestream: function removestream() {},
      notify: function notify() {}
    };
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
        if (!_this._pc || _this._pc.signalingState === 'closed') return resolve();

        var counter = 5;
        var timer_id = setInterval(function () {
          if (_this._pc.signalingState === 'closed') {
            clearInterval(timer_id);
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
    value: function _signaling() {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        if (_this2._ws === null) {
          _this2._ws = new WebSocket(_this2.signalingUrl);
        }
        _this2._ws.onclose = function (e) {
          reject(e);
        };
        _this2._ws.onopen = function () {
          var signalingMessage = (0, _utils.createSignalingMessage)(_this2.role, _this2.channelId, _this2.metadata, _this2.options);
          _this2._trace('SIGNALING CONNECT MESSAGE', signalingMessage);
          _this2._ws.send(JSON.stringify(signalingMessage));
        };
        _this2._ws.onmessage = function (event) {
          var data = JSON.parse(event.data);
          if (data.type == 'offer') {
            _this2.clientId = data.client_id;
            _this2._ws.onclose = function (e) {
              _this2.disconnect().then(function () {
                _this2._callbacks.disconnect(e);
              });
            };
            _this2._ws.onerror = null;
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
          } else if (data.type == 'snapshot') {
            _this2._callbacks.snapshot(data);
          } else if (data.type == 'notify') {
            _this2._callbacks.notify(data);
          }
        };
      });
    }
  }, {
    key: '_connectPeerConnection',
    value: function _connectPeerConnection(message) {
      var _this3 = this;

      if (RTCPeerConnection.generateCertificate === undefined) {
        this._trace('PEER CONNECTION CONFIG', message.config);
        this._pc = new RTCPeerConnection(message.config);
        this._pc.oniceconnectionstatechange = function (_) {
          _this3._trace('ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE', _this3._pc.iceConnectionState);
        };
        return Promise.resolve(message);
      } else {
        return RTCPeerConnection.generateCertificate({ name: 'ECDSA', namedCurve: 'P-256' }).then(function (certificate) {
          message.config.certificates = [certificate];
          _this3._trace('PEER CONNECTION CONFIG', message.config);
          _this3._pc = new RTCPeerConnection(message.config, {});
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
      var _this4 = this;

      if ((0, _utils.isEdge)()) {
        return new Promise(function (resolve, reject) {
          _this4._pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }), function () {
            resolve();
          }, function (e) {
            reject(e);
          });
        });
      } else {
        return this._pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
      }
    }
  }, {
    key: '_createAnswer',
    value: function _createAnswer() {
      var _this5 = this;

      if ((0, _utils.isEdge)()) {
        return new Promise(function (resolve, reject) {
          _this5._pc.createAnswer(function (sessionDescription) {
            _this5._pc.setLocalDescription(sessionDescription, function () {
              resolve();
            }, function (e) {
              reject(e);
            });
          }, function (e) {
            reject(e);
          });
        });
      } else {
        return this._pc.createAnswer({}).then(function (sessionDescription) {
          return _this5._pc.setLocalDescription(sessionDescription);
        });
      }
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
      var _this6 = this;

      return new Promise(function (resolve, _) {
        _this6._pc.onicecandidate = function (event) {
          _this6._trace('ONICECANDIDATE ICEGATHERINGSTATE', _this6._pc.iceGatheringState);
          if (event.candidate === null) {
            resolve();
          } else {
            var message = event.candidate.toJSON();
            message.type = 'candidate';
            _this6._trace('ONICECANDIDATE CANDIDATE MESSAGE', message);
            _this6._ws.send(JSON.stringify(message));
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

      return this.disconnect().then(this._signaling.bind(this)).then(function (message) {
        return _this2._connectPeerConnection(message);
      }).then(function (message) {
        if (typeof _this2._pc.addStream === 'undefined') {
          stream.getTracks().forEach(function (track) {
            _this2._pc.addTrack(track, stream);
          });
        } else {
          _this2._pc.addStream(stream);
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

      return this.disconnect().then(this._signaling.bind(this)).then(function (message) {
        return _this3._connectPeerConnection(message);
      }).then(function (message) {
        if (typeof _this3._pc.addStream === 'undefined') {
          stream.getTracks().forEach(function (track) {
            _this3._pc.addTrack(track, stream);
          });
        } else {
          _this3._pc.addStream(stream);
        }
        if (typeof _this3._pc.ontrack === 'undefined') {
          _this3._pc.onaddstream = function (event) {
            if (_this3.clientId !== event.stream.id) {
              _this3.remoteClientIds.push(stream.id);
              _this3._callbacks.addstream(event);
            }
          };
        } else {
          _this3._pc.ontrack = function (event) {
            var stream = event.streams[0];
            if (stream.id === 'default') return;
            if (stream.id === _this3.clientId) return;
            if (-1 < _this3.remoteClientIds.indexOf(stream.id)) return;
            event.stream = stream;
            _this3.remoteClientIds.push(stream.id);
            _this3._callbacks.addstream(event);
          };
        }
        _this3._pc.onremovestream = function (event) {
          var index = _this3.remoteClientIds.indexOf(event.stream.id);
          if (-1 < index) {
            delete _this3.remoteClientIds[index];
          };
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
exports.isEdge = isEdge;
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

function userAgent() {
  return window.navigator.userAgent.toLocaleLowerCase();
}

function isPlanB() {
  if (userAgent().indexOf('chrome') !== -1 || userAgent().indexOf('safari') !== -1) {
    return true;
  } else {
    return false;
  }
}

function isEdge() {
  return userAgent().indexOf('edge') !== -1;
}

function createSignalingMessage(role, channelId, metadata, options) {
  var message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    metadata: metadata
  };
  Object.keys(message).forEach(function (key) {
    if (message[key] === undefined) {
      message[key] = null;
    }
  });
  // multistream
  if ('multistream' in options && options.multistream === true) {
    message.multistream = true;
    message.plan_b = isPlanB();
  }
  // create audio params
  var audio = true;
  if ('audio' in options && typeof options.audio === 'boolean') {
    audio = options.audio;
  }
  if (audio) {
    if ('audioCodecType' in options) {
      audio = {
        codec_type: options.audioCodecType
      };
    }
  }
  message['audio'] = audio;
  // create video options
  var video = true;
  if ('video' in options) {
    video = options.video;
  }

  if (video) {
    var videoPropertyKeys = ['videoCodecType', 'videoBitRate', 'videoSnapshot'];
    if (Object.keys(options).some(function (key) {
      return 0 <= videoPropertyKeys.indexOf(key);
    })) {
      video = {};
      if ('videoCodecType' in options) {
        video['codec_type'] = options.videoCodecType;
      }
      if ('videoBitRate' in options) {
        video['bit_rate'] = options.videoBitRate;
      }
      if ('videoSnapshot' in options) {
        video['snapshot'] = options.videoSnapshot;
      }
    }
  }
  message['video'] = video;

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

      return this.disconnect().then(this._signaling.bind(this)).then(function (message) {
        return _this2._connectPeerConnection(message);
      }).then(function (message) {
        if (typeof _this2._pc.ontrack === 'undefined') {
          _this2._pc.onaddstream = function (event) {
            this.stream = event.stream;
          }.bind(_this2);
        } else {
          _this2._pc.ontrack = function (event) {
            this.stream = event.streams[0];
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

      return this.disconnect().then(this._signaling.bind(this)).then(function (message) {
        return _this3._connectPeerConnection(message);
      }).then(function (message) {
        if (typeof _this3._pc.ontrack === 'undefined') {
          _this3._pc.onaddstream = function (event) {
            _this3._callbacks.addstream(event);
          };
        } else {
          _this3._pc.ontrack = function (event) {
            var stream = event.streams[0];
            if (stream.id === 'default') return;
            if (stream.id === _this3.clientId) return;
            if (event.track.kind === 'video') {
              event.stream = stream;
              _this3._callbacks.addstream(event);
            }
          };
        }
        _this3._pc.onremovestream = function (event) {
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