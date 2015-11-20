class Sora {
  constructor(url) {
    this.url = url || "";
  }
  connection(onSuccess, onError=() => {}, onClose=() => {}) {
    return new SoraConnection(this.url, onSuccess, onError, onClose);
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
      if (e.code === 4401) {
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
  candidate(candidate) {
    let message = candidate.toJSON();
    message.type = "candidate";
    this._ws.send(JSON.stringify(message));
  }
}


module.exports = Sora;
