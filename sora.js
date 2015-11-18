class Sora {
  constructor(config) {
    this.config = config || {};
  }
  connection(onSuccess, onError=() => {}, onClose=() => {}) {
    let url = "ws://" + this.config.host + ":" + this.config.port + "/" + this.config.path;
    return new SoraConnection(url, onSuccess, onError, onClose);
  }
}

class SoraConnection {
  constructor(url, onSuccess, onError, onClose) {
    this._ws = new WebSocket(url);
    this._onClose = onClose;
    this._ws.onopen = () => {
      onSuccess();
    };
    this._ws.onerror = (e) => {
      onError(e);
    };
    this._ws.onclose = (e) => {
      onClose(e);
    };
  }
  connect(params, onOffer, onError) {
    const self = this;
    this._ws.onclose = (e) => {
      if (/^440[0-9]$/.test(e.code)) {
        onError(e.reason);
      }
      this._onClose(e);
      self._ws = null;
    };
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
