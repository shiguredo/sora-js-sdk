(function(global) {
  "use strict";

  var Sora = function(config) {
    this.config = config || {};
  };

  Sora.prototype.connection = function(onSuccess, onError) {
    var ws = new WebSocket("ws://" + this.config.host + ":" + this.config.port + "/" + this.config.path);
    ws.onopen = function() {
      onSuccess();
    };
    ws.onerror = function(e) {
      onError(e);
    };
    return new SoraConnection(ws);
  };

  var SoraConnection = function(ws) {
    this._ws = ws;
    this._onOffer = function(message) {};
  };

  SoraConnection.prototype.signaling = function(params) {
    var message = JSON.stringify({
      "type": "connect",
      "role": params.role,
      "channelId": params.channelId
    });
    var self = this;
    this._ws.send(message);
    this._ws.onmessage = function(event) {
      var message = JSON.parse(event.data);
      if (message.type == "offer") {
        self._onOffer(message);
      } else if (message.type == "ping") {
        self._ws.send(JSON.stringify({type: "pong"}));
      }
    };
  };

  SoraConnection.prototype.offer = function(callback) {
    this._onOffer = callback;
  };

  SoraConnection.prototype.candidate = function(sdp) {
    this._ws.send(JSON.stringify({"type": "answer", "sdp": sdp}));
  };

  if ("process" in global) {
     module.exports = Sora;
  }
  global.Sora = Sora;
})((this || 0).self || global);
