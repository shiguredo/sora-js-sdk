/**
 * sora-js-sdk
 * WebRTC SFU Sora JavaScript SDK
 * @version: 2020.4.0
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/

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
      simulcast_pub Safari <= 14 o
      simulcast_sub Chrome o
      simulcast_sub Firefox o
      simulcast_sub Safari <= 12.1 o
      simulcast_sub Safari 12.0 o ※H.264 のみ
    **/
    if (typeof video !== "boolean" && video.codec_type === "VP9") {
        return false;
    }
    if ((role === "upstream" || role === "sendrecv" || role === "sendonly") && browser() === "firefox") {
        return false;
    }
    if (browser() === "safari") {
        const appVersion = window.navigator.appVersion.toLowerCase();
        const versions = /version\/([\d.]+)/.exec(appVersion);
        if (!versions) {
            return false;
        }
        const versionString = versions.pop();
        if (!versionString) {
            return false;
        }
        const version = parseFloat(versionString);
        // 配信の場合は version 14.0 以降であれば有効
        if ((role === "upstream" || role === "sendrecv" || role === "sendonly") && 14.0 <= version) {
            return true;
        }
        // 視聴の場合
        if ((role === "downstream" || role === "recvonly") && 12.1 <= version) {
            // version 12.1 以降であれば有効
            if (12.1 <= version) {
                return true;
            }
            // version が 12.0 の場合 video codec type が H264 であれば有効
            if (12.0 == version && typeof video !== "boolean" && video.codec_type === "H264") {
                return true;
            }
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
        sora_client: `Sora JavaScript SDK ${'2020.4.0'}`,
        environment: window.navigator.userAgent,
        role: role,
        // eslint-disable-next-line @typescript-eslint/camelcase
        channel_id: channelId,
        sdp: offerSDP,
        audio: true,
        video: true,
    };
    if (metadata !== undefined) {
        message.metadata = metadata;
    }
    if ("signalingNotifyMetadata" in options) {
        // eslint-disable-next-line @typescript-eslint/camelcase
        message.signaling_notify_metadata = options.signalingNotifyMetadata;
    }
    if ("multistream" in options && options.multistream === true) {
        // multistream
        message.multistream = true;
        // spotlight
        if ("spotlight" in options) {
            message.spotlight = options.spotlight;
            if ("spotlightNumber" in options) {
                // eslint-disable-next-line @typescript-eslint/camelcase
                message.spotlight_number = options.spotlightNumber;
            }
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
        if (message.video === true) {
            message.video = {};
        }
        if (message.video) {
            message.video["codec_type"] = "VP8";
        }
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
 * @version: 2020.3.0-dev
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/(function(a,b){module.exports=b();})(commonjsGlobal,function(){return class a{constructor(a){const b=!!RTCRtpSender.prototype.createEncodedStreams;if(!b)throw new Error("E2EE is not supported in this browser");this.worker=null,this.masterKey=new TextEncoder().encode(a),this.onWorkerDisconnect=null;}startWorker(){const a=atob("bGV0IG1hc3RlcktleSxtYXRlcmlhbDtjb25zdCBkZXJpdmVLZXlNYXA9bmV3IE1hcCxzZXFOdW1NYXA9bmV3IE1hcCx3cml0ZUlWTWFwPW5ldyBNYXAsc2VxTnVtTGVuZ3RoPTQsc3NyY0xlbmd0aD00LHBhZGRpbmdMZW5ndGg9OCx1bmVuY3J5cHRlZEJ5dGVzPXtrZXk6MTAsZGVsdGE6Myx1bmRlZmluZWQ6MX07ZnVuY3Rpb24gZ2V0U2VxTnVtKGEpe3JldHVybiBzZXFOdW1NYXAuZ2V0KGEpfHwwfWZ1bmN0aW9uIHNldFNlcU51bShhLGIpe3NlcU51bU1hcC5zZXQoYSxiKX1hc3luYyBmdW5jdGlvbiBnZW5lcmF0ZURlcml2ZUtleShhLGIpe2xldCBjPWRlcml2ZUtleU1hcC5nZXQoYSk7cmV0dXJuIGN8fChjPWF3YWl0IGNyeXB0by5zdWJ0bGUuZGVyaXZlS2V5KHtuYW1lOiJQQktERjIiLHNhbHQ6YixpdGVyYXRpb25zOjFlNCxoYXNoOiJTSEEtMjU2In0sbWF0ZXJpYWwse25hbWU6IkFFUy1HQ00iLGxlbmd0aDoxMjh9LCExLFsiZW5jcnlwdCIsImRlY3J5cHQiXSksZGVyaXZlS2V5TWFwLnNldChhLGMpKSxjfWFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlSVYoYSxiLGMpe2xldCBkPXdyaXRlSVZNYXAuZ2V0KGEpO2lmKCFkKXtjb25zdCBjPWF3YWl0IGNyeXB0by5zdWJ0bGUuZGVyaXZlQml0cyh7bmFtZToiUEJLREYyIixzYWx0OmIsaXRlcmF0aW9uczoxZTQsaGFzaDp7bmFtZToiU0hBLTM4NCJ9fSxtYXRlcmlhbCw5Nik7ZD1uZXcgVWludDhBcnJheShjKSx3cml0ZUlWTWFwLnNldChhLGQpfWNvbnN0IGU9bmV3IFVpbnQ4QXJyYXkocGFkZGluZ0xlbmd0aCtzZXFOdW1MZW5ndGgpO2Uuc2V0KG5ldyBVaW50OEFycmF5KGMuYnVmZmVyKSxwYWRkaW5nTGVuZ3RoKTtjb25zdCBmPW5ldyBVaW50OEFycmF5KGUuYnl0ZUxlbmd0aCk7Zm9yKGxldCBnPTA7ZzxlLmJ5dGVMZW5ndGg7ZysrKWZbZ109ZVtnXV5kW2ddO3JldHVybiBmfWFzeW5jIGZ1bmN0aW9uIGVuY3J5cHRGdW5jdGlvbihhLGIpe2NvbnN0IGM9YS5zeW5jaHJvbml6YXRpb25Tb3VyY2UsZD1VaW50MzJBcnJheS5vZihjKSxlPWdldFNlcU51bShjKTtlPj00Mjk0OTY3Mjk2JiZwb3N0TWVzc2FnZSh7b3BlcmF0aW9uOiJkaXNjb25uZWN0In0pO2NvbnN0IGY9VWludDMyQXJyYXkub2YoZSksZz1hd2FpdCBnZW5lcmF0ZURlcml2ZUtleShjLGQpLGg9YXdhaXQgZ2VuZXJhdGVJVihjLGQsZiksaT1hd2FpdCBjcnlwdG8uc3VidGxlLmVuY3J5cHQoe25hbWU6IkFFUy1HQ00iLGl2OmgsYWRkaXRpb25hbERhdGE6bmV3IFVpbnQ4QXJyYXkoYS5kYXRhLDAsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKX0sZyxuZXcgVWludDhBcnJheShhLmRhdGEsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKSksaj1uZXcgQXJyYXlCdWZmZXIodW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdK2kuYnl0ZUxlbmd0aCtkLmJ5dGVMZW5ndGgrZi5ieXRlTGVuZ3RoKSxrPW5ldyBVaW50OEFycmF5KGopO2suc2V0KG5ldyBVaW50OEFycmF5KGEuZGF0YSwwLHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXSkpLGsuc2V0KG5ldyBVaW50OEFycmF5KGkpLHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXSksay5zZXQobmV3IFVpbnQ4QXJyYXkoZC5idWZmZXIpLHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXStpLmJ5dGVMZW5ndGgpLGsuc2V0KG5ldyBVaW50OEFycmF5KGYuYnVmZmVyKSx1bmVuY3J5cHRlZEJ5dGVzW2EudHlwZV0raS5ieXRlTGVuZ3RoK2QuYnl0ZUxlbmd0aCksYS5kYXRhPWosYi5lbnF1ZXVlKGEpLHNldFNlcU51bShjLGUrMSl9YXN5bmMgZnVuY3Rpb24gZGVjcnlwdEZ1bmN0aW9uKGEsYil7Y29uc3QgYz1hLmRhdGEuc2xpY2UoYS5kYXRhLmJ5dGVMZW5ndGgtKHNzcmNMZW5ndGgrc2VxTnVtTGVuZ3RoKSxhLmRhdGEuYnl0ZUxlbmd0aCksZD1jLnNsaWNlKDAsc3NyY0xlbmd0aCksZT1uZXcgVWludDMyQXJyYXkoZCksZj1jLnNsaWNlKHNzcmNMZW5ndGgsYy5ieXRlTGVuZ3RoKSxnPW5ldyBVaW50MzJBcnJheShmKSxoPWVbMF0saT1hd2FpdCBnZW5lcmF0ZURlcml2ZUtleShoLGUpLGo9YXdhaXQgZ2VuZXJhdGVJVihoLGUsZyksaz11bmVuY3J5cHRlZEJ5dGVzW2EudHlwZV0sbD1hLmRhdGEuYnl0ZUxlbmd0aC0odW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdK3NzcmNMZW5ndGgrc2VxTnVtTGVuZ3RoKTtsZXQgbTt0cnl7bT1hd2FpdCBjcnlwdG8uc3VidGxlLmRlY3J5cHQoe25hbWU6IkFFUy1HQ00iLGl2OmosYWRkaXRpb25hbERhdGE6bmV3IFVpbnQ4QXJyYXkoYS5kYXRhLDAsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKX0saSxuZXcgVWludDhBcnJheShhLmRhdGEsayxsKSl9Y2F0Y2goYyl7aWYoYS50eXBlPT09dm9pZCAwKXtjb25zdCBiPW5ldyBBcnJheUJ1ZmZlcigzKSxjPW5ldyBVaW50OEFycmF5KGIpO2Muc2V0KFsyMTYsMjU1LDI1NF0pLGEuZGF0YT1ifWVsc2V7Y29uc3QgYj1uZXcgQXJyYXlCdWZmZXIoNjApLGM9bmV3IFVpbnQ4QXJyYXkoYik7Yy5zZXQoWzE3Niw1LDAsMTU3LDEsNDIsMTYwLDAsOTAsMCw1NywzLDAsMCwyOCwzNCwyMiwyMiwzNCwxMDIsMTgsMzIsNCwxNDQsNjQsMCwxOTcsMSwyMjQsMTI0LDc3LDQ3LDI1MCwyMjEsNzcsMTY1LDEyNywxMzcsMTY1LDI1NSw5MSwxNjksMTgwLDE3NSwyNDEsNTIsMTkxLDIzNSwxMTcsNTQsMTQ5LDI1NCwzOCwxNTAsOTYsMjU0LDI1NSwxODYsMjU1LDY0XSksYS5kYXRhPWJ9cmV0dXJuIHZvaWQgYi5lbnF1ZXVlKGEpfWNvbnN0IG49bmV3IEFycmF5QnVmZmVyKHVuZW5jcnlwdGVkQnl0ZXNbYS50eXBlXSttLmJ5dGVMZW5ndGgpLG89bmV3IFVpbnQ4QXJyYXkobik7by5zZXQobmV3IFVpbnQ4QXJyYXkoYS5kYXRhLDAsdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKSksby5zZXQobmV3IFVpbnQ4QXJyYXkobSksdW5lbmNyeXB0ZWRCeXRlc1thLnR5cGVdKSxhLmRhdGE9bixiLmVucXVldWUoYSl9b25tZXNzYWdlPWFzeW5jIGE9Pntjb25zdHtvcGVyYXRpb246Yn09YS5kYXRhO2lmKCJlbmNyeXB0Ij09PWIpe2NvbnN0e3JlYWRhYmxlU3RyZWFtOmIsd3JpdGFibGVTdHJlYW06Y309YS5kYXRhLGQ9bmV3IFRyYW5zZm9ybVN0cmVhbSh7dHJhbnNmb3JtOmVuY3J5cHRGdW5jdGlvbn0pO2IucGlwZVRocm91Z2goZCkucGlwZVRvKGMpfWVsc2UgaWYoImRlY3J5cHQiPT09Yil7Y29uc3R7cmVhZGFibGVTdHJlYW06Yix3cml0YWJsZVN0cmVhbTpjfT1hLmRhdGEsZD1uZXcgVHJhbnNmb3JtU3RyZWFtKHt0cmFuc2Zvcm06ZGVjcnlwdEZ1bmN0aW9ufSk7Yi5waXBlVGhyb3VnaChkKS5waXBlVG8oYyl9ZWxzZSJzZXRLZXkiPT09Yj8obWFzdGVyS2V5PWEuZGF0YS5tYXN0ZXJLZXksbWF0ZXJpYWw9YXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoInJhdyIsbWFzdGVyS2V5LCJQQktERjIiLCExLFsiZGVyaXZlQml0cyIsImRlcml2ZUtleSJdKSk6ImNsZWFyIj09PWImJihkZXJpdmVLZXlNYXAuY2xlYXIoKSxzZXFOdW1NYXAuY2xlYXIoKSx3cml0ZUlWTWFwLmNsZWFyKCkpfTsK");this.worker=new Worker(URL.createObjectURL(new Blob([a],{type:"application/javascript"}))),this.worker.onmessage=a=>{const{operation:b}=a.data;"disconnect"===b&&"function"==typeof this.onWorkerDisconnect&&this.onWorkerDisconnect();},this.worker.postMessage({operation:"setKey",masterKey:this.masterKey});}terminateWorker(){this.worker&&this.worker.terminate();}setupSenderTransform(a){if(!a.track)return;const b=a.createEncodedStreams(),c=b.readableStream||b.readable,d=b.writableStream||b.writable;this.worker&&this.worker.postMessage({operation:"encrypt",readableStream:c,writableStream:d},[c,d]);}setupReceiverTransform(a){const b=a.createEncodedStreams(),c=b.readableStream||b.readable,d=b.writableStream||b.writable;this.worker&&this.worker.postMessage({operation:"decrypt",readableStream:c,writableStream:d},[c,d]);}static version(){return "2020.3.0-dev"}}});

});

class ConnectionBase {
    constructor(signalingUrl, role, channelId, metadata, options, debug) {
        this.role = role;
        this.channelId = channelId;
        this.metadata = metadata;
        this.signalingUrl = signalingUrl;
        this.options = options;
        // client timeout の初期値をセットする
        if (this.options.timeout === undefined) {
            this.options.timeout = 60000;
        }
        this.constraints = null;
        this.debug = debug;
        this.clientId = null;
        this.connectionId = null;
        this.remoteConnectionIds = [];
        this.stream = null;
        this.ws = null;
        this.pc = null;
        this.callbacks = {
            disconnect: () => { },
            push: () => { },
            addstream: () => { },
            track: () => { },
            removestream: () => { },
            removetrack: () => { },
            notify: () => { },
            log: () => { },
            timeout: () => { },
        };
        this.authMetadata = null;
        this.e2ee = null;
    }
    on(kind, callback) {
        // @deprecated message
        if (kind === "addstream") {
            console.warn("@deprecated addstream callback will be removed in a future version. Use track callback.");
        }
        else if (kind === "removestream") {
            console.warn("@deprecated removestream callback will be removed in a future version. Use removetrack callback.");
        }
        if (kind in this.callbacks) {
            this.callbacks[kind] = callback;
        }
    }
    disconnect() {
        this.clientId = null;
        this.connectionId = null;
        this.authMetadata = null;
        this.remoteConnectionIds = [];
        const closeStream = new Promise((resolve, _) => {
            if (this.debug) {
                console.warn("@deprecated closing MediaStream in disconnect will be removed in a future version. Close every track in the MediaStream by yourself.");
            }
            if (!this.stream)
                return resolve();
            this.stream.getTracks().forEach((t) => {
                t.stop();
            });
            this.stream = null;
            return resolve();
        });
        const closeWebSocket = new Promise((resolve, _reject) => {
            if (!this.ws)
                return resolve();
            if (this.ws.readyState === 1) {
                this.ws.send(JSON.stringify({ type: "disconnect" }));
            }
            this.ws.close();
            this.ws = null;
            return resolve();
        });
        const closePeerConnection = new Promise((resolve, _reject) => {
            if (!this.pc || this.pc.connectionState === "closed" || this.pc.connectionState === undefined)
                return resolve();
            let counter = 50;
            const timerId = setInterval(() => {
                if (!this.pc) {
                    clearInterval(timerId);
                    return resolve();
                }
                if (this.pc.connectionState === "closed") {
                    clearInterval(timerId);
                    this.pc = null;
                    return resolve();
                }
                --counter;
                if (counter < 0) {
                    clearInterval(timerId);
                    return resolve();
                }
            }, 100);
            this.pc.close();
        });
        if (this.e2ee) {
            this.e2ee.terminateWorker();
            this.e2ee = null;
        }
        return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
    }
    startE2EE() {
        if ("e2ee" in this.options && typeof this.options.e2ee === "string") {
            this.e2ee = new sora_e2ee_min(this.options.e2ee);
            this.e2ee.onWorkerDisconnect = () => {
                this.disconnect();
            };
            this.e2ee.startWorker();
        }
    }
    signaling(offer) {
        this.trace("CREATE OFFER SDP", offer);
        return new Promise((resolve, reject) => {
            const signalingMessage = createSignalingMessage(offer.sdp || "", this.role, this.channelId, this.metadata, this.options);
            if (this.ws === null) {
                this.ws = new WebSocket(this.signalingUrl);
            }
            this.ws.onclose = (event) => {
                const error = new Error();
                error.message = `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`;
                reject(error);
            };
            this.ws.onopen = () => {
                this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
                if (this.ws) {
                    this.ws.send(JSON.stringify(signalingMessage));
                }
            };
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type == "offer") {
                    this.clientId = data.client_id;
                    this.connectionId = data.connection_id;
                    if (this.ws) {
                        this.ws.onclose = (e) => {
                            this.callbacks.disconnect(e);
                            this.disconnect();
                        };
                        this.ws.onerror = null;
                    }
                    if ("metadata" in data) {
                        this.authMetadata = data.metadata;
                    }
                    this.trace("SIGNALING OFFER MESSAGE", data);
                    this.trace("OFFER SDP", data.sdp);
                    resolve(data);
                }
                else if (data.type == "update") {
                    this.trace("UPDATE SDP", data.sdp);
                    this.update(data);
                }
                else if (data.type == "ping") {
                    if (data.stats) {
                        this.getStats().then((stats) => {
                            if (this.ws) {
                                this.ws.send(JSON.stringify({ type: "pong", stats: stats }));
                            }
                        });
                    }
                    else {
                        if (this.ws) {
                            this.ws.send(JSON.stringify({ type: "pong" }));
                        }
                    }
                }
                else if (data.type == "push") {
                    this.callbacks.push(data);
                }
                else if (data.type == "notify") {
                    this.callbacks.notify(data);
                }
            };
        });
    }
    async createOffer() {
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
    async connectPeerConnection(message) {
        const messageConfig = message.config || {};
        let config = messageConfig;
        if (this.e2ee) {
            // @ts-ignore
            config["encodedInsertableStreams"] = true;
        }
        if (window.RTCPeerConnection.generateCertificate !== undefined) {
            const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
            config = Object.assign({ certificates: [certificate] }, messageConfig);
        }
        this.trace("PEER CONNECTION CONFIG", config);
        this.pc = new window.RTCPeerConnection(config, this.constraints);
        this.pc.oniceconnectionstatechange = (_) => {
            if (this.pc) {
                this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
            }
        };
        return;
    }
    async setRemoteDescription(message) {
        if (!this.pc) {
            return;
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: message.sdp }));
        return;
    }
    async createAnswer(message) {
        if (!this.pc) {
            return;
        }
        // simulcast の場合
        if (this.options.simulcast &&
            (this.role === "upstream" || this.role === "sendrecv" || this.role === "sendonly") &&
            message.encodings) {
            const transceiver = this.pc.getTransceivers().find((t) => {
                if (t.mid && 0 <= t.mid.indexOf("video") && t.currentDirection == null) {
                    return t;
                }
            });
            if (!transceiver) {
                throw new Error("Simulcast Error");
            }
            await this.setSenderParameters(transceiver, message.encodings);
            await this.setRemoteDescription(message);
            // setRemoteDescription 後でないと active が反映されないのでもう一度呼ぶ
            await this.setSenderParameters(transceiver, message.encodings);
        }
        const sessionDescription = await this.pc.createAnswer();
        await this.pc.setLocalDescription(sessionDescription);
        return;
    }
    sendAnswer() {
        if (this.pc && this.ws && this.pc.localDescription) {
            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
            this.ws.send(JSON.stringify({ type: "answer", sdp: this.pc.localDescription.sdp }));
        }
        return;
    }
    sendUpdateAnswer() {
        if (this.pc && this.ws && this.pc.localDescription) {
            this.trace("ANSWER SDP", this.pc.localDescription.sdp);
            this.ws.send(JSON.stringify({ type: "update", sdp: this.pc.localDescription.sdp }));
        }
        return;
    }
    onIceCandidate() {
        return new Promise((resolve, reject) => {
            const timerId = setInterval(() => {
                if (this.pc === null) {
                    clearInterval(timerId);
                    const error = new Error();
                    error.message = "ICECANDIDATE TIMEOUT";
                    reject(error);
                }
                else if (this.pc && this.pc.iceConnectionState === "connected") {
                    clearInterval(timerId);
                    resolve();
                }
            }, 100);
            if (this.pc) {
                this.pc.onicecandidate = (event) => {
                    if (this.pc) {
                        this.trace("ONICECANDIDATE ICEGATHERINGSTATE", this.pc.iceGatheringState);
                    }
                    if (event.candidate === null) {
                        clearInterval(timerId);
                        resolve();
                    }
                    else {
                        const candidate = event.candidate.toJSON();
                        const message = Object.assign(candidate, { type: "candidate" });
                        this.trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
                        if (this.ws) {
                            this.ws.send(JSON.stringify(message));
                        }
                    }
                };
            }
        });
    }
    waitChangeConnectionStateConnected() {
        return new Promise((resolve, reject) => {
            // connectionState が存在しない場合はそのまま抜ける
            if (this.pc && this.pc.connectionState === undefined) {
                resolve();
            }
            const timerId = setInterval(() => {
                if (!this.pc) {
                    const error = new Error();
                    error.message = "PeerConnection connectionState did not change to 'connected'";
                    clearInterval(timerId);
                    reject(error);
                }
                else if (!this.ws || this.ws.readyState !== 1) {
                    const error = new Error();
                    error.message = "PeerConnection connectionState did not change to 'connected'";
                    clearInterval(timerId);
                    reject(error);
                }
                else if (this.pc && this.pc.connectionState === "connected") {
                    clearInterval(timerId);
                    resolve();
                }
            }, 100);
        });
    }
    setConnectionTimeout() {
        return new Promise((_, reject) => {
            if (this.options.timeout && 0 < this.options.timeout) {
                setTimeout(() => {
                    if (this.pc && this.pc.connectionState !== "connected") {
                        const error = new Error();
                        error.message = "CONNECTION TIMEOUT";
                        this.callbacks.timeout();
                        this.disconnect();
                        reject(error);
                    }
                }, this.options.timeout);
            }
        });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trace(title, message) {
        this.callbacks.log(title, message);
        if (!this.debug) {
            return;
        }
        trace(this.clientId, title, message);
    }
    async update(message) {
        await this.setRemoteDescription(message);
        await this.createAnswer(message);
        this.sendUpdateAnswer();
    }
    setSenderParameters(transceiver, encodings) {
        const originalParameters = transceiver.sender.getParameters();
        // @ts-ignore
        originalParameters.encodings = encodings;
        return transceiver.sender.setParameters(originalParameters);
    }
    async getStats() {
        const stats = [];
        if (!this.pc) {
            return stats;
        }
        const reports = await this.pc.getStats();
        reports.forEach((s) => {
            stats.push(s);
        });
        return stats;
    }
}

