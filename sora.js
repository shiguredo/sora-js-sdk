(function() {
  "use strict";

  var objectTypes = {
    "function": true,
    "object": true
  };
  var freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;
  var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;
  var freeGlobal = freeExports && freeModule && typeof global == "object" && global && global.Object && global;
  var freeWindow = objectTypes[typeof window] && window && window.Object && window;
  var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;
  var root = freeGlobal || ((freeWindow !== (this && this.window)) && freeWindow) || this;

  var Sora = function() {};
  Sora.prototype.connect = function(params, onSuccess, onError) {
    var ws = new WebSocket("ws://" + params.host + ":" + params.port + "/" + params.path);
    ws.onopen = function() {
      var message = JSON.stringify({
        "type": params.role,
        "channelId": params.channelId
      });
      ws.send(message);
    };
    ws.onmessage = function(event) {
      var message = JSON.parse(event.data);
      if (message.sdp) {
        onSuccess(message);
      } else if (message.type == "ping") {
        ws.send(JSON.stringify({type: "pong"}));
      }
    };
    ws.onclose = function(error) {
      onError(error);
    };
    return ws;
  };

  if (typeof define == "function" && typeof define.amd == "object" && define.amd) {
    root.Sora = Sora;
    define(function() {
      return Sora;
    });
  }
  else if (freeExports && freeModule) {
    if (moduleExports) {
      (freeModule.exports = Sora).Sora = Sora;
    }
    else {
      freeExports.Sora = Sora;
    }
  }
  else {
    root.Sora = Sora;
  }
}.call(this));
