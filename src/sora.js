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
    this._callbacks = {
      error: () => {},
      disconnect: () => {},
      snapshot: () => {},
      update: () => {},
    };
  }

  _isPlanB() {
    const userAgent = window.navigator.userAgent.toLocaleLowerCase();
    if (userAgent.indexOf("chrome") != -1) {
      return true;
    } else {
      return false;
    }
  }

  _createSignalingMessage(params) {
    const message = {
      type: "connect",
      role: params.role,
      channel_id: params.channelId,
      access_token: params.accessToken,
    };
    Object.keys(message).forEach(key => {
      if (message[key] === undefined) {
        message[key] = null;
      }
    });
    // multistream
    if (params.multistream === true) {
      message.multistream = true;
      message.plan_b = this._isPlanB();
    }
    // create audio params
    let audio = true;
    if ("audio" in params && typeof params["audio"] === "boolean") {
      audio = params.audio;
    }
    if (audio) {
      if ("audioCodecType" in params) {
        audio = {
          codec_type: params.audioCodecType
        };
      }
    }
    message["audio"] = audio;
    // create video params
    let video = true;
    if ("video" in params) {
      video = params.video;
    }

    if (video) {
      const videoPropertyKeys = ["videoCodecType", "videoBitRate", "videoSnapshot"];
      if (Object.keys(params).some(key => { return 0 <= videoPropertyKeys.indexOf(key); })) {
        video = {};
        if ("videoCodecType" in params) {
          video["codec_type"] = params.videoCodecType;
        }
        if ("videoBitRate" in params) {
          video["bit_rate"] = params.videoBitRate;
        }
        if ("videoSnapshot" in params) {
          video["snapshot"] = params.videoSnapshot;
        }
      }
    }
    message["video"] = video;

    return message;
  }
  connect(params) {
    return new Promise((resolve, reject) => {
      if (this._ws === null) {
        this._ws = new WebSocket(this._url);
      }
      this._ws.onopen = () => {
        this._ws.send(JSON.stringify(this._createSignalingMessage(params)));
      };
      this._ws.onclose = (e) => {
        if (/440\d$/.test(e.code)) {
          reject(e);
        }
        else {
          this._callbacks.disconnect(e);
        }
      };
      this._ws.onerror = (e) => {
        this._callbacks.error(e);
      };
      this._ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "offer") {
          resolve(data);
        }
        else if (data.type === "update") {
          this._callbacks.update(data);
        }
        else if (data.type === "snapshot") {
          this._callbacks.snapshot(data);
        }
        else if (data.type === "ping") {
          this._ws.send(JSON.stringify({ type: "pong" }));
        }
      };
    });
  }
  answer(sdp) {
    this._ws.send(JSON.stringify({ type: "answer", sdp }));
  }
  candidate(candidate) {
    const message = candidate.toJSON();
    message.type = "candidate";
    this._ws.send(JSON.stringify(message));
  }
  disconnect() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }
  on(kind, callback) {
    if (this._callbacks.hasOwnProperty(kind)) {
      this._callbacks[kind] = callback;
    }
  }
}

module.exports = Sora;