class ConnectionPublisher extends ConnectionBase {
    async connect(stream) {
        if (this.options.multistream) {
            return await Promise.race([this.multiStream(stream), this.setConnectionTimeout()]);
        }
        else {
            return await Promise.race([this.singleStream(stream), this.setConnectionTimeout()]);
        }
    }
    async singleStream(stream) {
        await this.disconnect();
        this.startE2EE();
        const offer = await this.createOffer();
        const signalingMessage = await this.signaling(offer);
        await this.connectPeerConnection(signalingMessage);
        await this.setRemoteDescription(signalingMessage);
        stream.getTracks().forEach((track) => {
            if (this.pc) {
                this.pc.addTrack(track, stream);
            }
        });
        this.stream = stream;
        await this.createAnswer(signalingMessage);
        this.sendAnswer();
        if (this.pc && this.e2ee) {
            this.pc.getSenders().forEach((sender) => {
                if (this.e2ee) {
                    this.e2ee.setupSenderTransform(sender);
                }
            });
        }
        await this.onIceCandidate();
        await this.waitChangeConnectionStateConnected();
        return stream;
    }
    async multiStream(stream) {
        await this.disconnect();
        this.startE2EE();
        const offer = await this.createOffer();
        const signalingMessage = await this.signaling(offer);
        await this.connectPeerConnection(signalingMessage);
        if (this.pc) {
            this.pc.ontrack = (event) => {
                const stream = event.streams[0];
                if (!stream)
                    return;
                if (stream.id === "default")
                    return;
                if (stream.id === this.connectionId)
                    return;
                if (this.e2ee) {
                    this.e2ee.setupReceiverTransform(event.receiver);
                }
                this.callbacks.track(event);
                stream.onremovetrack = (event) => {
                    this.callbacks.removetrack(event);
                    if (event.target) {
                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
                        const index = this.remoteConnectionIds.indexOf(event.target.id);
                        if (-1 < index) {
                            delete this.remoteConnectionIds[index];
                            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
                            event.stream = event.target;
                            this.callbacks.removestream(event);
                        }
                    }
                };
                if (-1 < this.remoteConnectionIds.indexOf(stream.id))
                    return;
                // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                event.stream = stream;
                this.remoteConnectionIds.push(stream.id);
                this.callbacks.addstream(event);
            };
        }
        await this.setRemoteDescription(signalingMessage);
        stream.getTracks().forEach((track) => {
            if (this.pc) {
                this.pc.addTrack(track, stream);
            }
        });
        this.stream = stream;
        await this.createAnswer(signalingMessage);
        this.sendAnswer();
        if (this.pc && this.e2ee) {
            this.pc.getSenders().forEach((sender) => {
                if (this.e2ee) {
                    this.e2ee.setupSenderTransform(sender);
                }
            });
        }
        await this.onIceCandidate();
        await this.waitChangeConnectionStateConnected();
        return stream;
    }
}

