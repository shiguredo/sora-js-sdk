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

export function createSignalingMessage(role, channelId, metadata, options) {
  const message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    metadata: metadata,
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
    if ('audioCodecType' in options) {
      audio = {
        codec_type: options.audioCodecType
      };
    }
  }
  message['audio'] = audio;
  // create video options
  let video = true;
  if ('video' in options) {
    video = options.video;
  }

  if (video) {
    const videoPropertyKeys = ['videoCodecType', 'videoBitRate', 'videoSnapshot'];
    if (Object.keys(options).some(key => { return 0 <= videoPropertyKeys.indexOf(key); })) {
      video = {};
      if ('videoCodecType' in options) {
        video['codec_type'] = options.videoCodecType;
      }
      if ('videoBitRate' in options) {
        video['bit_rate'] = options.videoBitRate;
      }
      if ('videoSnapshot' in options) {
        video['snapshot'] = options.videoSnapshot;
      }
    }
  }
  message['video'] = video;

  return message;
}
