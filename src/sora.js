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
    this._onerror = () => {};
    this._onclose = () => {};
  }
  connect(params) {
    return new Promise((resolve, reject) => {
      if (this._ws === null) {
        this._ws = new WebSocket(this._url);
      }
      this._ws.onopen = () => {
        const message = {
          type: "connect",
          role: params.role,
          channel_id: params.channelId,
          access_token: params.accessToken,
          multistream: params.multistream
        };
        if (params.codecType) {
          message.video = { codec_type: params.codecType };
        }
        this._ws.send(JSON.stringify(message));
      };
      this._ws.onclose = (e) => {
        if (/440\d$/.test(e.code)) {
          reject(e);
        }
        else {
          this._onclose(e);
        }
      };
      this._ws.onerror = (e) => {
        this._onerror(e);
      };
      this._ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type == "offer") {
          resolve(data);
        } else if (data.type == "ping") {
          this._ws.send(JSON.stringify({ type: "pong" }));
        }
      };
    });
  }
  answer(sdp) {
    this._ws.send(JSON.stringify({ type: "answer", sdp }));
  }
  candidate(candidate) {
    let message = candidate.toJSON();
    message.type = "candidate";
    this._ws.send(JSON.stringify(message));
  }
  onError(f) {
    this._onerror = f;
  }
  onDisconnect(f) {
    this._onclose = f;
  }
  disconnect() {
    this._ws.close();
    this._ws = null;
  }
}

module.exports = Sora;