class ConnectionSubscriber extends ConnectionBase {
    async connect() {
        if (this.options.multistream) {
            return await Promise.race([this.multiStream(), this.setConnectionTimeout()]);
        }
        else {
            return await Promise.race([this.singleStream(), this.setConnectionTimeout()]);
        }
    }
    async singleStream() {
        await this.disconnect();
        this.startE2EE();
        const offer = await this.createOffer();
        const signalingMessage = await this.signaling(offer);
        await this.connectPeerConnection(signalingMessage);
        if (this.pc) {
            this.pc.ontrack = (event) => {
                this.stream = event.streams[0];
                const streamId = this.stream.id;
                if (streamId === "default")
                    return;
                if (this.e2ee) {
                    this.e2ee.setupReceiverTransform(event.receiver);
                }
                this.callbacks.track(event);
                this.stream.onremovetrack = (event) => {
                    this.callbacks.removetrack(event);
                    if (event.target) {
                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
                        const index = this.remoteConnectionIds.indexOf(event.target.id);
                        if (-1 < index) {
                            delete this.remoteConnectionIds[index];
                            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
                            event.stream = event.target;
                            this.callbacks.removestream(event);
                        }
                    }
                };
                if (-1 < this.remoteConnectionIds.indexOf(streamId))
                    return;
                // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                event.stream = this.stream;
                this.remoteConnectionIds.push(streamId);
                this.callbacks.addstream(event);
            };
        }
        await this.setRemoteDescription(signalingMessage);
        await this.createAnswer(signalingMessage);
        this.sendAnswer();
        await this.onIceCandidate();
        await this.waitChangeConnectionStateConnected();
        return this.stream || new MediaStream();
    }
    async multiStream() {
        await this.disconnect();
        this.startE2EE();
        const offer = await this.createOffer();
        const signalingMessage = await this.signaling(offer);
        await this.connectPeerConnection(signalingMessage);
        if (this.pc) {
            this.pc.ontrack = (event) => {
                const stream = event.streams[0];
                if (stream.id === "default")
                    return;
                if (stream.id === this.connectionId)
                    return;
                if (this.e2ee) {
                    this.e2ee.setupReceiverTransform(event.receiver);
                }
                this.callbacks.track(event);
                stream.onremovetrack = (event) => {
                    this.callbacks.removetrack(event);
                    if (event.target) {
                        // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
                        const index = this.remoteConnectionIds.indexOf(event.target.id);
                        if (-1 < index) {
                            delete this.remoteConnectionIds[index];
                            // @ts-ignore TODO(yuito): 後方互換のため peerConnection.onremovestream と同じ仕様で残す
                            event.stream = event.target;
                            this.callbacks.removestream(event);
                        }
                    }
                };
                if (-1 < this.remoteConnectionIds.indexOf(stream.id))
                    return;
                // @ts-ignore TODO(yuito): 最新ブラウザでは無くなった API だが後方互換のため残す
                event.stream = stream;
                this.remoteConnectionIds.push(stream.id);
                this.callbacks.addstream(event);
            };
        }
        await this.setRemoteDescription(signalingMessage);
        await this.createAnswer(signalingMessage);
        this.sendAnswer();
        await this.onIceCandidate();
        await this.waitChangeConnectionStateConnected();
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
        console.warn("@deprecated publisher will be removed in a future version. Use sendrecv or sendonly.");
        return new ConnectionPublisher(this.signalingUrl, "upstream", channelId, metadata, options, this.debug);
    }
    // @deprecated 1 年は残します
    subscriber(channelId, metadata = null, options = { audio: true, video: true }) {
        console.warn("@deprecated subscriber will be removed in a future version. Use recvonly.");
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
        return '2020.4.0';
    },
};

export default sora;
