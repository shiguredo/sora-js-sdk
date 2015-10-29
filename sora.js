(function(global) {
  "use strict";

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
      if (message.type == "offer") {
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

  if ("process" in global) {
     module.exports = Sora;
  }
  global.Sora = Sora;
})((this || 0).self || global);
