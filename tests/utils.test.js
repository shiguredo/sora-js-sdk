/* global test:false, expect:false */

import { createSignalingMessage } from '../src/utils';
import pkg from '../package.json';

const channelId = '7N3fsMHob';
const role = 'upstream';
const metadata = 'PG9A6RXgYqiqWKOVO';
const sdp = 'v=0...';
const userAgent = window.navigator.userAgent;
const sdkVersion = pkg.version;
const sdkType = 'JavaScript';
const baseExpectedMessage = Object.freeze({
  type: 'connect',
  sdk_version: sdkVersion,
  sdk_type: sdkType,
  sdp: sdp,
  audio: true,
  video: true,
  user_agent: userAgent,
  role: role,
  channel_id: channelId
});

test('createSignalingMessage simple', () => {
  // upstream
  expect(createSignalingMessage(sdp, role, channelId, null, {})).toEqual(baseExpectedMessage);

  // downstream
  const diff = {
    role: 'downstream'
  };
  expect(createSignalingMessage(sdp, 'downstream', channelId, null, {})).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
});

test('createSignalingMessage role', () => {
  expect(() => {
    createSignalingMessage(sdp, 'test', channelId, metadata, {});
  }).toThrow(Error('Unknown role type'));
  expect(() => {
    createSignalingMessage(sdp, null, channelId, metadata, {});
  }).toThrow(Error('Unknown role type'));
});

test('createSignalingMessage channelId', () => {
  expect(() => {
    createSignalingMessage(sdp, role, null, metadata, {});
  }).toThrow(Error('channelId can not be null or undefined'));
  expect(() => {
    createSignalingMessage(sdp, role, undefined, metadata, {});
  }).toThrow(Error('channelId can not be null or undefined'));
});

test('createSignalingMessage metadata', () => {
  const diff = {
    metadata: metadata
  };
  expect(createSignalingMessage(sdp, role, channelId, metadata, {})).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
  expect(createSignalingMessage(sdp, role, channelId, null, {})).toEqual(baseExpectedMessage);
  expect(createSignalingMessage(sdp, role, channelId, undefined, {})).toEqual(baseExpectedMessage);
});

test('createSignalingMessage clientId option', () => {
  const option1 = {
    clientId: 'clientId'
  };
  const diff = {
    client_id: option1.clientId
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff)
  );
  const option2 = {
    clientId: null
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option2)).toEqual(baseExpectedMessage);
  const option3 = {
    clientId: undefined
  };
  expect(createSignalingMessage(sdp, role, channelId, null, option3)).toEqual(baseExpectedMessage);
});

test('createSignalingMessage multistream option', () => {
  // multistream
  const options1 = {
    multistream: true
  };
  const diff1 = {
    multistream: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  // multistream spotlight
  const options2 = {
    multistream: true,
    spotlight: true
  };
  const diff2 = {
    multistream: true,
    spotlight: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  // spotlight
  const options3 = {
    spotlight: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(baseExpectedMessage);
});

test('createSignalingMessage simulcast option', () => {
  // simulcast
  const options1 = {
    simulcast: true
  };
  const diff1 = {
    simulcast: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  // simulcast + simulcastQuality(low)
  const options2 = {
    simulcast: true,
    simulcastQuality: 'low'
  };
  const diff2 = {
    simulcast: {
      quality: options2.simulcastQuality
    }
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(
    Object.assign({}, baseExpectedMessage, diff2)
  );
  // simulcast + simulcastQuality(middle)
  const options3 = {
    simulcast: true,
    simulcastQuality: 'middle'
  };
  const diff3 = {
    simulcast: {
      quality: options3.simulcastQuality
    }
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(
    Object.assign({}, baseExpectedMessage, diff3)
  );
  // simulcast + simulcastQuality(high)
  const options4 = {
    simulcast: true,
    simulcastQuality: 'high'
  };
  const diff4 = {
    simulcast: {
      quality: options4.simulcastQuality
    }
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(
    Object.assign({}, baseExpectedMessage, diff4)
  );
  // simulcast + unknown simulcastQuality
  const options5 = {
    simulcast: true,
    simulcastQuality: 'test'
  };
  const diff5 = {
    simulcast: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options5)).toEqual(
    Object.assign({}, baseExpectedMessage, diff5)
  );
});

test('createSignalingMessage audio option', () => {
  const options1 = {
    audio: false,
    audioCodecType: 'OPUS',
    audioBitRate: 100
  };
  const diff1 = {
    audio: false
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    audio: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(baseExpectedMessage);
  const options3 = {
    audio: null
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(baseExpectedMessage);
  const options4 = {
    audio: undefined
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(baseExpectedMessage);
  const options5 = {
    audioCodecType: 'OPUS',
    audioBitRate: 100
  };
  const diff5 = {
    audio: {
      codec_type: options5.audioCodecType,
      bit_rate: options5.audioBitRate
    }
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options5)).toEqual(
    Object.assign({}, baseExpectedMessage, diff5)
  );
});

test('createSignalingMessage video option', () => {
  const options1 = {
    video: false,
    videoCodecType: 'VP9',
    videoBitRate: 100
  };
  const diff1 = {
    video: false
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options1)).toEqual(
    Object.assign({}, baseExpectedMessage, diff1)
  );
  const options2 = {
    video: true
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options2)).toEqual(baseExpectedMessage);
  const options3 = {
    video: null
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options3)).toEqual(baseExpectedMessage);
  const options4 = {
    video: undefined
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options4)).toEqual(baseExpectedMessage);
  const options5 = {
    videoCodecType: 'VP9',
    videoBitRate: 100
  };
  const diff5 = {
    video: {
      codec_type: options5.videoCodecType,
      bit_rate: options5.videoBitRate
    }
  };
  expect(createSignalingMessage(sdp, role, channelId, null, options5)).toEqual(
    Object.assign({}, baseExpectedMessage, diff5)
  );
});
