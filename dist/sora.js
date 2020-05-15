/**
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 2020.1.0-dev
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
          sora_client: `Sora JavaScript SDK ${'2020.1.0-dev'}`,
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
      // e2ee
      if ("e2ee" in options) {
          if (typeof message.video === "boolean") {
              message.video = {};
          }
          message.video["codec_type"] = "VP8";
          message.e2ee = true;
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

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var sora_e2ee_min = createCommonjsModule(function (module, exports) {
  /**
   * sora-e2ee
   * WebRTC SFU Sora JavaScript E2EE Library
   * @version: 2020.1.0-dev
   * @author: Shiguredo Inc.
   * @license: Apache-2.0
   **/(function(a,b){module.exports=b();})(commonjsGlobal,function(){return class a{constructor(a){const b=!!RTCRtpSender.prototype.createEncodedVideoStreams;if(!b)throw new Error("E2EE is not supported in this browser");this.worker=null,this.masterKey=new TextEncoder().encode(a),this.onWorkerDisconnect=null;}startWorker(){const a=atob("bGV0IG1hc3RlcktleSxtYXRlcmlhbDtjb25zdCBkZXJpdmVLZXlNYXA9bmV3IE1hcCxzZXFOdW1NYXA9bmV3IE1hcCx3cml0ZUlWTWFwPW5ldyBNYXAsc2VxTnVtTGVuZ3RoPTQsc3NyY0xlbmd0aD00LHBhZGRpbmdMZW5ndGg9OCx1bmVuY3J5cHRlZEJ5dGVzPXtrZXk6MTAsZGVsdGE6Myx1bmRlZmluZWQ6MX07ZnVuY3Rpb24gZ2V0U2VxTnVtKGEpe3JldHVybiBzZXFOdW1NYXAuZ2V0KGEpfHwwfWZ1bmN0aW9uIHNldFNlcU51bShhLGIpe3NlcU51bU1hcC5zZXQoYSxiKX1hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZURlcml2ZUtleShhLGIpe2xldCBjPWRlcml2ZUtleU1hcC5nZXQoYSk7cmV0dXJuIGN8fChjPWF3YWl0IGNyeXB0by5zdWJ0bGUuZGVyaXZlS2V5KHtuYW1lOiJQQktERjIiLHNhbHQ6YixpdGVyYXRpb25zOjFlNCxoYXNoOiJTSEEtMjU2In0sbWF0ZXJpYWwse25hbWU6IkFFUy1HQ00iLGxlbmd0aDoxMjh9LCExLFsiZW5jcnlwdCIsImRlY3J5cHQiXSksZGVyaXZlS2V5TWFwLnNldChhLGMpKSxjfWFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSVYoYSxiLGMpe2xldCBkPXdyaXRlSVZNYXAuZ2V0KGEpO2lmKCFkKXtjb25zdCBjPWF3YWl0IGNyeXB0by5zdWJ0bGUuZGVyaXZlQml0cyh7bmFtZToiUEJLREYyIixzYWx0OmIsaXRlcmF0aW9uczoxZTQsaGFzaDp7bmFtZToiU0hBLTM4NCJ9fSxtYXRlcmlhbCw5Nik7ZD1uZXcgVWludDhBcnJheShjKSx3cml0ZUlWTWFwLnNldChhLGQpfWNvbnN0IGU9bmV3IFVpbnQ4QXJyYXkocGFkZGluZ0xlbmd0aCtzZXFOdW1MZW5ndGgpO2Uuc2V0KG5ldyBVaW50OEFycmF5KGMuYnVmZmVyKSxwYWRkaW5nTGVuZ3RoKTtjb25zdCBmPW5ldyBVaW50OEFycmF5KGUuYnl0ZUxlbmd0aCk7Zm9yKGxldCBnPTA7ZzxlLmJ5dGVMZW5ndGg7ZysrKWZbZ109ZVtnXV5kW2ddO3JldHVybiBmfWFzeW5jIGZ1bmN0aW9uIGVuY3J5cHRGdW5jdGlvbihhLGIpe2NvbnN0IGM9YS5zeW5jaHJvbml6YXRpb25Tb3VyY2UsZD1VaW50MzJBcnJheS5vZihjKSxlPWdldFNlcU51bShjKTtlPj00Mjk0OTY3Mjk2JiZwb3N0TWVzc2FnZSh7b3BlcmF0aW9uOiJkaXNjb25uZWN0In0pO2NvbnN0IGY9VWludDMyQXJyYXkub2YoZSksZz1hd2FpdCBnZW5lcmF0ZURlcml2ZUtleShjLGQpLGg9YXdhaXQgZ2VuZXJhdGVJVihjLGQsZiksaT1hd2FpdCBjcnlwdG8uc3VidGxlLmVuY3J5cHQoe25hbWU6IkFFUy1HQ00iLGl2OmgsYWRkaXRpb25hbERhdGE6bmV3IFVpbnQ4QXJyYXkoYS5kYXRhLDAsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKX0sZyxuZXcgVWludDhBcnJheShhLmRhdGEsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKSksaj1uZXcgQXJyYXlCdWZmZXIodW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdK2kuYnl0ZUxlbmd0aCtkLmJ5dGVMZW5ndGgrZi5ieXRlTGVuZ3RoKSxrPW5ldyBVaW50OEFycmF5KGopO2suc2V0KG5ldyBVaW50OEFycmF5KGEuZGF0YSwwLHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXSkpLGsuc2V0KG5ldyBVaW50OEFycmF5KGkpLHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXSksay5zZXQobmV3IFVpbnQ4QXJyYXkoZC5idWZmZXIpLHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXStpLmJ5dGVMZW5ndGgpLGsuc2V0KG5ldyBVaW50OEFycmF5KGYuYnVmZmVyKSx1bmVuY3J5cHRlZEJ5dGVzW2EudHlwZV0raS5ieXRlTGVuZ3RoK2QuYnl0ZUxlbmd0aCksYS5kYXRhPWosYi5lbnF1ZXVlKGEpLHNldFNlcU51bShjLGUrMSl9YXN5bmMgZnVuY3Rpb24gZGVjcnlwdEZ1bmN0aW9uKGEsYil7Y29uc3QgYz1hLmRhdGEuc2xpY2UoYS5kYXRhLmJ5dGVMZW5ndGgtKHNzcmNMZW5ndGgrc2VxTnVtTGVuZ3RoKSxhLmRhdGEuYnl0ZUxlbmd0aCksZD1jLnNsaWNlKDAsc3NyY0xlbmd0aCksZT1uZXcgVWludDMyQXJyYXkoZCksZj1jLnNsaWNlKHNzcmNMZW5ndGgsYy5ieXRlTGVuZ3RoKSxnPW5ldyBVaW50MzJBcnJheShmKSxoPWVbMF0saT1hd2FpdCBnZW5lcmF0ZURlcml2ZUtleShoLGUpLGo9YXdhaXQgZ2VuZXJhdGVJVihoLGUsZyksaz11bmVuY3J5cHRlZEJ5dGVzW2EudHlwZV0sbD1hLmRhdGEuYnl0ZUxlbmd0aC0odW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdK3NzcmNMZW5ndGgrc2VxTnVtTGVuZ3RoKTtsZXQgbTt0cnl7bT1hd2FpdCBjcnlwdG8uc3VidGxlLmRlY3J5cHQoe25hbWU6IkFFUy1HQ00iLGl2OmosYWRkaXRpb25hbERhdGE6bmV3IFVpbnQ4QXJyYXkoYS5kYXRhLDAsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKX0saSxuZXcgVWludDhBcnJheShhLmRhdGEsayxsKSl9Y2F0Y2goYyl7aWYoYS50eXBlPT09dm9pZCAwKXtjb25zdCBiPW5ldyBBcnJheUJ1ZmZlcigzKSxjPW5ldyBVaW50OEFycmF5KGIpO2Muc2V0KFsyMTYsMjU1LDI1NF0pLGEuZGF0YT1ifWVsc2V7Y29uc3QgYj1uZXcgQXJyYXlCdWZmZXIoNjApLGM9bmV3IFVpbnQ4QXJyYXkoYik7Yy5zZXQoWzE3Niw1LDAsMTU3LDEsNDIsMTYwLDAsOTAsMCw1NywzLDAsMCwyOCwzNCwyMiwyMiwzNCwxMDIsMTgsMzIsNCwxNDQsNjQsMCwxOTcsMSwyMjQsMTI0LDc3LDQ3LDI1MCwyMjEsNzcsMTY1LDEyNywxMzcsMTY1LDI1NSw5MSwxNjksMTgwLDE3NSwyNDEsNTIsMTkxLDIzNSwxMTcsNTQsMTQ5LDI1NCwzOCwxNTAsOTYsMjU0LDI1NSwxODYsMjU1LDY0XSksYS5kYXRhPWJ9cmV0dXJuIHZvaWQgYi5lbnF1ZXVlKGEpfWNvbnN0IG49bmV3IEFycmF5QnVmZmVyKHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXSttLmJ5dGVMZW5ndGgpLG89bmV3IFVpbnQ4QXJyYXkobik7by5zZXQobmV3IFVpbnQ4QXJyYXkoYS5kYXRhLDAsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKSksby5zZXQobmV3IFVpbnQ4QXJyYXkobSksdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKSxhLmRhdGE9bixiLmVucXVldWUoYSl9b25tZXNzYWdlPWFzeW5jIGE9Pntjb25zdHtvcGVyYXRpb246Yn09YS5kYXRhO2lmKCJlbmNyeXB0Ij09PWIpe2NvbnN0e3JlYWRhYmxlU3RyZWFtOmIsd3JpdGFibGVTdHJlYW06Y309YS5kYXRhLGQ9bmV3IFRyYW5zZm9ybVN0cmVhbSh7dHJhbnNmb3JtOmVuY3J5cHRGdW5jdGlvbn0pO2IucGlwZVRocm91Z2goZCkucGlwZVRvKGMpfWVsc2UgaWYoImRlY3J5cHQiPT09Yil7Y29uc3R7cmVhZGFibGVTdHJlYW06Yix3cml0YWJsZVN0cmVhbTpjfT1hLmRhdGEsZD1uZXcgVHJhbnNmb3JtU3RyZWFtKHt0cmFuc2Zvcm06ZGVjcnlwdEZ1bmN0aW9ufSk7Yi5waXBlVGhyb3VnaChkKS5waXBlVG8oYyl9ZWxzZSJzZXRLZXkiPT09Yj8obWFzdGVyS2V5PWEuZGF0YS5tYXN0ZXJLZXksbWF0ZXJpYWw9YXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoInJhdyIsbWFzdGVyS2V5LCJQQktERjIiLCExLFsiZGVyaXZlQml0cyIsImRlcml2ZUtleSJdKSk6ImNsZWFyIj09PWImJihkZXJpdmVLZXlNYXAuY2xlYXIoKSxzZXFOdW1NYXAuY2xlYXIoKSx3cml0ZUlWTWFwLmNsZWFyKCkpfTsK");this.worker=new Worker(URL.createObjectURL(new Blob([a],{type:"application/javascript"}))),this.worker.onmessage=a=>{const{operation:b}=a.data;"disconnect"===b&&"function"==typeof this.onWorkerDisconnect&&this.onWorkerDisconnect();},this.worker.postMessage({operation:"setKey",masterKey:this.masterKey});}terminateWorker(){this.worker&&this.worker.terminate();}setupSenderTransform(a){if(a.track){const b="video"===a.track.kind?a.createEncodedVideoStreams():a.createEncodedAudioStreams();this.worker&&this.worker.postMessage({operation:"encrypt",readableStream:b.readableStream,writableStream:b.writableStream},[b.readableStream,b.writableStream]);}}setupReceiverTransform(a){const b="video"===a.track.kind?a.createEncodedVideoStreams():a.createEncodedAudioStreams();this.worker&&this.worker.postMessage({operation:"decrypt",readableStream:b.readableStream,writableStream:b.writableStream},[b.readableStream,b.writableStream]);}}});

  });

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
              track: () => { },
              removestream: () => { },
              notify: () => { },
              log: () => { },
              timeout: () => { },
          };
          this.authMetadata = null;
          this.e2ee = null;
          if ("e2ee" in options && typeof options.e2ee === "string") {
              this.e2ee = new sora_e2ee_min(options.e2ee);
              this.e2ee.startWorker();
          }
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
          if (this.e2ee) {
              // @ts-ignore
              config["forceEncodedVideoInsertableStreams"] = true;
              // @ts-ignore
              config["forceEncodedAudioInsertableStreams"] = true;
          }
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
          if (this._pc && this.e2ee) {
              this._pc.getSenders().forEach((sender) => {
                  if (this.e2ee) {
                      this.e2ee.setupSenderTransform(sender);
                  }
              });
          }
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
                      if (this.e2ee) {
                          console.log("coco");
                          this.e2ee.setupReceiverTransform(event.receiver);
                      }
                      this._callbacks.track(event);
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
          this.stream = stream;
          await this._createAnswer(signalingMessage);
          this._sendAnswer();
          if (this._pc && this.e2ee) {
              this._pc.getSenders().forEach((sender) => {
                  if (this.e2ee) {
                      this.e2ee.setupSenderTransform(sender);
                  }
              });
          }
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
                  if (this.e2ee) {
                      this.e2ee.setupReceiverTransform(event.receiver);
                  }
                  this._callbacks.track(event);
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
                  if (this.e2ee) {
                      this.e2ee.setupReceiverTransform(event.receiver);
                  }
                  this._callbacks.track(event);
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
          return '2020.1.0-dev';
      },
  };

  return sora;

})));
