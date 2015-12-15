class Sora {
  constructor(url) {
    this.url = url || "";
  }
  connection() {
    return new SoraConnection(this.url);
  }
}

class SoraConnection {
  constructor(url) {
    this._ws = null;
    this._url = url;
  }
  connect(params) {
    return new Promise((resolve, reject) => {
      if (this._ws === null ) {
        this._ws = new WebSocket(this._url);
      }
      this._ws.onopen = () => {
        const message = JSON.stringify({
          type: "connect",
          role: params.role,
          channelId: params.channelId,
          accessToken: params.accessToken
        });
        this._ws.send(message);
      };
      this._ws.onclose = (e) => {
        if (e.code === 4401) {
          reject(e);
        }
      };
      this._ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type == "offer") {
          resolve(data);
        } else if (data.type == "ping") {
          this._ws.send(JSON.stringify({type: "pong"}));
        }
      };
    });
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
