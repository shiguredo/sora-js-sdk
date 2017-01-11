
/*!
 * sora-js-sdk
 * WebRTC SFU Sora Signaling Library
 * @version 0.5.0
 * @author Shiguredo Inc.
 * @license MIT
 */
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Sora = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Sora = function () {
  function Sora(url) {
    _classCallCheck(this, Sora);

    this.url = url || "";
  }

  _createClass(Sora, [{
    key: "connection",
    value: function connection() {
      return new SoraConnection(this.url);
    }
  }]);

  return Sora;
}();

var SoraConnection = function () {
  function SoraConnection(url) {
    _classCallCheck(this, SoraConnection);

    this._ws = null;
    this._url = url;
    this._callbacks = {
      error: function error() {},
      disconnect: function disconnect() {},
      snapshot: function snapshot() {}
    };
  }

  _createClass(SoraConnection, [{
    key: "_createSignalingMessage",
    value: function _createSignalingMessage(params) {
      var message = {
        type: "connect",
        role: params.role,
        channel_id: params.channelId,
        access_token: params.accessToken
      };
      Object.keys(message).forEach(function (key) {
        if (message[key] === undefined) {
          message[key] = null;
        }
      });
      // create audio params
      var audio = true;
      if ("audio" in params && typeof params["audio"] === "boolean") {
        audio = params.audio;
      }
      if (audio) {
        if ("audioCodecType" in params) {
          audio = {
            codec_type: params.audioCodecType
          };
        }
      }
      message["audio"] = audio;
      // create video params
      var video = true;
      if ("video" in params) {
        video = params.video;
      }

      if (video) {
        (function () {
          var videoPropertyKeys = ["videoCodecType", "videoBitRate", "videoSnapshot"];
          if (Object.keys(params).some(function (key) {
            return 0 <= videoPropertyKeys.indexOf(key);
          })) {
            video = {};
            if ("videoCodecType" in params) {
              video["codec_type"] = params.videoCodecType;
            }
            if ("videoBitRate" in params) {
              video["bit_rate"] = params.videoBitRate;
            }
            if ("videoSnapshot" in params) {
              video["snapshot"] = params.videoSnapshot;
            }
          }
        })();
      }
      message["video"] = video;

      return message;
    }
  }, {
    key: "connect",
    value: function connect(params) {
      var _this = this;

      return new Promise(function (resolve, reject) {
        if (_this._ws === null) {
          _this._ws = new WebSocket(_this._url);
        }
        _this._ws.onopen = function () {
          _this._ws.send(JSON.stringify(_this._createSignalingMessage(params)));
        };
        _this._ws.onclose = function (e) {
          if (/440\d$/.test(e.code)) {
            reject(e);
          } else {
            _this._callbacks.disconnect(e);
          }
        };
        _this._ws.onerror = function (e) {
          _this._callbacks.error(e);
        };
        _this._ws.onmessage = function (event) {
          var data = JSON.parse(event.data);
          if (data.type === "offer") {
            resolve(data);
          } else if (data.type === "snapshot") {
            _this._callbacks.snapshot(data);
          } else if (data.type === "ping") {
            _this._ws.send(JSON.stringify({ type: "pong" }));
          }
        };
      });
    }
  }, {
    key: "answer",
    value: function answer(sdp) {
      this._ws.send(JSON.stringify({ type: "answer", sdp: sdp }));
    }
  }, {
    key: "candidate",
    value: function candidate(_candidate) {
      var message = _candidate.toJSON();
      message.type = "candidate";
      this._ws.send(JSON.stringify(message));
    }
  }, {
    key: "disconnect",
    value: function disconnect() {
      if (this._ws) {
        this._ws.close();
        this._ws = null;
      }
    }
  }, {
    key: "on",
    value: function on(kind, callback) {
      if (this._callbacks.hasOwnProperty(kind)) {
        this._callbacks[kind] = callback;
      }
    }
  }]);

  return SoraConnection;
}();

module.exports = Sora;

},{}]},{},[1])(1)
});