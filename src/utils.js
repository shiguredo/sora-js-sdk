export function trace(clientId: ?string, title: string, value: Object | string) {
  let prefix = '';
  if (window.performance) {
    prefix = '[' + (window.performance.now() / 1000).toFixed(3) + ']';
  }
  if (clientId) {
    prefix = prefix + '[' + clientId + ']';
  }

  if (isEdge()) {
    console.log(prefix + ' ' + title + '\n', value); // eslint-disable-line
  }
  else {
    console.info(prefix + ' ' + title + '\n', value); // eslint-disable-line
  }
}

function browser() {
  const ua = window.navigator.userAgent.toLocaleLowerCase();
  if (ua.indexOf('chrome') !== -1) {
    return 'chrome';
  }
  else if (ua.indexOf('edge') !== -1) {
    return 'edge';
  }
  else if (ua.indexOf('firefox') !== -1) {
    return 'firefox';
  }
  else if (ua.indexOf('safari') !== -1) {
    return 'safari';
  }
  return ;
}

function isPlanB() {
  return browser() === 'chrome' || browser() === 'safari';
}

export function isUnifiedChrome() {
  if (browser() !== 'chrome') {
    return false;
  }
  const ua = window.navigator.userAgent.toLocaleLowerCase();
  const splitedUserAgent = /chrome\/([\d.]+)/.exec(ua);
  if (!splitedUserAgent || splitedUserAgent.length < 2) {
    return false;
  }
  return 71 <= parseInt(splitedUserAgent[1]);
}

export function isEdge() {
  return browser() === 'edge';
}

export function isSafari() {
  return browser() === 'safari';
}

export function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
  const message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    metadata: metadata,
    sdp: offerSDP,
    userAgent: window.navigator.userAgent,
    audio: true,
    video: true
  };
  Object.keys(message).forEach(key => {
    if (message[key] === undefined) {
      message[key] = null;
    }
  });
  // multistream
  if ('multistream' in options && options.multistream === true) {
    message.multistream = true;
    if (!isUnifiedChrome() && isPlanB()) {
      message.plan_b = true;
    }
  }
  // spotlight
  if ('spotlight' in options) {
    message.spotlight = options.spotlight;
  }
  // parse options
  const audioPropertyKeys = ['audioCodecType', 'audioBitRate'];
  const videoPropertyKeys = ['videoCodecType', 'videoBitRate'];
  const copyOptions = Object.assign({}, options);
  Object.keys(copyOptions).forEach(key => {
    if (key === 'audio' && typeof copyOptions[key] === 'boolean') return;
    if (key === 'video' && typeof copyOptions[key] === 'boolean') return;
    if (0 <= audioPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    if (0 <= videoPropertyKeys.indexOf(key) && copyOptions[key] !== null) return;
    delete copyOptions[key];
  });

  if ('audio' in copyOptions) {
    message.audio = copyOptions.audio;
  }
  const hasAudioProperty = Object.keys(copyOptions).some(key => {
    return 0 <= audioPropertyKeys.indexOf(key);
  });
  if (message.audio && hasAudioProperty) {
    message.audio = {};
    if ('audioCodecType' in copyOptions) {
      message.audio['codec_type'] = copyOptions.audioCodecType;
    }
    if ('audioBitRate' in copyOptions) {
      message.audio['bit_rate'] = copyOptions.audioBitRate;
    }
  }

  if ('video' in copyOptions) {
    message.video = copyOptions.video;
  }
  const hasVideoProperty = Object.keys(copyOptions).some(key => {
    return 0 <= videoPropertyKeys.indexOf(key);
  });
  if (message.video && hasVideoProperty) {
    message.video = {};
    if ('videoCodecType' in copyOptions) {
      message.video['codec_type'] = copyOptions.videoCodecType;
    }
    if ('videoBitRate' in copyOptions) {
      message.video['bit_rate'] = copyOptions.videoBitRate;
    }
  }

  return message;
}
