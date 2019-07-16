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
  if (ua.indexOf('edge') !== -1) {
    return 'edge';
  }
  else if (ua.indexOf('chrome')  !== -1 && ua.indexOf('edge') === -1) {
    return 'chrome';
  }
  else if (ua.indexOf('safari')  !== -1 && ua.indexOf('chrome') === -1) {
    return 'safari';
  }
  else if (ua.indexOf('opera')   !== -1) {
    return 'opera';
  }
  else if (ua.indexOf('firefox') !== -1) {
    return 'firefox';
  }
  return ;
}

function enabledSimulcast(role, video) {
  /**
    simulcast validator
    VP9 x

    simulcast_pub Chrome o
    simulcast_pub Firefox x
    simulcast_pub Safari 12.1 o
    simulcast_pub Safari 12.0 x
    simulcast_sub Chrome o
    simulcast_sub Firefox o
    simulcast_sub Safari 12.1 o
    simulcast_sub Safari 12.0 o ※H.264 のみ
  **/
  if (video.codec_type === 'VP9') {
    return false;
  }
  if (role === 'upstream' && browser() === 'firefox') {
    return false;
  }
  if (browser() === 'safari') {
    const appVersion = window.navigator.appVersion.toLowerCase();
    const version = /version\/([\d.]+)/.exec(appVersion).pop();
    // version 12.0 以降であれば有効
    if (12.0 < parseFloat(version)) {
      return true;
    }
    if (12.0 == parseFloat(version) && role === 'downstream' && video.codec_type === 'H264') {
      // role が downstream で 'H264' の場合のみ有効
      return true;
    }
    return false;
  }
  return true;
}

function enabledSimulcastRid(role, video) {
  /**
    simulcast_rid validator
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
  if (video.codec_type === 'VP9') {
    return false;
  }
  if (role === 'upstream' && browser() === 'firefox') {
    return false;
  }
  if (role === 'upstream' && browser() === 'safari') {
    return false;
  }
  if (role === 'downstream' && browser() === 'safari') {
    const appVersion = window.navigator.appVersion.toLowerCase();
    const version = /version\/([\d.]+)/.exec(appVersion).pop();
    // version 12.0 以降であれば有効
    if (12.0 < parseFloat(version)) {
      return true;
    }
    if (12.0 == parseFloat(version) && video.codec_type === 'H264') {
      // role が downstream で 'H264' の場合のみ有効
      return true;
    }
    return false;
  }
  return true;
}

export function isEdge() {
  return browser() === 'edge';
}

export function isSafari() {
  return browser() === 'safari';
}

export function isChrome() {
  return browser() === 'chrome';
}

export function replaceAnswerSdp(sdp) {
  let ssrcPattern = new RegExp(/m=video[\s\S]*?(a=ssrc:(\d+)\scname:.+\r\n(a=ssrc:\2\smsid:.+\r\na=ssrc:\2\smslabel:.+\r\na=ssrc:\2\slabel:.+\r\n)?)/);  // eslint-disable-line
  const found = sdp.match(ssrcPattern);
  if (!found) {
    return sdp;
  }

  const ssrcAttributes = found[1];
  ssrcPattern = found[1];
  const ssrcId = parseInt(found[2]);
  const ssrcIdPattern = new RegExp(ssrcId.toString(), 'g');
  const ssrcGroup = ['a=ssrc-group:SIM'];
  const ssrcAttributeList = [];
  for (let i = 0; i < 3; i += 1) {
    ssrcGroup.push((ssrcId + i).toString());
    ssrcAttributeList.push(ssrcAttributes.replace(ssrcIdPattern, (ssrcId + i).toString()));
  }
  return sdp.replace(ssrcPattern, [ssrcGroup.join(' '), '\r\n', ssrcAttributeList.join('')].join(''));
}

export function createSignalingMessage(offerSDP, role, channelId, metadata, options) {
  const message = {
    type: 'connect',
    role: role,
    channel_id: channelId,
    metadata: metadata,
    sdp: offerSDP,
    user_agent: window.navigator.userAgent,
    audio: true,
    video: true
  };
  Object.keys(message).forEach(key => {
    if (message[key] === undefined) {
      message[key] = null;
    }
  });

  if ('multistream' in options && options.multistream === true) {
    // multistream
    message.multistream = true;
    // spotlight
    if ('spotlight' in options) {
      message.spotlight = options.spotlight;
    }
  } else if ('simulcast' in options || 'simulcastQuality' in options) {
    // simulcast
    if ('simulcast' in options && options.simulcast === true) {
      message.simulcast = true;
      // simulcast rid
      if ('simulcastRid' in options && options.simulcastRid === true) {
        message.simulcast_rid = true;
      }
    }
    const simalcastQualities = ['low', 'middle', 'high'];
    if ('simulcastQuality' in options && 0 <= simalcastQualities.indexOf(options.simulcastQuality)) {
      message.simulcast = {
        quality: options.simulcastQuality
      };
    }
  }

  // client_id
  if ('clientId' in options && options.clientId) {
    message.client_id = options.clientId;
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

  if (message.simulcast && !enabledSimulcast(message.role, message.video)) {
    throw new Error('Simulcast can not be used with this browser');
  }
  if (message.simulcast && message.simulcastRid && !enabledSimulcast(message.role, message.video)) {
    throw new Error('Simulcast Rid can not be used with this browser');
  }
  return message;
}
