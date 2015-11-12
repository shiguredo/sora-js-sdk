(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Sora = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Sora = (function () {
  function Sora(config) {
    _classCallCheck(this, Sora);

    this.config = config || {};
  }

  _createClass(Sora, [{
    key: "connection",
    value: function connection(onSuccess) {
      var onError = arguments.length <= 1 || arguments[1] === undefined ? function () {} : arguments[1];
      var onClose = arguments.length <= 2 || arguments[2] === undefined ? function () {} : arguments[2];

      var ws = new WebSocket("ws://" + this.config.host + ":" + this.config.port + "/" + this.config.path);
      ws.onopen = function () {
        onSuccess();
      };
      ws.onerror = function (e) {
        onError(e);
      };
      ws.onclose = function (e) {
        onClose(e);
      };
      return new SoraConnection(ws, onClose);
    }
  }]);

  return Sora;
})();

var SoraConnection = (function () {
  function SoraConnection(ws, onClose) {
    _classCallCheck(this, SoraConnection);

    this._ws = ws;
    this._onClose = onClose;
  }

  _createClass(SoraConnection, [{
    key: "connect",
    value: function connect(params, onOffer, onError) {
      var _this = this;

      var self = this;
      this._ws.onclose = function (e) {
        if (/^440[0-9]$/.test(e.code)) {
          onError(e.reason);
        }
        _this._onClose(e);
        self._ws = null;
      };
      this._ws.onmessage = function (event) {
        var data = JSON.parse(event.data);
        if (data.type == "offer") {
          onOffer(data);
        } else if (data.type == "ping") {
          self._ws.send(JSON.stringify({ type: "pong" }));
        }
      };
      var message = JSON.stringify({
        type: "connect",
        role: params.role,
        channelId: params.channelId,
        accessToken: params.accessToken
      });
      this._ws.send(message);
    }
  }, {
    key: "answer",
    value: function answer(sdp) {
      this._ws.send(JSON.stringify({ type: "answer", sdp: sdp }));
    }
  }]);

  return SoraConnection;
})();

module.exports = Sora;

},{}]},{},[1])(1)
});