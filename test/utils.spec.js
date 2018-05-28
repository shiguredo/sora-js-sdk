/* global describe:false, it:false */

import assert from 'power-assert';
import { createSignalingMessage } from '../src/utils';

const role = 'upstream';
const channelId = '7N3fsMHob';
const metadata = 'PG9A6RXgYqiqWKOVO';
const sdp = 'v=0...';
const userAgent = window.navigator.userAgent;

describe('Utils', () => {
  describe('createSignalingMessage', () => {
    it('simple', () => {
      const actual = createSignalingMessage(sdp, role, channelId, metadata, {});
      const expected = {
        type: 'connect',
        role: role,
        channel_id: channelId,
        metadata: metadata,
        sdp: sdp,
        audio: true,
        video: true,
        userAgent: userAgent
      };
      assert.deepEqual(actual, expected);
    });

    it('undefined to null', () => {
      const actual = createSignalingMessage(sdp, undefined, undefined, undefined, {});
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        metadata: null,
        sdp: sdp,
        audio: true,
        video: true,
        userAgent: userAgent
      };
      assert.deepEqual(actual, expected);
    });

    it('audio and video', () => {
      const options = {
        audio: false,
        video: false
      };
      const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
      const expected = {
        type: 'connect',
        role: role,
        channel_id: channelId,
        metadata: metadata,
        sdp: sdp,
        audio: false,
        video: false,
        userAgent: userAgent
      };
      assert.deepEqual(actual, expected);
    });

    describe('audioCodecType audioBitRate', () => {
      it('audio true', () => {
        const options = {
          audio: true,
          audioCodecType: 'OPUS',
          audioBitRate: 100
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          sdp: sdp,
          audio: {
            codec_type: 'OPUS',
            bit_rate: 100
          },
          video: true,
          userAgent: userAgent
        };
        assert.deepEqual(actual, expected);
      });

      it('audio false', () => {
        const options = {
          audio: false,
          audioCodecType: 'OPUS'
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          sdp: sdp,
          audio: false,
          video: true,
          userAgent: userAgent
        };
        assert.deepEqual(actual, expected);
      });
    });

    describe('video parameter', () => {
      it('video true', () => {
        const options = {
          video: true,
          videoCodecType: 'VP8'
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          sdp: sdp,
          audio: true,
          video: {
            codec_type: 'VP8'
          },
          userAgent: userAgent
        };
        assert.deepEqual(actual, expected);
      });

      it('video false', () => {
        const options = {
          video: false,
          videoCodecType: 'VP8'
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          sdp: sdp,
          audio: true,
          video: false,
          userAgent: userAgent
        };
        assert.deepEqual(actual, expected);
      });

      it('videoCodecType videoBitRate', () => {
        const options = {
          video: true,
          videoCodecType: 'VP8',
          videoBitRate: 50
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          audio: true,
          sdp: sdp,
          video: {
            codec_type: 'VP8',
            bit_rate: 50
          },
          userAgent: userAgent
        };
        assert.deepEqual(actual, expected);
      });
    });

    it('all null', () => {
      const options = {
        audio: true,
        audioCodecType: null,
        audioBitRate: null,
        video: true,
        videoCodecType: null,
        videoBitRate: null,
        multistream: null,
        spotlight: null
      };
      const actual = createSignalingMessage(null, null, null, null, options);
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        metadata: null,
        sdp: null,
        audio: true,
        video: true,
        spotlight: null,
        userAgent: userAgent
      };
      assert.deepEqual(actual, expected);
    });

    it('some audio property null', () => {
      const options = {
        audio: true,
        audioCodecType: null,
        audioBitRate: 10,
        video: true,
        multistream: null
      };
      const actual = createSignalingMessage(null, null, null, null, options);
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        metadata: null,
        sdp: null,
        audio: {
          bit_rate: 10
        },
        video: true,
        userAgent: userAgent
      };
      assert.deepEqual(actual, expected);
    });

    it('some video property null', () => {
      const options = {
        audio: true,
        video: true,
        videoBitRate: 10,
        multistream: null
      };
      const actual = createSignalingMessage(null, null, null, null, options);
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        metadata: null,
        sdp: null,
        audio: true,
        video: {
          bit_rate: 10
        },
        userAgent: userAgent
      };
      assert.deepEqual(actual, expected);
    });

    describe('multistream parameter', () => {
      it('multistream', () => {
        const options = {
          multistream: true
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          multistream: true,
          sdp: sdp,
          plan_b: true,
          video: true,
          audio: true,
          userAgent: userAgent
        };
        assert.deepEqual(actual, expected);
      });
    });

    describe('spotlight parameter', () => {
      it('spotlight', () => {
        const options = {
          spotlight: 2
        };
        const actual = createSignalingMessage(sdp, role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          metadata: metadata,
          sdp: sdp,
          video: true,
          audio: true,
          userAgent: userAgent,
          spotlight: 2
        };
        assert.deepEqual(actual, expected);
      });
    });
  });
});
