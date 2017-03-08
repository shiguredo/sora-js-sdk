function isPlanB() {
  const userAgent = window.navigator.userAgent.toLocaleLowerCase();
  if (userAgent.indexOf('chrome') != -1) {
    return true;
  } else {
    return false;
  }
}

export function createSignalingMessage(role, channelId, accessToken, options) {
  const message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    access_token: accessToken,
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
