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

function userAgent() {
  return window.navigator.userAgent.toLocaleLowerCase();
}

function isPlanB() {
  if (userAgent().indexOf('chrome') !== -1 || userAgent().indexOf('safari') !== -1) {
    return true;
  } else {
    return false;
  }
}

export function isEdge() {
  return userAgent().indexOf('edge') !== -1;
}

export function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
  const message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    metadata: metadata,
    sdp: offerSDP,
    userAgent: window.navigator.userAgent
  };
  Object.keys(message).forEach(key => {
    if (message[key] === undefined) {
      message[key] = null;
    }
  });
  // multistream
  if ('multistream' in options && options.multistream === true) {
    message.multistream = true;
    message.plan_b = isPlanB();
  }
  // create audio params
  let audio = true;
  if ('audio' in options && typeof options.audio === 'boolean') {
    audio = options.audio;
  }
  if (audio) {
    const audioPropertyKeys = ['audioCodecType', 'audioBitRate'];
    const hasAudioProperty = Object.keys(options).some(key => {
      return 0 <= audioPropertyKeys.indexOf(key) && options[key] !== null;
    });
    if (hasAudioProperty) {
      audio = {};
      if ('audioCodecType' in options && options.audioCodecType) {
        audio['codec_type'] = options.audioCodecType;
      }
      if ('audioBitRate' in options && options.audioBitRate) {
        audio['bit_rate'] = options.audioBitRate;
      }
    }
  }
  message['audio'] = audio;
  // create video options
  let video = true;
  if ('video' in options && typeof options.video === 'boolean') {
    video = options.video;
  }
  if (video) {
    const videoPropertyKeys = ['videoCodecType', 'videoBitRate', 'videoSnapshot'];
    const hasVideoProperty = Object.keys(options).some(key => {
      return 0 <= videoPropertyKeys.indexOf(key) && options[key] !== null;
    });
    if (hasVideoProperty) {
      video = {};
      if ('videoCodecType' in options && options.videoCodecType) {
        video['codec_type'] = options.videoCodecType;
      }
      if ('videoBitRate' in options && options.videoBitRate) {
        video['bit_rate'] = options.videoBitRate;
      }
      if ('videoSnapshot' in options && options.videoSnapshot) {
        video['snapshot'] = options.videoSnapshot;
      }
    }
  }
  message['video'] = video;

  return message;
}
