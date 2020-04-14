/**
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 1.16.0-dev
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global.Sora = factory());
}(this, (function () { 'use strict';

  function browser() {
      const ua = window.navigator.userAgent.toLocaleLowerCase();
      if (ua.indexOf("edge") !== -1) {
          return "edge";
      }
      else if (ua.indexOf("chrome") !== -1 && ua.indexOf("edge") === -1) {
          return "chrome";
      }
      else if (ua.indexOf("safari") !== -1 && ua.indexOf("chrome") === -1) {
          return "safari";
      }
      else if (ua.indexOf("opera") !== -1) {
          return "opera";
      }
      else if (ua.indexOf("firefox") !== -1) {
          return "firefox";
      }
      return null;
  }
  function enabledSimulcast(role, video) {
      /**
        simulcast validator
        VP9 x
    
        simulcast_pub Chrome o
        simulcast_pub Firefox x
        simulcast_pub Safari 12.1.1 x
        simulcast_pub Safari 12.1 x
        simulcast_pub Safari 12.0 x
        simulcast_sub Chrome o
        simulcast_sub Firefox o
        simulcast_sub Safari 12.1.1 o
        simulcast_sub Safari 12.1 o
        simulcast_sub Safari 12.0 o ※H.264 のみ
      **/
      if (typeof video !== "boolean" && video.codec_type === "VP9") {
          return false;
      }
      if ((role === "upstream" || role === "sendrecv" || role === "sendonly") && browser() === "firefox") {
          return false;
      }
      if ((role === "upstream" || role === "sendrecv" || role === "sendonly") && browser() === "safari") {
          return false;
      }
      // TODO(nakai): sendonly, sendrecv を無効にする
      if ((role === "downstream" || role === "recvonly") && browser() === "safari") {
          const appVersion = window.navigator.appVersion.toLowerCase();
          const versions = /version\/([\d.]+)/.exec(appVersion);
          if (!versions) {
              return false;
          }
          const version = versions.pop();
          // version 12.0 以降であれば有効
          if (version && 12.0 < parseFloat(version)) {
              return true;
          }
          if (version && 12.0 == parseFloat(version) && typeof video !== "boolean" && video.codec_type === "H264") {
              // role が downstream で 'H264' の場合のみ有効
              return true;
          }
          return false;
      }
      return true;
  }
  function isEdge() {
      return browser() === "edge";
  }
  function isSafari() {
      return browser() === "safari";
  }
  function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
      if (role !== "upstream" &&
          role !== "downstream" &&
          role !== "sendrecv" &&
          role !== "sendonly" &&
          role !== "recvonly") {
          throw new Error("Unknown role type");
      }
      if (channelId === null || channelId === undefined) {
          throw new Error("channelId can not be null or undefined");
      }
      const message = {
          type: "connect",
          // @ts-ignore
          // eslint-disable-next-line @typescript-eslint/camelcase
          sora_client: `Sora JavaScript SDK ${'1.16.0-dev'}`,
          environment: window.navigator.userAgent,
          role: role,
          // eslint-disable-next-line @typescript-eslint/camelcase
          channel_id: channelId,
          sdp: offerSDP,
          audio: true,
          video: true,
      };
      if (metadata) {
          message.metadata = metadata;
      }
      if ("multistream" in options && options.multistream === true) {
          // multistream
          message.multistream = true;
          // spotlight
          if ("spotlight" in options) {
              message.spotlight = options.spotlight;
          }
      }
      if ("simulcast" in options || "simulcastQuality" in options) {
          // simulcast
          if ("simulcast" in options && options.simulcast === true) {
              message.simulcast = true;
          }
          const simalcastQualities = ["low", "middle", "high"];
          if (options.simulcastQuality !== undefined && 0 <= simalcastQualities.indexOf(options.simulcastQuality)) {
              message.simulcast = {
                  quality: options.simulcastQuality,
              };
          }
      }
      // client_id
      if ("clientId" in options && options.clientId) {
          // eslint-disable-next-line @typescript-eslint/camelcase
          message.client_id = options.clientId;
      }
      // parse options
      const audioPropertyKeys = ["audioCodecType", "audioBitRate"];
      const audioOpusParamsPropertyKeys = [
          "audioOpusParamsChannels",
          "audioOpusParamsClockRate",
          "audioOpusParamsMaxplaybackrate",
          "audioOpusParamsStereo",
          "audioOpusParamsSpropStereo",
          "audioOpusParamsMinptime",
          "audioOpusParamsPtime",
          "audioOpusParamsUseinbandfec",
          "audioOpusParamsUsedtx",
      ];
      const videoPropertyKeys = ["videoCodecType", "videoBitRate"];
      const copyOptions = Object.assign({}, options);
      Object.keys(copyOptions).forEach((key) => {
          if (key === "audio" && typeof copyOptions[key] === "boolean")
              return;
          if (key === "video" && typeof copyOptions[key] === "boolean")
              return;
          if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null)
              return;
          if (0 <= audioOpusParamsPropertyKeys.indexOf(key) && copyOptions[key] !== null)
              return;
          if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null)
              return;
          delete copyOptions[key];
      });
      if (copyOptions.audio !== undefined) {
          message.audio = copyOptions.audio;
      }
      const hasAudioProperty = Object.keys(copyOptions).some((key) => {
          return 0 <= audioPropertyKeys.indexOf(key);
      });
      if (message.audio && hasAudioProperty) {
          message.audio = {};
          if ("audioCodecType" in copyOptions) {
              message.audio["codec_type"] = copyOptions.audioCodecType;
          }
          if ("audioBitRate" in copyOptions) {
              message.audio["bit_rate"] = copyOptions.audioBitRate;
          }
      }
      const hasAudioOpusParamsProperty = Object.keys(copyOptions).some((key) => {
          return 0 <= audioOpusParamsPropertyKeys.indexOf(key);
      });
      if (message.audio && hasAudioOpusParamsProperty) {
          if (typeof message.audio != "object") {
              message.audio = {};
          }
          // eslint-disable-next-line @typescript-eslint/camelcase
          message.audio.opus_params = {};
          if ("audioOpusParamsChannels" in copyOptions) {
              message.audio.opus_params.channels = copyOptions.audioOpusParamsChannels;
          }
          if ("audioOpusParamsClockRate" in copyOptions) {
              // eslint-disable-next-line @typescript-eslint/camelcase
              message.audio.opus_params.clock_rate = copyOptions.audioOpusParamsClockRate;
          }
          if ("audioOpusParamsMaxplaybackrate" in copyOptions) {
              message.audio.opus_params.maxplaybackrate = copyOptions.audioOpusParamsMaxplaybackrate;
          }
          if ("audioOpusParamsStereo" in copyOptions) {
              message.audio.opus_params.stereo = copyOptions.audioOpusParamsStereo;
          }
          if ("audioOpusParamsSpropStereo" in copyOptions) {
              // eslint-disable-next-line @typescript-eslint/camelcase
              message.audio.opus_params.sprop_stereo = copyOptions.audioOpusParamsSpropStereo;
          }
          if ("audioOpusParamsMinptime" in copyOptions) {
              message.audio.opus_params.minptime = copyOptions.audioOpusParamsMinptime;
          }
          if ("audioOpusParamsPtime" in copyOptions) {
              message.audio.opus_params.ptime = copyOptions.audioOpusParamsPtime;
          }
          if ("audioOpusParamsUseinbandfec" in copyOptions) {
              message.audio.opus_params.useinbandfec = copyOptions.audioOpusParamsUseinbandfec;
          }
          if ("audioOpusParamsUsedtx" in copyOptions) {
              message.audio.opus_params.usedtx = copyOptions.audioOpusParamsUsedtx;
          }
      }
      if (copyOptions.video !== undefined) {
          message.video = copyOptions.video;
      }
      const hasVideoProperty = Object.keys(copyOptions).some((key) => {
          return 0 <= videoPropertyKeys.indexOf(key);
      });
      if (message.video && hasVideoProperty) {
          message.video = {};
          if ("videoCodecType" in copyOptions) {
              message.video["codec_type"] = copyOptions.videoCodecType;
          }
          if ("videoBitRate" in copyOptions) {
              message.video["bit_rate"] = copyOptions.videoBitRate;
          }
      }
      if (message.simulcast && !enabledSimulcast(message.role, message.video)) {
          throw new Error("Simulcast can not be used with this browser");
      }
      return message;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function trace(clientId, title, value) {
      let prefix = "";
      if (window.performance) {
          prefix = "[" + (window.performance.now() / 1000).toFixed(3) + "]";
      }
      if (clientId) {
          prefix = prefix + "[" + clientId + "]";
      }
      if (isEdge()) {
          console.log(prefix + ' ' + title + '\n', value); // eslint-disable-line
      }
      else {
          console.info(prefix + ' ' + title + '\n', value); // eslint-disable-line
      }
  }

  class ConnectionBase {
      constructor(signalingUrl, role, channelId, metadata, options, debug) {
          this.role = role;
          this.channelId = channelId;
          this.metadata = metadata;
          this.signalingUrl = signalingUrl;
          this.options = options;
          this.constraints = null;
          this.debug = debug;
          this.clientId = null;
          this.connectionId = null;
          this.remoteConnectionIds = [];
          this.stream = null;
          this._ws = null;
          this._pc = null;
          this._callbacks = {
              disconnect: () => { },
              push: () => { },
              addstream: () => { },
              removestream: () => { },
              notify: () => { },
              log: () => { },
              timeout: () => { },
          };
          this.authMetadata = null;
      }
      on(kind, callback) {
          if (kind in this._callbacks) {
              this._callbacks[kind] = callback;
          }
      }
      disconnect() {
          this.clientId = null;
          this.connectionId = null;
          this.authMetadata = null;
          this.remoteConnectionIds = [];
          const closeStream = new Promise((resolve, _) => {
              if (!this.stream)
                  return resolve();
              this.stream.getTracks().forEach((t) => {
                  t.stop();
              });
              this.stream = null;
              return resolve();
          });
          const closeWebSocket = new Promise((resolve, reject) => {
              if (!this._ws)
                  return resolve();
              this._ws.onclose = null;
              let counter = 5;
              const timerId = setInterval(() => {
                  if (!this._ws) {
                      clearInterval(timerId);
                      return reject("WebSocket Closing Error");
                  }
                  if (this._ws.readyState === 3) {
                      this._ws = null;
                      clearInterval(timerId);
                      return resolve();
                  }
                  --counter;
                  if (counter < 0) {
                      clearInterval(timerId);
                      return reject("WebSocket Closing Error");
                  }
              }, 1000);
              this._ws.close();
          });
          const closePeerConnection = new Promise((resolve, reject) => {
              // Safari は signalingState が常に stable のため個別に処理する
              if (isSafari() && this._pc) {
                  this._pc.oniceconnectionstatechange = null;
                  this._pc.close();
                  this._pc = null;
                  return resolve();
              }
              if (!this._pc || this._pc.signalingState === "closed")
                  return resolve();
              let counter = 5;
              const timerId = setInterval(() => {
                  if (!this._pc) {
                      clearInterval(timerId);
                      return reject("PeerConnection Closing Error");
                  }
                  if (this._pc.signalingState === "closed") {
                      clearInterval(timerId);
                      this._pc.oniceconnectionstatechange = null;
                      this._pc = null;
                      return resolve();
                  }
                  --counter;
                  if (counter < 0) {
                      clearInterval(timerId);
                      return reject("PeerConnection Closing Error");
                  }
              }, 1000);
              this._pc.close();
          });
          return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
      }
      _signaling(offer) {
          this._trace("CREATE OFFER SDP", offer);
          return new Promise((resolve, reject) => {
              const signalingMessage = createSignalingMessage(offer.sdp || "", this.role, this.channelId, this.metadata, this.options);
              if (this._ws === null) {
                  this._ws = new WebSocket(this.signalingUrl);
              }
              this._ws.onclose = (e) => {
                  reject(e);
              };
              this._ws.onopen = () => {
                  this._trace("SIGNALING CONNECT MESSAGE", signalingMessage);
                  if (this._ws) {
                      this._ws.send(JSON.stringify(signalingMessage));
                  }
              };
              this._ws.onmessage = (event) => {
                  const data = JSON.parse(event.data);
                  if (data.type == "offer") {
                      this.clientId = data.client_id;
                      this.connectionId = data.connection_id;
                      if (this._ws) {
                          this._ws.onclose = (e) => {
                              this.disconnect().then(() => {
                                  this._callbacks.disconnect(e);
                              });
                          };
                          this._ws.onerror = null;
                      }
                      if ("metadata" in data) {
                          this.authMetadata = data.metadata;
                      }
                      this._trace("SIGNALING OFFER MESSAGE", data);
                      this._trace("OFFER SDP", data.sdp);
                      resolve(data);
                  }
                  else if (data.type == "update") {
                      this._trace("UPDATE SDP", data.sdp);
                      this._update(data);
                  }
                  else if (data.type == "ping") {
                      if (data.stats) {
                          this._getStats().then((stats) => {
                              if (this._ws) {
                                  this._ws.send(JSON.stringify({ type: "pong", stats: stats }));
                              }
                          });
                      }
                      else {
                          if (this._ws) {
                              this._ws.send(JSON.stringify({ type: "pong" }));
                          }
                      }
                  }
                  else if (data.type == "push") {
                      this._callbacks.push(data);
                  }
                  else if (data.type == "notify") {
                      this._callbacks.notify(data);
                  }
              };
          });
      }
      async _createOffer() {
          const config = { iceServers: [] };
          const pc = new window.RTCPeerConnection(config);
          if (isSafari()) {
              pc.addTransceiver("video", { direction: "recvonly" });
              pc.addTransceiver("audio", { direction: "recvonly" });
              const offer = await pc.createOffer();
              pc.close();
              return offer;
          }
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          pc.close();
          return offer;
      }
      async _connectPeerConnection(message) {
          const messageConfig = message.config || {};
          let config = messageConfig;
          if (window.RTCPeerConnection.generateCertificate !== undefined) {
              const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
              config = Object.assign({ certificates: [certificate] }, messageConfig);
          }
          this._trace("PEER CONNECTION CONFIG", config);
          this._pc = new window.RTCPeerConnection(config, this.constraints);
          this._pc.oniceconnectionstatechange = (_) => {
              if (this._pc) {
                  this._trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this._pc.iceConnectionState);
              }
          };
          return;
      }
      async _setRemoteDescription(message) {
          if (!this._pc) {
              return;
          }
          await this._pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: message.sdp }));
          return;
      }
      async _createAnswer(message) {
          if (!this._pc) {
              return;
          }
          // simulcast の場合
          if (this.options.simulcast &&
              (this.role === "upstream" || this.role === "sendrecv" || this.role === "sendonly") &&
              message.encodings) {
              const transceiver = this._pc.getTransceivers().find((t) => {
                  if (t.mid && 0 <= t.mid.indexOf("video") && t.currentDirection == null) {
                      return t;
                  }
              });
              if (!transceiver) {
                  throw new Error("Simulcast Error");
              }
              await this._setSenderParameters(transceiver, message.encodings);
          }
          const sessionDescription = await this._pc.createAnswer();
          await this._pc.setLocalDescription(sessionDescription);
          return;
      }
      _setSenderParameters(transceiver, encodings) {
          const originalParameters = transceiver.sender.getParameters();
          // @ts-ignore
          originalParameters.encodings = encodings;
          return transceiver.sender.setParameters(originalParameters);
      }
      _sendAnswer() {
          if (this._pc && this._ws && this._pc.localDescription) {
              this._trace("ANSWER SDP", this._pc.localDescription.sdp);
              this._ws.send(JSON.stringify({ type: "answer", sdp: this._pc.localDescription.sdp }));
          }
          return;
      }
      _sendUpdateAnswer() {
          if (this._pc && this._ws && this._pc.localDescription) {
              this._trace("ANSWER SDP", this._pc.localDescription.sdp);
              this._ws.send(JSON.stringify({ type: "update", sdp: this._pc.localDescription.sdp }));
          }
          return;
      }
      _onIceCandidate() {
          return new Promise((resolve, reject) => {
              const timerId = setInterval(() => {
                  if (this._pc === null) {
                      clearInterval(timerId);
                      const error = new Error();
                      error.message = "ICECANDIDATE TIMEOUT";
                      reject(error);
                  }
                  else if (this._pc && this._pc.iceConnectionState === "connected") {
                      clearInterval(timerId);
                      resolve();
                  }
              }, 100);
              if (this._pc) {
                  this._pc.onicecandidate = (event) => {
                      if (this._pc) {
                          this._trace("ONICECANDIDATE ICEGATHERINGSTATE", this._pc.iceGatheringState);
                      }
                      if (event.candidate === null) {
                          clearInterval(timerId);
                          resolve();
                      }
                      else {
                          const candidate = event.candidate.toJSON();
                          const message = Object.assign(candidate, { type: "candidate" });
                          this._trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
                          if (this._ws) {
                              this._ws.send(JSON.stringify(message));
                          }
                      }
                  };
              }
          });
      }
      async _update(message) {
          await this._setRemoteDescription(message);
          await this._createAnswer(message);
          this._sendUpdateAnswer();
      }
      async _getStats() {
          const stats = [];
          if (!this._pc) {
              return stats;
          }
          const reports = await this._pc.getStats();
          reports.forEach((s) => {
              stats.push(s);
          });
          return stats;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _trace(title, message) {
          this._callbacks.log(title, message);
          if (!this.debug) {
              return;
          }
          trace(this.clientId, title, message);
      }
  }

  class ConnectionPublisher extends ConnectionBase {
      connect(stream) {
          if (this.options.multistream) {
              return this._multiStream(stream);
          }
          else {
              return this._singleStream(stream);
          }
      }
      async _singleStream(stream) {
          let timeoutTimerId = 0;
          if (this.options.timeout && 0 < this.options.timeout) {
              timeoutTimerId = setTimeout(() => {
                  const error = new Error();
                  error.message = "CONNECTION TIMEOUT";
                  this._callbacks.timeout();
                  this.disconnect();
                  Promise.reject(error);
              }, this.options.timeout);
          }
          await this.disconnect();
          const offer = await this._createOffer();
          const signalingMessage = await this._signaling(offer);
          await this._connectPeerConnection(signalingMessage);
          await this._setRemoteDescription(signalingMessage);
          stream.getTracks().forEach((track) => {
              if (this._pc) {
                  this._pc.addTrack(track, stream);
              }
          });
          this.stream = stream;
          await this._createAnswer(signalingMessage);
          this._sendAnswer();
          await this._onIceCandidate();
          clearTimeout(timeoutTimerId);
          return stream;
      }
      async _multiStream(stream) {
          let timeoutTimerId = 0;
          if (this.options.timeout && 0 < this.options.timeout) {
              timeoutTimerId = setTimeout(() => {
                  const error = new Error();
                  error.message = "CONNECTION TIMEOUT";
                  this._callbacks.timeout();
                  this.disconnect();
                  Promise.reject(error);
              }, this.options.timeout);
          }
          await this.disconnect();
          const offer = await this._createOffer();
          const signalingMessage = await this._signaling(offer);
          await this._connectPeerConnection(signalingMessage);
          if (this._pc) {
              if (typeof this._pc.ontrack === "undefined") {
                  // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                  this._pc.onaddstream = (event) => {
                      if (this.connectionId !== event.stream.id) {
                          this.remoteConnectionIds.push(stream.id);
                          this._callbacks.addstream(event);
                      }
                  };
              }
              else {
                  this._pc.ontrack = (event) => {
                      const stream = event.streams[0];
                      if (!stream)
                          return;
                      if (stream.id === "default")
                          return;
                      if (stream.id === this.connectionId)
                          return;
                      if (-1 < this.remoteConnectionIds.indexOf(stream.id))
                          return;
                      // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                      event.stream = stream;
                      this.remoteConnectionIds.push(stream.id);
                      this._callbacks.addstream(event);
                  };
              }
          }
          if (this._pc) {
              // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
              this._pc.onremovestream = (event) => {
                  const index = this.remoteConnectionIds.indexOf(event.stream.id);
                  if (-1 < index) {
                      delete this.remoteConnectionIds[index];
                  }
                  this._callbacks.removestream(event);
              };
          }
          await this._setRemoteDescription(signalingMessage);
          stream.getTracks().forEach((track) => {
              if (this._pc) {
                  this._pc.addTrack(track, stream);
              }
          });
          await this._createAnswer(signalingMessage);
          this._sendAnswer();
          await this._onIceCandidate();
          clearTimeout(timeoutTimerId);
          return stream;
      }
  }

  class ConnectionSubscriber extends ConnectionBase {
      connect() {
          if (this.options.multistream) {
              return this._multiStream();
          }
          else {
              return this._singleStream();
          }
      }
      async _singleStream() {
          let timeoutTimerId = 0;
          if (this.options.timeout && 0 < this.options.timeout) {
              timeoutTimerId = setTimeout(() => {
                  const error = new Error();
                  error.message = "CONNECTION TIMEOUT";
                  this._callbacks.timeout();
                  this.disconnect();
                  Promise.reject(error);
              }, this.options.timeout);
          }
          await this.disconnect();
          const offer = await this._createOffer();
          const signalingMessage = await this._signaling(offer);
          await this._connectPeerConnection(signalingMessage);
          if (this._pc) {
              this._pc.ontrack = (event) => {
                  this.stream = event.streams[0];
                  const streamId = this.stream.id;
                  if (streamId === "default")
                      return;
                  if (-1 < this.remoteConnectionIds.indexOf(streamId))
                      return;
                  // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                  event.stream = this.stream;
                  this.remoteConnectionIds.push(streamId);
                  this._callbacks.addstream(event);
              };
          }
          await this._setRemoteDescription(signalingMessage);
          await this._createAnswer(signalingMessage);
          this._sendAnswer();
          await this._onIceCandidate();
          clearTimeout(timeoutTimerId);
          return this.stream || new MediaStream();
      }
      async _multiStream() {
          let timeoutTimerId = 0;
          if (this.options.timeout && 0 < this.options.timeout) {
              timeoutTimerId = setTimeout(() => {
                  const error = new Error();
                  error.message = "CONNECTION TIMEOUT";
                  this._callbacks.timeout();
                  this.disconnect();
                  Promise.reject(error);
              }, this.options.timeout);
          }
          await this.disconnect();
          const offer = await this._createOffer();
          const signalingMessage = await this._signaling(offer);
          await this._connectPeerConnection(signalingMessage);
          if (this._pc) {
              this._pc.ontrack = (event) => {
                  const stream = event.streams[0];
                  if (stream.id === "default")
                      return;
                  if (stream.id === this.connectionId)
                      return;
                  if (-1 < this.remoteConnectionIds.indexOf(stream.id))
                      return;
                  // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                  event.stream = stream;
                  this.remoteConnectionIds.push(stream.id);
                  this._callbacks.addstream(event);
              };
              // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
              this._pc.onremovestream = (event) => {
                  const index = this.remoteConnectionIds.indexOf(event.stream.id);
                  if (-1 < index) {
                      delete this.remoteConnectionIds[index];
                  }
                  this._callbacks.removestream(event);
              };
          }
          await this._setRemoteDescription(signalingMessage);
          await this._createAnswer(signalingMessage);
          this._sendAnswer();
          await this._onIceCandidate();
          clearTimeout(timeoutTimerId);
          return;
      }
  }

  class SoraConnection {
      constructor(signalingUrl, debug = false) {
          this.signalingUrl = signalingUrl;
          this.debug = debug;
      }
      // 古い role
      // @deprecated 1 年は残します
      publisher(channelId, metadata = null, options = { audio: true, video: true }) {
          return new ConnectionPublisher(this.signalingUrl, "upstream", channelId, metadata, options, this.debug);
      }
      // @deprecated 1 年は残します
      subscriber(channelId, metadata = null, options = { audio: true, video: true }) {
          return new ConnectionSubscriber(this.signalingUrl, "downstream", channelId, metadata, options, this.debug);
      }
      // 新しい role
      sendrecv(channelId, metadata = null, options = { audio: true, video: true }) {
          return new ConnectionPublisher(this.signalingUrl, "sendrecv", channelId, metadata, options, this.debug);
      }
      sendonly(channelId, metadata = null, options = { audio: true, video: true }) {
          return new ConnectionPublisher(this.signalingUrl, "sendonly", channelId, metadata, options, this.debug);
      }
      recvonly(channelId, metadata = null, options = { audio: true, video: true }) {
          return new ConnectionSubscriber(this.signalingUrl, "recvonly", channelId, metadata, options, this.debug);
      }
  }
  var sora = {
      connection: function (signalingUrl, debug = false) {
          return new SoraConnection(signalingUrl, debug);
      },
      version: function () {
          // @ts-ignore
          return '1.16.0-dev';
      },
  };

  return sora;

})));
