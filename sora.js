class Sora {
  constructor(config) {
    this.config = config || {};
  }
  connection(onSuccess, onError) {
    let ws = new WebSocket("ws://" + this.config.host + ":" + this.config.port + "/" + this.config.path);
    ws.onopen = () => {
      onSuccess();
    }
    ws.onerror = (e) => {
      onError(e);
    }
    return new SoraConnection(ws, onError);
  }
}

class SoraConnection {
  constructor(ws, onWsError) {
    this._ws = ws;
    this._onWsError = onWsError;
  }
  connect(params, onOffer, onError) {
    const message = JSON.stringify({
      type: "connect",
      role: params.role,
      channelId: params.channelId
    });
    const self = this;
    this._ws.send(message);
    this._ws.onerror = (e) => {
      onError(e);
    };
    this._ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type == "offer") {
        onOffer(data);
      } else if (data.type == "ping") {
        self._ws.send(JSON.stringify({type: "pong"}));
      }
    };
  }
  answer(sdp) {
    this._ws.send(JSON.stringify({type: "answer", sdp}));
  }
}

module.exports = Sora;
