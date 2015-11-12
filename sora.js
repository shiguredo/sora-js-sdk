class Sora {
  constructor(config) {
    this.config = config || {};
  }
  connection(onSuccess, onError=() => {}, onClose=() => {}) {
    let ws = new WebSocket("ws://" + this.config.host + ":" + this.config.port + "/" + this.config.path);
    ws.onopen = () => {
      onSuccess();
    }
    ws.onerror = (e) => {
      onError(e);
    }
    ws.onclose = (e) => {
      onClose(e);
    }
    return new SoraConnection(ws, onClose);
  }
}

class SoraConnection {
  constructor(ws, onClose) {
    this._ws = ws;
    this._onClose = onClose;
  }
  connect(params, onOffer, onError) {
    const self = this;
    this._ws.onclose = (e) => {
      if (/^440[0-9]$/.test(e.code)) {
        onError(e.reason);
      }
      this._onClose(e);
      self._ws = null;
    }
    this._ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type == "offer") {
        onOffer(data);
      } else if (data.type == "ping") {
        self._ws.send(JSON.stringify({type: "pong"}));
      }
    };
    const message = JSON.stringify({
      type: "connect",
      role: params.role,
      channelId: params.channelId,
      accessToken: params.accessToken
    });
    this._ws.send(message);
  }
  answer(sdp) {
    this._ws.send(JSON.stringify({type: "answer", sdp}));
  }
}


module.exports = Sora;
