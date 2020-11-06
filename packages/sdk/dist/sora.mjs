/**
 * @sora/sdk
 * undefined
 * @version: 2020.5.0-canary.0-dev
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
        sora_client: `Sora JavaScript SDK ${'2020.5.0-canary.0-dev'}`,
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
    if ("simulcast" in options || "simulcastRid" in options) {
        // simulcast
        if ("simulcast" in options && options.simulcast === true) {
            message.simulcast = true;
        }
        const simalcastRids = ["r0", "r1", "r2"];
        if (options.simulcastRid !== undefined && 0 <= simalcastRids.indexOf(options.simulcastRid)) {
            // eslint-disable-next-line @typescript-eslint/camelcase
            message.simulcast_rid = options.simulcastRid;
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
        console.log(prefix + " " + title + "\n", value); // eslint-disable-line
    }
    else {
        console.info(prefix + " " + title + "\n", value); // eslint-disable-line
    }
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function createCommonjsModule(fn, basedir, module) {
	return module = {
		path: basedir,
		exports: {},
		require: function (path, base) {
			return commonjsRequire(path, (base === undefined || base === null) ? module.path : base);
		}
	}, fn(module, module.exports), module.exports;
}

function commonjsRequire () {
	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
}

var sora_e2ee_min = createCommonjsModule(function (module, exports) {
/**
 * @sora/e2ee
 * undefined
 * @version: 2020.5.0-canary.0-dev
 * @author: Shiguredo Inc.
 * @license: Apache-2.0
 **/(function(a,b){module.exports=b();})(commonjsGlobal,function(){return class a{constructor(){const a=!!RTCRtpSender.prototype.createEncodedStreams;if(!a)throw new Error("E2EE is not supported in this browser.");this.worker=null,this.onWorkerDisconnect=null;}startWorker(){const a=atob("InVzZSBzdHJpY3QiOwovKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnMgKi8KY29uc3QgY29ubmVjdGlvbklkTGVuZ3RoID0gMjY7CmZ1bmN0aW9uIGJ5dGVDb3VudChuKSB7CiAgICBpZiAobiA9PSAwKSB7CiAgICAgICAgcmV0dXJuIDE7CiAgICB9CiAgICAvLyBsb2cyNTYoeCkgPSBsb2coeCkgLyBsb2coMjU2KQogICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5sb2cobikgLyBNYXRoLmxvZygyICoqIDgpICsgMSk7Cn0KZnVuY3Rpb24gYXJyYXlCdWZmZXJUb051bWJlcihhcnJheUJ1ZmZlcikgewogICAgLy8gMzJiaXQg44G+44Gn44KS5oOz5a6aIChCaWdJbnQg44G444Gu5pu444GN5o+b44GI5pmC44Gr6KaB5L+u5q2jKQogICAgY29uc3QgbmV3QXJyYXlCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpOwogICAgY29uc3QgbmV3RGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcobmV3QXJyYXlCdWZmZXIpOwogICAgY29uc3QgZGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoYXJyYXlCdWZmZXIpOwogICAgY29uc3QgcGFkZGluZ0xlbmd0aCA9IFVpbnQzMkFycmF5LkJZVEVTX1BFUl9FTEVNRU5UIC0gZGF0YVZpZXcuYnl0ZUxlbmd0aDsKICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcGFkZGluZ0xlbmd0aDsgaSArPSAxKSB7CiAgICAgICAgbmV3RGF0YVZpZXcuc2V0VWludDgoaSwgMCk7CiAgICB9CiAgICBmb3IgKGxldCBpID0gcGFkZGluZ0xlbmd0aCwgaiA9IDA7IGkgPCBVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDsgaSArPSAxLCBqICs9IDEpIHsKICAgICAgICBuZXdEYXRhVmlldy5zZXRVaW50OChpLCBkYXRhVmlldy5nZXRVaW50OChqKSk7CiAgICB9CiAgICByZXR1cm4gbmV3RGF0YVZpZXcuZ2V0VWludDMyKDApOwp9CmZ1bmN0aW9uIGVuY29kZVNGcmFtZUhlYWRlcihzLCBjb3VudCwga2V5SWQpIHsKICAgIC8vICAwIDEgMiAzIDQgNSA2IDcKICAgIC8vICstKy0rLSstKy0rLSstKy0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsKICAgIC8vIHxTfExFTiAgfDF8S0xFTiB8ICAgS0lELi4uIChsZW5ndGg9S0xFTikgICAgfCAgICBDVFIuLi4gKGxlbmd0aD1MRU4pICAgIHwKICAgIC8vICstKy0rLSstKy0rLSstKy0rLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSsKICAgIC8vIFM6IDEgYml0CiAgICAvLyBMRU46IDMgYml0CiAgICAvLyBYOiAxIGJpdAogICAgLy8gS0xFTjogMyBiaXQKICAgIC8vIEtJRDogS0xFTiBieXRlCiAgICAvLyBDVFI6IExFTiBieXRlCiAgICAvLyBUT0RPOiBrZXlJZCAoS0lEKSDjgYwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIDcgYnl0ZSDjgpLotoXjgYjjgabjgYTjgZ/loLTlkIjjga/jgqjjg6njg7zjgYvkvovlpJYKICAgIC8vIFRPRE86IGNvdW50IChDVFIpIOOBjCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgNyBieXRlIOOCkui2heOBiOOBpuOBhOOBn+WgtOWQiOOBr+OCqOODqeODvOOBi+S+i+WklgogICAgaWYgKG1heEtleUlkIDwga2V5SWQgfHwgbWF4Q291bnQgPCBjb3VudCkgewogICAgICAgIHRocm93IG5ldyBFcnJvcigiRVhDRUVERUQtTUFYSU1VTS1CUk9BRENBU1RJTkctVElNRSIpOwogICAgfQogICAgY29uc3Qga2xlbiA9IGJ5dGVDb3VudChrZXlJZCk7CiAgICBjb25zdCBsZW4gPSBieXRlQ291bnQoY291bnQpOwogICAgY29uc3QgaGVhZGVyQnVmZmVyID0gbmV3IEFycmF5QnVmZmVyKDEgKyBrbGVuICsgbGVuKTsKICAgIGNvbnN0IGhlYWRlckRhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGhlYWRlckJ1ZmZlcik7CiAgICAvLyBTLCBMRU4sIDEsIEtMRU4g44GnIDEgYnl0ZQogICAgaGVhZGVyRGF0YVZpZXcuc2V0VWludDgoMCwgKHMgPDwgNykgKyAobGVuIDw8IDQpICsgKDEgPDwgMykgKyBrbGVuKTsKICAgIGNvbnN0IGhlYWRlclVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShoZWFkZXJCdWZmZXIpOwogICAgY29uc3Qga2V5SWRCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQpOwogICAgY29uc3Qga2V5SWREYXRhVmlldyA9IG5ldyBEYXRhVmlldyhrZXlJZEJ1ZmZlcik7CiAgICBrZXlJZERhdGFWaWV3LnNldFVpbnQzMigwLCBrZXlJZCk7CiAgICBjb25zdCBrZXlJZFVpbnQ4QXJyYXkgPSBuZXcgVWludDhBcnJheShrZXlJZEJ1ZmZlcik7CiAgICBoZWFkZXJVaW50OEFycmF5LnNldChrZXlJZFVpbnQ4QXJyYXkuc3ViYXJyYXkoVWludDMyQXJyYXkuQllURVNfUEVSX0VMRU1FTlQgLSBrbGVuKSwgMSk7CiAgICBjb25zdCBjb3VudEJ1ZmZlciA9IG5ldyBBcnJheUJ1ZmZlcihVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCk7CiAgICBjb25zdCBjb3VudERhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGNvdW50QnVmZmVyKTsKICAgIGNvdW50RGF0YVZpZXcuc2V0VWludDMyKDAsIGNvdW50KTsKICAgIGNvbnN0IGNvdW50VWludDhBcnJheSA9IG5ldyBVaW50OEFycmF5KGNvdW50QnVmZmVyKTsKICAgIGhlYWRlclVpbnQ4QXJyYXkuc2V0KGNvdW50VWludDhBcnJheS5zdWJhcnJheShVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVCAtIGxlbiksIGtsZW4gKyAxKTsKICAgIHJldHVybiBoZWFkZXJVaW50OEFycmF5Owp9CmZ1bmN0aW9uIHNwbGl0SGVhZGVyKHNmcmFtZSkgewogICAgY29uc3Qgc2ZyYW1lRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoc2ZyYW1lKTsKICAgIGNvbnN0IGhlYWRlciA9IHNmcmFtZURhdGFWaWV3LmdldFVpbnQ4KDApOwogICAgY29uc3QgbGVuID0gKGhlYWRlciAmIDB4NzApID4+IDQ7CiAgICBjb25zdCBrbGVuID0gaGVhZGVyICYgMHgwNzsKICAgIGNvbnN0IHNmcmFtZUhlYWRlckxlbmd0aCA9IDEgKyBrbGVuICsgbGVuOwogICAgY29uc3Qgc2ZyYW1lSGVhZGVyID0gc2ZyYW1lLnNsaWNlKDAsIHNmcmFtZUhlYWRlckxlbmd0aCk7CiAgICBpZiAoc2ZyYW1lSGVhZGVyLmJ5dGVMZW5ndGggPCBzZnJhbWVIZWFkZXJMZW5ndGgpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlVORVhQRUNURUQtU0ZSQU1FLUxFTkdUSCIpOwogICAgfQogICAgY29uc3QgY29ubmVjdGlvbklkID0gc2ZyYW1lLnNsaWNlKHNmcmFtZUhlYWRlckxlbmd0aCwgc2ZyYW1lSGVhZGVyTGVuZ3RoICsgY29ubmVjdGlvbklkTGVuZ3RoKTsKICAgIGNvbnN0IGVuY3J5cHRlZEZyYW1lID0gc2ZyYW1lLnNsaWNlKHNmcmFtZUhlYWRlckxlbmd0aCArIGNvbm5lY3Rpb25JZExlbmd0aCwgc2ZyYW1lLmJ5dGVMZW5ndGgpOwogICAgcmV0dXJuIFtzZnJhbWVIZWFkZXIsIGNvbm5lY3Rpb25JZCwgZW5jcnlwdGVkRnJhbWVdOwp9CmZ1bmN0aW9uIHBhcnNlU0ZyYW1lSGVhZGVyKHNmcmFtZUhlYWRlcikgewogICAgY29uc3Qgc2ZyYW1lSGVhZGVyRGF0YVZpZXcgPSBuZXcgRGF0YVZpZXcoc2ZyYW1lSGVhZGVyKTsKICAgIGNvbnN0IGhlYWRlciA9IHNmcmFtZUhlYWRlckRhdGFWaWV3LmdldFVpbnQ4KDApOwogICAgY29uc3QgcyA9IChoZWFkZXIgJiAweDgwKSA+PiA3OwogICAgY29uc3QgbGVuID0gKGhlYWRlciAmIDB4NzApID4+IDQ7CiAgICBjb25zdCB4ID0gKGhlYWRlciAmIDB4MDgpID4+IDM7CiAgICBjb25zdCBrbGVuID0gaGVhZGVyICYgMHgwNzsKICAgIC8vIHggZmxhZwogICAgaWYgKHggIT09IDEpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlVORVhQRUNURUQtWC1GTEFHIik7CiAgICB9CiAgICBjb25zdCBoZWFkZXJMZW5ndGggPSAxICsga2xlbiArIGxlbjsKICAgIGlmIChzZnJhbWVIZWFkZXJEYXRhVmlldy5ieXRlTGVuZ3RoIDwgaGVhZGVyTGVuZ3RoKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCJVTkVYUEVDVEVELVNGUkFNRS1IRUFERVItTEVOR1RIIik7CiAgICB9CiAgICBjb25zdCBrZXlJZEJ1ZmZlciA9IHNmcmFtZUhlYWRlci5zbGljZSgxLCAxICsga2xlbik7CiAgICBjb25zdCBrZXlJZCA9IGFycmF5QnVmZmVyVG9OdW1iZXIoa2V5SWRCdWZmZXIpOwogICAgY29uc3QgY291bnRCdWZmZXIgPSBzZnJhbWVIZWFkZXIuc2xpY2UoMSArIGtsZW4sIGhlYWRlckxlbmd0aCk7CiAgICBjb25zdCBjb3VudCA9IGFycmF5QnVmZmVyVG9OdW1iZXIoY291bnRCdWZmZXIpOwogICAgcmV0dXJuIFtzLCBjb3VudCwga2V5SWRdOwp9Ci8qIGVzbGludC1kaXNhYmxlIEB0eXBlc2NyaXB0LWVzbGludC90cmlwbGUtc2xhc2gtcmVmZXJlbmNlLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tdW51c2VkLXZhcnMgKi8KLy8vIDxyZWZlcmVuY2UgcGF0aD0iLi9zZnJhbWUudHMiLz4KLy8gVE9ETzog5omx44GG5pWw5YCk44GM5aSn44GN44GE566H5omA44Gn44GvIE51bWJlciDjgYvjgokgQmlnSW50IOOBq+e9ruOBjeaPm+OBiOOCiwovLyBUT0RPOiBCaWdJbnQg44Gr572u44GN5o+b44GI44KL6Zqb44Gr5aSJ5pu044GZ44KLCmNvbnN0IG1heEtleUlkID0gMiAqKiAzMjsKY29uc3QgbWF4Q291bnQgPSAyICoqIDMyOwpjb25zdCBzZWxmRGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwpjb25zdCBjb3VudE1hcCA9IG5ldyBNYXAoKTsKY29uc3Qgd3JpdGVJVk1hcCA9IG5ldyBNYXAoKTsKY29uc3QgcmVtb3RlRGVyaXZlS2V5TWFwID0gbmV3IE1hcCgpOwpjb25zdCBsYXRlc3RSZW1vdGVLZXlJZE1hcCA9IG5ldyBNYXAoKTsKY29uc3QgbGl0dGxlRW5kaWFuID0gdHJ1ZTsKY29uc3QgYmlnRW5kaWFuID0gIWxpdHRsZUVuZGlhbjsKY29uc3QgdGV4dEVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTsKY29uc3QgdGV4dERlY29kZXIgPSBuZXcgVGV4dERlY29kZXIoKTsKLy8gVlA4IOOBruOBvwovLyBUT0RPKG5ha2FpKTogVlA5IC8gQVYxIOOCguWwhuadpeeahOOBq+WvvuW/nOOCguiAg+OBiOOCiwpjb25zdCB1bmVuY3J5cHRlZEJ5dGVzID0gewogICAgLy8gSSDjg5Xjg6zjg7zjg6AKICAgIGtleTogMTAsCiAgICAvLyDpnZ4gSSDjg5Xjg6zjg7zjg6AKICAgIGRlbHRhOiAzLAogICAgLy8g44Kq44O844OH44Kj44KqCiAgICB1bmRlZmluZWQ6IDEsCn07CmZ1bmN0aW9uIGdldENvdW50KGNvbm5lY3Rpb25JZCkgewogICAgcmV0dXJuIGNvdW50TWFwLmdldChjb25uZWN0aW9uSWQpIHx8IDA7Cn0KZnVuY3Rpb24gc2V0Q291bnQoY29ubmVjdGlvbklkLCBjb3VudCkgewogICAgcmV0dXJuIGNvdW50TWFwLnNldChjb25uZWN0aW9uSWQsIGNvdW50KTsKfQpmdW5jdGlvbiBnZXRSZW1vdGVEZXJpdmVLZXkoY29ubmVjdGlvbklkLCBrZXlJZCkgewogICAgaWYgKCFyZW1vdGVEZXJpdmVLZXlNYXAuaGFzKGNvbm5lY3Rpb25JZCkpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIlJFTU9URS1ERVJJVkVLRVktTUFQLU5PVC1GT1VORCIpOwogICAgfQogICAgY29uc3QgZGVyaXZlS2V5TWFwID0gcmVtb3RlRGVyaXZlS2V5TWFwLmdldChjb25uZWN0aW9uSWQpOwogICAgaWYgKCFkZXJpdmVLZXlNYXApIHsKICAgICAgICByZXR1cm4gdW5kZWZpbmVkOwogICAgfQogICAgcmV0dXJuIGRlcml2ZUtleU1hcC5nZXQoa2V5SWQpOwp9CmZ1bmN0aW9uIHNldFJlbW90ZURlcml2ZUtleShjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkpIHsKICAgIGxldCBkZXJpdmVLZXlNYXAgPSByZW1vdGVEZXJpdmVLZXlNYXAuZ2V0KGNvbm5lY3Rpb25JZCk7CiAgICBpZiAoIWRlcml2ZUtleU1hcCkgewogICAgICAgIGRlcml2ZUtleU1hcCA9IG5ldyBNYXAoKTsKICAgIH0KICAgIGRlcml2ZUtleU1hcC5zZXQoa2V5SWQsIGRlcml2ZUtleSk7CiAgICByZW1vdGVEZXJpdmVLZXlNYXAuc2V0KGNvbm5lY3Rpb25JZCwgZGVyaXZlS2V5TWFwKTsKfQpmdW5jdGlvbiBzZXRMYXRlc3RSZW1vdGVLZXlJZChjb25uZWN0aW9uSWQsIGtleUlkKSB7CiAgICBjb25zdCBsYXRlc3RSZW1vdGVLZXlJZCA9IGxhdGVzdFJlbW90ZUtleUlkTWFwLmdldChjb25uZWN0aW9uSWQpOwogICAgaWYgKGxhdGVzdFJlbW90ZUtleUlkKSB7CiAgICAgICAgaWYgKGxhdGVzdFJlbW90ZUtleUlkIDwga2V5SWQpIHsKICAgICAgICAgICAgbGF0ZXN0UmVtb3RlS2V5SWRNYXAuc2V0KGNvbm5lY3Rpb25JZCwga2V5SWQpOwogICAgICAgIH0KICAgIH0KICAgIGVsc2UgewogICAgICAgIGxhdGVzdFJlbW90ZUtleUlkTWFwLnNldChjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgIH0KfQpmdW5jdGlvbiByZW1vdmVPbGRSZW1vdGVEZXJpdmVLZXlzKCkgewogICAgbGF0ZXN0UmVtb3RlS2V5SWRNYXAuZm9yRWFjaCgobGF0ZXN0S2V5SWQsIGNvbm5lY3Rpb25JZCkgPT4gewogICAgICAgIGNvbnN0IGRlcml2ZUtleU1hcCA9IHJlbW90ZURlcml2ZUtleU1hcC5nZXQoY29ubmVjdGlvbklkKTsKICAgICAgICBpZiAoZGVyaXZlS2V5TWFwKSB7CiAgICAgICAgICAgIGRlcml2ZUtleU1hcC5mb3JFYWNoKChfLCBrZXlJZCkgPT4gewogICAgICAgICAgICAgICAgaWYgKGxhdGVzdEtleUlkICE9PSBrZXlJZCkgewogICAgICAgICAgICAgICAgICAgIGRlcml2ZUtleU1hcC5kZWxldGUoa2V5SWQpOwogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9KTsKICAgICAgICB9CiAgICB9KTsKfQpmdW5jdGlvbiByZW1vdmVEZXJpdmVLZXkoY29ubmVjdGlvbklkKSB7CiAgICBsYXRlc3RSZW1vdGVLZXlJZE1hcC5kZWxldGUoY29ubmVjdGlvbklkKTsKICAgIHJlbW90ZURlcml2ZUtleU1hcC5kZWxldGUoY29ubmVjdGlvbklkKTsKfQpmdW5jdGlvbiBnZXRMYXRlc3RTZWxmRGVyaXZlS2V5KCkgewogICAgY29uc3QgZGVyaXZlS2V5ID0gc2VsZkRlcml2ZUtleU1hcC5nZXQoImxhdGVzdCIpOwogICAgaWYgKCFkZXJpdmVLZXkpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIkxBVEVTVC1TRUxGLURFUklWRUtFWS1OT1RfRk9VTkQiKTsKICAgIH0KICAgIHJldHVybiBkZXJpdmVLZXk7Cn0KZnVuY3Rpb24gc2V0U2VsZkRlcml2ZUtleShjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkpIHsKICAgIGNvbnN0IGN1cnJlbnRTZWxmRGVyaXZlS2V5ID0gc2VsZkRlcml2ZUtleU1hcC5nZXQoImxhdGVzdCIpOwogICAgaWYgKGN1cnJlbnRTZWxmRGVyaXZlS2V5KSB7CiAgICAgICAgaWYgKGN1cnJlbnRTZWxmRGVyaXZlS2V5WyJrZXlJZCJdIDwga2V5SWQpIHsKICAgICAgICAgICAgY29uc3QgbmV4dFNlbGZEZXJpdmVLZXkgPSB7IGNvbm5lY3Rpb25JZCwga2V5SWQsIGRlcml2ZUtleSB9OwogICAgICAgICAgICBzZWxmRGVyaXZlS2V5TWFwLnNldCgibGF0ZXN0IiwgbmV4dFNlbGZEZXJpdmVLZXkpOwogICAgICAgIH0KICAgIH0KICAgIGVsc2UgewogICAgICAgIGNvbnN0IG5leHRTZWxmRGVyaXZlS2V5ID0geyBjb25uZWN0aW9uSWQsIGtleUlkLCBkZXJpdmVLZXkgfTsKICAgICAgICBzZWxmRGVyaXZlS2V5TWFwLnNldCgibGF0ZXN0IiwgbmV4dFNlbGZEZXJpdmVLZXkpOwogICAgfQp9CmZ1bmN0aW9uIHNpbGVuY2VGcmFtZShlbmNvZGVkRnJhbWUpIHsKICAgIC8vIGNvbm5lY3Rpb24uY3JlYXRlZCwgcmVjZWl2ZU1lc3NhZ2Ug5Y+X5L+h5YmN44Gu5aC05ZCICiAgICBpZiAoZW5jb2RlZEZyYW1lLnR5cGUgPT09IHVuZGVmaW5lZCkgewogICAgICAgIC8vIOmfs+WjsOOBr+aal+WPt+WMluOBr+OBhOOCi+OBqOiBnuOBkeOBn+OCguOBruOBmOOCg+OBquOBhOOBruOBp+e9ruOBjeaPm+OBiOOCiwogICAgICAgIGNvbnN0IG5ld0RhdGEgPSBuZXcgQXJyYXlCdWZmZXIoMyk7CiAgICAgICAgY29uc3QgbmV3VWludDggPSBuZXcgVWludDhBcnJheShuZXdEYXRhKTsKICAgICAgICAvLyBPcHVzIOOCteOCpOODrOODs+OCueODleODrOODvOODoAogICAgICAgIG5ld1VpbnQ4LnNldChbMHhkOCwgMHhmZiwgMHhmZV0pOwogICAgICAgIGVuY29kZWRGcmFtZS5kYXRhID0gbmV3RGF0YTsKICAgIH0KICAgIGVsc2UgewogICAgICAgIC8vIOaYoOWDj+OBjOato+W4uOOBmOOCg+OBquOBhOOBn+OCgSBQTEkg44K544OI44O844Og44GM55m655Sf44GX44Gm44GX44G+44GGCiAgICAgICAgLy8g44Gd44Gu44Gf44KBIDMyMHgyNDAg44Gu55yf44Gj6buS44Gq55S76Z2i44Gr572u44GN5o+b44GI44KLCiAgICAgICAgY29uc3QgbmV3RGF0YSA9IG5ldyBBcnJheUJ1ZmZlcig2MCk7CiAgICAgICAgY29uc3QgbmV3VWludDggPSBuZXcgVWludDhBcnJheShuZXdEYXRhKTsKICAgICAgICAvLyBwcmV0dGllci1pZ25vcmUKICAgICAgICBuZXdVaW50OC5zZXQoWzB4YjAsIDB4MDUsIDB4MDAsIDB4OWQsIDB4MDEsIDB4MmEsIDB4YTAsIDB4MDAsIDB4NWEsIDB4MDAsCiAgICAgICAgICAgIDB4MzksIDB4MDMsIDB4MDAsIDB4MDAsIDB4MWMsIDB4MjIsIDB4MTYsIDB4MTYsIDB4MjIsIDB4NjYsCiAgICAgICAgICAgIDB4MTIsIDB4MjAsIDB4MDQsIDB4OTAsIDB4NDAsIDB4MDAsIDB4YzUsIDB4MDEsIDB4ZTAsIDB4N2MsCiAgICAgICAgICAgIDB4NGQsIDB4MmYsIDB4ZmEsIDB4ZGQsIDB4NGQsIDB4YTUsIDB4N2YsIDB4ODksIDB4YTUsIDB4ZmYsCiAgICAgICAgICAgIDB4NWIsIDB4YTksIDB4YjQsIDB4YWYsIDB4ZjEsIDB4MzQsIDB4YmYsIDB4ZWIsIDB4NzUsIDB4MzYsCiAgICAgICAgICAgIDB4OTUsIDB4ZmUsIDB4MjYsIDB4OTYsIDB4NjAsIDB4ZmUsIDB4ZmYsIDB4YmEsIDB4ZmYsIDB4NDAsCiAgICAgICAgXSk7CiAgICAgICAgZW5jb2RlZEZyYW1lLmRhdGEgPSBuZXdEYXRhOwogICAgfQogICAgcmV0dXJuIGVuY29kZWRGcmFtZTsKfQpmdW5jdGlvbiBzZXRXcml0ZUlWKGNvbm5lY3Rpb25JZCwga2V5SWQsIHdyaXRlSVYpIHsKICAgIGNvbnN0IGtleSA9IFtjb25uZWN0aW9uSWQsIGtleUlkLnRvU3RyaW5nKCldLmpvaW4oIjoiKTsKICAgIHdyaXRlSVZNYXAuc2V0KGtleSwgd3JpdGVJVik7Cn0KZnVuY3Rpb24gZ2V0V3JpdGVJVihjb25uZWN0aW9uSWQsIGtleUlkKSB7CiAgICBjb25zdCBrZXkgPSBbY29ubmVjdGlvbklkLCBrZXlJZC50b1N0cmluZygpXS5qb2luKCI6Iik7CiAgICByZXR1cm4gd3JpdGVJVk1hcC5nZXQoa2V5KTsKfQpmdW5jdGlvbiBnZW5lcmF0ZUlWKGNvdW50LCBjb25uZWN0aW9uSWQsIGtleUlkKSB7CiAgICAvLyBUT0RPOiBrZXlJZCDjgYwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIDcgYnl0ZSDjgpLotoXjgYjjgabjgYTjgZ/loLTlkIjjga/jgqjjg6njg7zjgYvkvovlpJYKICAgIC8vIFRPRE86IGNvdW50IOOBjCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgNyBieXRlIOOCkui2heOBiOOBpuOBhOOBn+WgtOWQiOOBr+OCqOODqeODvOOBi+S+i+WklgogICAgLy8gMzIgYml0IOOBvuOBpwogICAgaWYgKG1heEtleUlkIDwga2V5SWQgfHwgbWF4Q291bnQgPCBjb3VudCkgewogICAgICAgIHRocm93IG5ldyBFcnJvcigiRVhDRUVERUQtTUFYSU1VTS1CUk9BRENBU1RJTkctVElNRSIpOwogICAgfQogICAgY29uc3Qgd3JpdGVJViA9IGdldFdyaXRlSVYoY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICBpZiAoIXdyaXRlSVYpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoIldSSVRFSVYtTk9ULUZPVU5EIik7CiAgICB9CiAgICBjb25zdCBwYWRkaW5nTGVuZ3RoID0gTm4gLSBVaW50MzJBcnJheS5CWVRFU19QRVJfRUxFTUVOVDsKICAgIGNvbnN0IGNvdW50V2l0aFBhZGRpbmdCdWZmZXIgPSBuZXcgQXJyYXlCdWZmZXIoTm4pOwogICAgY29uc3QgY291bnRXaXRoUGFkZGluZ0RhdGFWaWV3ID0gbmV3IERhdGFWaWV3KGNvdW50V2l0aFBhZGRpbmdCdWZmZXIpOwogICAgY291bnRXaXRoUGFkZGluZ0RhdGFWaWV3LnNldFVpbnQzMihwYWRkaW5nTGVuZ3RoLCBjb3VudCwgYmlnRW5kaWFuKTsKICAgIGNvbnN0IGl2ID0gbmV3IFVpbnQ4QXJyYXkoTm4pOwogICAgY29uc3QgY291bnRXaXRoUGFkZGluZyA9IG5ldyBVaW50OEFycmF5KGNvdW50V2l0aFBhZGRpbmdCdWZmZXIpOwogICAgZm9yIChsZXQgaSA9IDA7IGkgPCBObjsgaSsrKSB7CiAgICAgICAgaXZbaV0gPSB3cml0ZUlWW2ldIF4gY291bnRXaXRoUGFkZGluZ1tpXTsKICAgIH0KICAgIHJldHVybiBpdjsKfQpmdW5jdGlvbiBwYXJzZVBheWxvYWQocGF5bG9hZFR5cGUsIHBheWxvYWQpIHsKICAgIHJldHVybiBbCiAgICAgICAgbmV3IFVpbnQ4QXJyYXkocGF5bG9hZCwgMCwgdW5lbmNyeXB0ZWRCeXRlc1twYXlsb2FkVHlwZV0pLAogICAgICAgIG5ldyBVaW50OEFycmF5KHBheWxvYWQsIHVuZW5jcnlwdGVkQnl0ZXNbcGF5bG9hZFR5cGVdKSwKICAgIF07Cn0KZnVuY3Rpb24gZW5jb2RlRnJhbWVBZGQoaGVhZGVyLCBzZnJhbWVIZWFkZXIsIGNvbm5lY3Rpb25JZCkgewogICAgY29uc3QgY29ubmVjdGlvbklkRGF0YSA9IHRleHRFbmNvZGVyLmVuY29kZShjb25uZWN0aW9uSWQpOwogICAgY29uc3QgZnJhbWVBZGQgPSBuZXcgVWludDhBcnJheShoZWFkZXIuYnl0ZUxlbmd0aCArIHNmcmFtZUhlYWRlci5ieXRlTGVuZ3RoICsgY29ubmVjdGlvbklkRGF0YS5ieXRlTGVuZ3RoKTsKICAgIGZyYW1lQWRkLnNldChoZWFkZXIsIDApOwogICAgZnJhbWVBZGQuc2V0KHNmcmFtZUhlYWRlciwgaGVhZGVyLmJ5dGVMZW5ndGgpOwogICAgZnJhbWVBZGQuc2V0KGNvbm5lY3Rpb25JZERhdGEsIGhlYWRlci5ieXRlTGVuZ3RoICsgc2ZyYW1lSGVhZGVyLmJ5dGVMZW5ndGgpOwogICAgcmV0dXJuIGZyYW1lQWRkOwp9CmFzeW5jIGZ1bmN0aW9uIGVuY3J5cHRGdW5jdGlvbihlbmNvZGVkRnJhbWUsIGNvbnRyb2xsZXIpIHsKICAgIGNvbnN0IHsgY29ubmVjdGlvbklkLCBrZXlJZCwgZGVyaXZlS2V5IH0gPSBnZXRMYXRlc3RTZWxmRGVyaXZlS2V5KCk7CiAgICBpZiAoIWRlcml2ZUtleSkgewogICAgICAgIGNvbnNvbGUuaW5mbygiREVSSVZFS0VZLU5PVC1GT1VORCIpOwogICAgICAgIHJldHVybjsKICAgIH0KICAgIGNvbnN0IGN1cnJlbnRDb3VudCA9IGdldENvdW50KGNvbm5lY3Rpb25JZCk7CiAgICAvLyBjb3VudCDjgYwgMzIgYml0IOS7peS4iuOBruWgtOWQiOOBr+WBnOatouOBmeOCiwogICAgaWYgKGN1cnJlbnRDb3VudCA+IG1heENvdW50KSB7CiAgICAgICAgcG9zdE1lc3NhZ2UoeyB0eXBlOiAiZGlzY29ubmVjdCIgfSk7CiAgICB9CiAgICBjb25zdCBpdiA9IGdlbmVyYXRlSVYoY3VycmVudENvdW50LCBjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgIGlmICghaXYpIHsKICAgICAgICBjb25zb2xlLmluZm8oIldSSVRFSVYtTk9ULUZPVU5EIik7CiAgICAgICAgcmV0dXJuOwogICAgfQogICAgY29uc3QgW2hlYWRlciwgcGF5bG9hZF0gPSBwYXJzZVBheWxvYWQoZW5jb2RlZEZyYW1lLnR5cGUsIGVuY29kZWRGcmFtZS5kYXRhKTsKICAgIGNvbnN0IHNmcmFtZUhlYWRlciA9IGVuY29kZVNGcmFtZUhlYWRlcigwLCBjdXJyZW50Q291bnQsIGtleUlkKTsKICAgIGNvbnN0IGZyYW1lQWRkID0gZW5jb2RlRnJhbWVBZGQoaGVhZGVyLCBzZnJhbWVIZWFkZXIsIGNvbm5lY3Rpb25JZCk7CiAgICBjcnlwdG8uc3VidGxlCiAgICAgICAgLmVuY3J5cHQoewogICAgICAgIG5hbWU6ICJBRVMtR0NNIiwKICAgICAgICBpdjogaXYsCiAgICAgICAgLy8g5pqX5Y+35YyW44GV44KM44Gm44GE44Gq44GE6YOo5YiGCiAgICAgICAgYWRkaXRpb25hbERhdGE6IGZyYW1lQWRkLAogICAgfSwgZGVyaXZlS2V5LCBwYXlsb2FkKQogICAgICAgIC50aGVuKChjaXBoZXJUZXh0KSA9PiB7CiAgICAgICAgY29uc3QgbmV3RGF0YSA9IG5ldyBBcnJheUJ1ZmZlcihmcmFtZUFkZC5ieXRlTGVuZ3RoICsgY2lwaGVyVGV4dC5ieXRlTGVuZ3RoKTsKICAgICAgICBjb25zdCBuZXdEYXRhVWludDggPSBuZXcgVWludDhBcnJheShuZXdEYXRhKTsKICAgICAgICBuZXdEYXRhVWludDguc2V0KGZyYW1lQWRkLCAwKTsKICAgICAgICBuZXdEYXRhVWludDguc2V0KG5ldyBVaW50OEFycmF5KGNpcGhlclRleHQpLCBmcmFtZUFkZC5ieXRlTGVuZ3RoKTsKICAgICAgICBlbmNvZGVkRnJhbWUuZGF0YSA9IG5ld0RhdGE7CiAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGVuY29kZWRGcmFtZSk7CiAgICB9KTsKICAgIHNldENvdW50KGNvbm5lY3Rpb25JZCwgY3VycmVudENvdW50ICsgMSk7Cn0KYXN5bmMgZnVuY3Rpb24gZGVjcnlwdEZ1bmN0aW9uKGVuY29kZWRGcmFtZSwgY29udHJvbGxlcikgewogICAgLy8g56m644OV44Os44O844Og5a++5b+cCiAgICBpZiAoZW5jb2RlZEZyYW1lLmRhdGEuYnl0ZUxlbmd0aCA8IDEpIHsKICAgICAgICBjb25zb2xlLmluZm8oIkVNUFRZLURBVEEiKTsKICAgICAgICByZXR1cm47CiAgICB9CiAgICB0cnkgewogICAgICAgIGNvbnN0IGZyYW1lTWV0YWRhdGFCdWZmZXIgPSBlbmNvZGVkRnJhbWUuZGF0YS5zbGljZSgwLCB1bmVuY3J5cHRlZEJ5dGVzW2VuY29kZWRGcmFtZS50eXBlXSk7CiAgICAgICAgY29uc3QgZnJhbWVNZXRhZGF0YSA9IG5ldyBVaW50OEFycmF5KGZyYW1lTWV0YWRhdGFCdWZmZXIpOwogICAgICAgIGNvbnN0IFtzZnJhbWVIZWFkZXJCdWZmZXIsIGNvbm5lY3Rpb25JZEJ1ZmZlciwgZW5jcnlwdGVkRnJhbWVCdWZmZXJdID0gc3BsaXRIZWFkZXIoZW5jb2RlZEZyYW1lLmRhdGEuc2xpY2UodW5lbmNyeXB0ZWRCeXRlc1tlbmNvZGVkRnJhbWUudHlwZV0pKTsKICAgICAgICBjb25zdCBzZnJhbWVIZWFkZXIgPSBuZXcgVWludDhBcnJheShzZnJhbWVIZWFkZXJCdWZmZXIpOwogICAgICAgIGNvbnN0IGNvbm5lY3Rpb25JZCA9IHRleHREZWNvZGVyLmRlY29kZShjb25uZWN0aW9uSWRCdWZmZXIpOwogICAgICAgIGNvbnN0IFtzLCBjb3VudCwga2V5SWRdID0gcGFyc2VTRnJhbWVIZWFkZXIoc2ZyYW1lSGVhZGVyQnVmZmVyKTsKICAgICAgICAvLyDku4rlm57jga8gcyBmbGFnIOOBryAwIOOBruOBvwogICAgICAgIGlmIChzICE9PSAwKSB7CiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigiVU5FWFBFQ1RFRC1TLUZMQUciKTsKICAgICAgICB9CiAgICAgICAgY29uc3QgZGVyaXZlS2V5ID0gZ2V0UmVtb3RlRGVyaXZlS2V5KGNvbm5lY3Rpb25JZCwga2V5SWQpOwogICAgICAgIGlmICghZGVyaXZlS2V5KSB7CiAgICAgICAgICAgIGNvbnNvbGUud2FybigiREVSSVZFS0VZLU5PVC1GT1VORDogIiwgY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICAgICAgICAgIHJldHVybjsKICAgICAgICB9CiAgICAgICAgY29uc3QgaXYgPSBnZW5lcmF0ZUlWKGNvdW50LCBjb25uZWN0aW9uSWQsIGtleUlkKTsKICAgICAgICBpZiAoIWl2KSB7CiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygiV1JJVEVJVi1OT1QtRk9VTkQiKTsKICAgICAgICAgICAgcmV0dXJuOwogICAgICAgIH0KICAgICAgICBjb25zdCBmcmFtZUFkZCA9IGVuY29kZUZyYW1lQWRkKGZyYW1lTWV0YWRhdGEsIHNmcmFtZUhlYWRlciwgY29ubmVjdGlvbklkKTsKICAgICAgICBjcnlwdG8uc3VidGxlCiAgICAgICAgICAgIC5kZWNyeXB0KHsKICAgICAgICAgICAgbmFtZTogIkFFUy1HQ00iLAogICAgICAgICAgICBpdjogaXYsCiAgICAgICAgICAgIGFkZGl0aW9uYWxEYXRhOiBmcmFtZUFkZCwKICAgICAgICB9LCBkZXJpdmVLZXksIG5ldyBVaW50OEFycmF5KGVuY3J5cHRlZEZyYW1lQnVmZmVyKSkKICAgICAgICAgICAgLnRoZW4oKHBsYWluVGV4dCkgPT4gewogICAgICAgICAgICBjb25zdCBuZXdEYXRhID0gbmV3IEFycmF5QnVmZmVyKGZyYW1lTWV0YWRhdGFCdWZmZXIuYnl0ZUxlbmd0aCArIHBsYWluVGV4dC5ieXRlTGVuZ3RoKTsKICAgICAgICAgICAgY29uc3QgbmV3VWludDggPSBuZXcgVWludDhBcnJheShuZXdEYXRhKTsKICAgICAgICAgICAgbmV3VWludDguc2V0KG5ldyBVaW50OEFycmF5KGZyYW1lTWV0YWRhdGFCdWZmZXIsIDAsIHVuZW5jcnlwdGVkQnl0ZXNbZW5jb2RlZEZyYW1lLnR5cGVdKSk7CiAgICAgICAgICAgIG5ld1VpbnQ4LnNldChuZXcgVWludDhBcnJheShwbGFpblRleHQpLCB1bmVuY3J5cHRlZEJ5dGVzW2VuY29kZWRGcmFtZS50eXBlXSk7CiAgICAgICAgICAgIGVuY29kZWRGcmFtZS5kYXRhID0gbmV3RGF0YTsKICAgICAgICAgICAgY29udHJvbGxlci5lbnF1ZXVlKGVuY29kZWRGcmFtZSk7CiAgICAgICAgfSk7CiAgICB9CiAgICBjYXRjaCAoZSkgewogICAgICAgIC8vIOaDs+WumuWkluOBruODkeOCseODg+ODiOODleOCqeODvOODnuODg+ODiOOCkuWPl+S/oeOBl+OBn+WgtOWQiAogICAgICAgIGNvbnRyb2xsZXIuZW5xdWV1ZShzaWxlbmNlRnJhbWUoZW5jb2RlZEZyYW1lKSk7CiAgICB9Cn0KLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L3RyaXBsZS1zbGFzaC1yZWZlcmVuY2UgKi8KLy8vIDxyZWZlcmVuY2UgcGF0aD0iLi9lMmVlLnRzIi8+Ci8vIG5vbmNlIOOCteOCpOOCugpjb25zdCBObiA9IDEyOwovLyBrZXkg44K144Kk44K6CmNvbnN0IE5rID0gMTY7Ci8vIGtleSDjgrXjgqTjgrrvvIhiaXTvvIkKY29uc3Qga2V5TGVuZ3RoID0gTmsgKiA4Owphc3luYyBmdW5jdGlvbiBnZW5lcmF0ZURlcml2ZUtleShtYXRlcmlhbCkgewogICAgY29uc3Qgc2FsdCA9IHRleHRFbmNvZGVyLmVuY29kZSgiU0ZyYW1lMTAiKTsKICAgIGNvbnN0IGluZm8gPSB0ZXh0RW5jb2Rlci5lbmNvZGUoImtleSIpOwogICAgY29uc3QgZGVyaXZlS2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kZXJpdmVLZXkoewogICAgICAgIG5hbWU6ICJIS0RGIiwKICAgICAgICBzYWx0OiBzYWx0LAogICAgICAgIGhhc2g6ICJTSEEtMjU2IiwKICAgICAgICBpbmZvOiBpbmZvLAogICAgfSwgbWF0ZXJpYWwsIHsKICAgICAgICBuYW1lOiAiQUVTLUdDTSIsCiAgICAgICAgbGVuZ3RoOiBrZXlMZW5ndGgsCiAgICB9LCBmYWxzZSwgWyJlbmNyeXB0IiwgImRlY3J5cHQiXSk7CiAgICByZXR1cm4gZGVyaXZlS2V5Owp9CmFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlV3JpdGVJVihtYXRlcmlhbCkgewogICAgY29uc3Qgc2FsdCA9IHRleHRFbmNvZGVyLmVuY29kZSgiU0ZyYW1lMTAiKTsKICAgIGNvbnN0IGluZm8gPSB0ZXh0RW5jb2Rlci5lbmNvZGUoInNhbHQiKTsKICAgIGNvbnN0IHdyaXRlSVZCdWZmZXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRlcml2ZUJpdHMoewogICAgICAgIG5hbWU6ICJIS0RGIiwKICAgICAgICBzYWx0OiBzYWx0LAogICAgICAgIGhhc2g6ICJTSEEtMzg0IiwKICAgICAgICBpbmZvOiBpbmZvLAogICAgfSwgbWF0ZXJpYWwsIAogICAgLy8gSVYg44GvIDk2IOODk+ODg+ODiOOBquOBruOBpwogICAgTm4gKiA4KTsKICAgIGNvbnN0IHdyaXRlSVYgPSBuZXcgVWludDhBcnJheSh3cml0ZUlWQnVmZmVyKTsKICAgIHJldHVybiB3cml0ZUlWOwp9CmxldCByZW1vdmFsVGltZW91dElkID0gMDsKb25tZXNzYWdlID0gKGV2ZW50KSA9PiB7CiAgICBjb25zdCB7IHR5cGUgfSA9IGV2ZW50LmRhdGE7CiAgICBpZiAodHlwZSA9PT0gInNlbGZTZWNyZXRLZXlNYXRlcmlhbCIpIHsKICAgICAgICBjb25zdCB7IHNlbGZTZWNyZXRLZXlNYXRlcmlhbCwgc2VsZkNvbm5lY3Rpb25JZCwgc2VsZktleUlkLCB3YWl0aW5nVGltZSB9ID0gZXZlbnQuZGF0YTsKICAgICAgICBjb25zdCB0aW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHsKICAgICAgICAgICAgY3J5cHRvLnN1YnRsZQogICAgICAgICAgICAgICAgLmltcG9ydEtleSgicmF3Iiwgc2VsZlNlY3JldEtleU1hdGVyaWFsLmJ1ZmZlciwgIkhLREYiLCBmYWxzZSwgWyJkZXJpdmVCaXRzIiwgImRlcml2ZUtleSJdKQogICAgICAgICAgICAgICAgLnRoZW4oKG1hdGVyaWFsKSA9PiB7CiAgICAgICAgICAgICAgICBnZW5lcmF0ZURlcml2ZUtleShtYXRlcmlhbCkudGhlbigoZGVyaXZlS2V5KSA9PiB7CiAgICAgICAgICAgICAgICAgICAgc2V0U2VsZkRlcml2ZUtleShzZWxmQ29ubmVjdGlvbklkLCBzZWxmS2V5SWQsIGRlcml2ZUtleSk7CiAgICAgICAgICAgICAgICB9KTsKICAgICAgICAgICAgICAgIGdlbmVyYXRlV3JpdGVJVihtYXRlcmlhbCkudGhlbigod3JpdGVJVikgPT4gewogICAgICAgICAgICAgICAgICAgIHNldFdyaXRlSVYoc2VsZkNvbm5lY3Rpb25JZCwgc2VsZktleUlkLCB3cml0ZUlWKTsKICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXRJZCk7CiAgICAgICAgICAgIH0pOwogICAgICAgIH0sIHdhaXRpbmdUaW1lIHx8IDApOwogICAgICAgIC8vIFRPRE86ICsxMDAwIOOBp+mNteeUn+aIkOW+jOOBq+Wun+ihjOOBleOCjOOCi+OCiOOBhuOBq+OBl+OBpuOBhOOCi+OBjOefreOBhOWgtOWQiOOBr+S8uOOBsOOBmQogICAgICAgIGNvbnN0IHJlbW92YWxXYWl0aW5nVGltZSA9ICh3YWl0aW5nVGltZSB8fCAwKSArIDEwMDA7CiAgICAgICAgaWYgKHJlbW92YWxUaW1lb3V0SWQpIHsKICAgICAgICAgICAgLy8g5YuV5L2c5riI44G/44K/44Kk44Oe44O85pyJ44KKCiAgICAgICAgICAgIGlmICh3YWl0aW5nVGltZSkgewogICAgICAgICAgICAgICAgLy8gY29ubmVjdGlvbi5kZXN0cm95ZWQKICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dChyZW1vdmFsVGltZW91dElkKTsKICAgICAgICAgICAgICAgIHJlbW92YWxUaW1lb3V0SWQgPSBzZXRUaW1lb3V0KCgpID0+IHsKICAgICAgICAgICAgICAgICAgICByZW1vdmVPbGRSZW1vdGVEZXJpdmVLZXlzKCk7CiAgICAgICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHJlbW92YWxUaW1lb3V0SWQpOwogICAgICAgICAgICAgICAgICAgIHJlbW92YWxUaW1lb3V0SWQgPSAwOwogICAgICAgICAgICAgICAgfSwgcmVtb3ZhbFdhaXRpbmdUaW1lKTsKICAgICAgICAgICAgfQogICAgICAgIH0KICAgICAgICBlbHNlIHsKICAgICAgICAgICAgLy8g5YuV5L2c5riI44G/44K/44Kk44Oe44O844Gq44GXCiAgICAgICAgICAgIC8vIGNvbm5lY3Rpb24uY3JlYXRlZCDjga7loLTlkIjjgoLlsJHjgZflrp/ooYzjgpLpgYXjgonjgZvjgosKICAgICAgICAgICAgcmVtb3ZhbFRpbWVvdXRJZCA9IHNldFRpbWVvdXQoKCkgPT4gewogICAgICAgICAgICAgICAgcmVtb3ZlT2xkUmVtb3RlRGVyaXZlS2V5cygpOwogICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHJlbW92YWxUaW1lb3V0SWQpOwogICAgICAgICAgICAgICAgcmVtb3ZhbFRpbWVvdXRJZCA9IDA7CiAgICAgICAgICAgIH0sIHJlbW92YWxXYWl0aW5nVGltZSk7CiAgICAgICAgfQogICAgfQogICAgZWxzZSBpZiAodHlwZSA9PT0gInJlbW90ZVNlY3JldEtleU1hdGVyaWFscyIpIHsKICAgICAgICBjb25zdCB7IHJlbW90ZVNlY3JldEtleU1hdGVyaWFscyB9ID0gZXZlbnQuZGF0YTsKICAgICAgICBmb3IgKGNvbnN0IFtjb25uZWN0aW9uSWQsIHJlbW90ZVNlY3JldEtleU1hdGVyaWFsXSBvZiBPYmplY3QuZW50cmllcyhyZW1vdGVTZWNyZXRLZXlNYXRlcmlhbHMpKSB7CiAgICAgICAgICAgIGNvbnN0IHsga2V5SWQsIHNlY3JldEtleU1hdGVyaWFsIH0gPSByZW1vdGVTZWNyZXRLZXlNYXRlcmlhbDsKICAgICAgICAgICAgY3J5cHRvLnN1YnRsZQogICAgICAgICAgICAgICAgLmltcG9ydEtleSgicmF3Iiwgc2VjcmV0S2V5TWF0ZXJpYWwuYnVmZmVyLCAiSEtERiIsIGZhbHNlLCBbImRlcml2ZUJpdHMiLCAiZGVyaXZlS2V5Il0pCiAgICAgICAgICAgICAgICAudGhlbigobWF0ZXJpYWwpID0+IHsKICAgICAgICAgICAgICAgIGdlbmVyYXRlRGVyaXZlS2V5KG1hdGVyaWFsKS50aGVuKChkZXJpdmVLZXkpID0+IHsKICAgICAgICAgICAgICAgICAgICBzZXRSZW1vdGVEZXJpdmVLZXkoY29ubmVjdGlvbklkLCBrZXlJZCwgZGVyaXZlS2V5KTsKICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICAgICAgZ2VuZXJhdGVXcml0ZUlWKG1hdGVyaWFsKS50aGVuKCh3cml0ZUlWKSA9PiB7CiAgICAgICAgICAgICAgICAgICAgc2V0V3JpdGVJVihjb25uZWN0aW9uSWQsIGtleUlkLCB3cml0ZUlWKTsKICAgICAgICAgICAgICAgIH0pOwogICAgICAgICAgICAgICAgc2V0TGF0ZXN0UmVtb3RlS2V5SWQoY29ubmVjdGlvbklkLCBrZXlJZCk7CiAgICAgICAgICAgIH0pOwogICAgICAgIH0KICAgIH0KICAgIGVsc2UgaWYgKHR5cGUgPT09ICJyZW1vdmVSZW1vdGVEZXJpdmVLZXkiKSB7CiAgICAgICAgY29uc3QgeyBjb25uZWN0aW9uSWQgfSA9IGV2ZW50LmRhdGE7CiAgICAgICAgcmVtb3ZlRGVyaXZlS2V5KGNvbm5lY3Rpb25JZCk7CiAgICB9CiAgICBlbHNlIGlmICh0eXBlID09PSAiZW5jcnlwdCIpIHsKICAgICAgICBjb25zdCB7IHJlYWRhYmxlU3RyZWFtLCB3cml0YWJsZVN0cmVhbSB9ID0gZXZlbnQuZGF0YTsKICAgICAgICBjb25zdCB0cmFuc2Zvcm1TdHJlYW0gPSBuZXcgVHJhbnNmb3JtU3RyZWFtKHsKICAgICAgICAgICAgdHJhbnNmb3JtOiBlbmNyeXB0RnVuY3Rpb24sCiAgICAgICAgfSk7CiAgICAgICAgcmVhZGFibGVTdHJlYW0ucGlwZVRocm91Z2godHJhbnNmb3JtU3RyZWFtKS5waXBlVG8od3JpdGFibGVTdHJlYW0pOwogICAgfQogICAgZWxzZSBpZiAodHlwZSA9PT0gImRlY3J5cHQiKSB7CiAgICAgICAgY29uc3QgeyByZWFkYWJsZVN0cmVhbSwgd3JpdGFibGVTdHJlYW0gfSA9IGV2ZW50LmRhdGE7CiAgICAgICAgY29uc3QgdHJhbnNmb3JtU3RyZWFtID0gbmV3IFRyYW5zZm9ybVN0cmVhbSh7CiAgICAgICAgICAgIHRyYW5zZm9ybTogZGVjcnlwdEZ1bmN0aW9uLAogICAgICAgIH0pOwogICAgICAgIHJlYWRhYmxlU3RyZWFtLnBpcGVUaHJvdWdoKHRyYW5zZm9ybVN0cmVhbSkucGlwZVRvKHdyaXRhYmxlU3RyZWFtKTsKICAgIH0KICAgIGVsc2UgaWYgKHR5cGUgPT09ICJjbGVhciIpIHsKICAgICAgICBjb3VudE1hcC5jbGVhcigpOwogICAgICAgIHdyaXRlSVZNYXAuY2xlYXIoKTsKICAgICAgICByZW1vdGVEZXJpdmVLZXlNYXAuY2xlYXIoKTsKICAgICAgICBzZWxmRGVyaXZlS2V5TWFwLmNsZWFyKCk7CiAgICB9Cn07Cg==");this.worker=new Worker(URL.createObjectURL(new Blob([a],{type:"application/javascript"}))),this.worker.onmessage=a=>{const{operation:b}=a.data;"disconnect"===b&&"function"==typeof this.onWorkerDisconnect&&this.onWorkerDisconnect();};}clearWorker(){this.worker&&this.worker.postMessage({type:"clear"});}terminateWorker(){this.worker&&this.worker.terminate();}async init(){if(!window.Go)throw new Error(`Failed to load module Go. window.Go is ${window.Go}.`);const a=new Go,{instance:b}=await WebAssembly.instantiateStreaming(fetch("wasm.wasm"),a.importObject);if(a.run(b),!window.e2ee)throw new Error(`Failed to load module e2ee. window.e2ee is ${window.e2ee}.`);const{preKeyBundle:c}=await window.e2ee.init();return c}setupSenderTransform(a){if(!a.track)return;const b=a.createEncodedStreams(),c=b.readableStream||b.readable,d=b.writableStream||b.writable;if(!this.worker)throw new Error("Worker is null. Call startWorker in advance.");this.worker.postMessage({type:"encrypt",readableStream:c,writableStream:d},[c,d]);}setupReceiverTransform(a){const b=a.createEncodedStreams(),c=b.readableStream||b.readable,d=b.writableStream||b.writable;if(!this.worker)throw new Error("Worker is null. Call startWorker in advance.");this.worker.postMessage({type:"decrypt",readableStream:c,writableStream:d},[c,d]);}postRemoteSecretKeyMaterials(a){if(!this.worker)throw new Error("Worker is null. Call startWorker in advance.");this.worker.postMessage({type:"remoteSecretKeyMaterials",remoteSecretKeyMaterials:a.remoteSecretKeyMaterials});}postSelfSecretKeyMaterial(a,b,c,d){if(!this.worker)throw new Error("Worker is null. Call startWorker in advance.");this.worker.postMessage({type:"selfSecretKeyMaterial",selfConnectionId:a,selfKeyId:b,selfSecretKeyMaterial:c,waitingTime:d});}startSession(a,b){const[c,d]=window.e2ee.startSession(a,b.identityKey,b.signedPreKey,b.preKeySignature);if(d)throw d;return c}stopSession(a){const[b,c]=window.e2ee.stopSession(a);if(c)throw c;return b}receiveMessage(a){const[b,c]=window.e2ee.receiveMessage(a);if(c)throw c;return b}start(a){const[b,c]=window.e2ee.start(a);if(c)throw c;return b}addPreKeyBundle(a,b){const c=window.e2ee.addPreKeyBundle(a,b.identityKey,b.signedPreKey,b.preKeySignature);if(c)throw c}selfFingerprint(){return window.e2ee.selfFingerprint()}remoteFingerprints(){return window.e2ee.remoteFingerprints()}static version(){return "2020.5.0-canary.0-dev"}static wasmVersion(){return window.e2ee.version()}}});

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
            this.e2ee = new sora_e2ee_min();
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
        return '2020.5.0-canary.0-dev';
    },
};

export default sora;
