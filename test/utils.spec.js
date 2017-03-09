/* global describe:false, it:false */

import assert from 'power-assert';
import { createSignalingMessage } from '../src/utils';

const role = 'upstream';
const channelId = '7N3fsMHob';
const metadata = 'PG9A6RXgYqiqWKOVO';

describe('Utils', () => {
  describe('createSignalingMessage', () => {
    it('simple', () => {
      const actual = createSignalingMessage(role, channelId, metadata, {});
      const expected = {
        type: 'connect',
        role: role,
        channel_id: channelId,
        access_token: metadata,
        audio: true,
        video: true
      };
      assert.deepEqual(actual, expected);
    });

    it('undefined to null', () => {
      const actual = createSignalingMessage(undefined, undefined, undefined, {});
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        access_token: null,
        audio: true,
        video: true
      };
      assert.deepEqual(actual, expected);
    });

    it('audio and video', () => {
      const options = {
        audio: false,
        video: false
      };
      const actual = createSignalingMessage(role, channelId, metadata, options);
      const expected = {
        type: 'connect',
        role: role,
        channel_id: channelId,
        access_token: metadata,
        audio: false,
        video: false
      };
      assert.deepEqual(actual, expected);
    });

    describe('audioCodecType parameter', () => {
      it('audio true', () => {
        const options = {
          audio: true,
          audioCodecType: 'OPUS'
        };
        const actual = createSignalingMessage(role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          access_token: metadata,
          audio: {
            codec_type: 'OPUS'
          },
          video: true
        };
        assert.deepEqual(actual, expected);
      });

      it('audio false', () => {
        const options = {
          audio: false,
          audioCodecType: 'OPUS'
        };
        const actual = createSignalingMessage(role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          access_token: metadata,
          audio: false,
          video: true
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
        const actual = createSignalingMessage(role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          access_token: metadata,
          audio: true,
          video: {
            codec_type: 'VP8'
          }
        };
        assert.deepEqual(actual, expected);
      });

      it('video false', () => {
        const options = {
          video: false,
          videoCodecType: 'VP8'
        };
        const actual = createSignalingMessage(role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          access_token: metadata,
          audio: true,
          video: false
        };
        assert.deepEqual(actual, expected);
      });

      it('videoCodecType videoBitRate videoSnapshot', () => {
        const options = {
          video: true,
          videoCodecType: 'VP8',
          videoBitRate: 50,
          videoSnapshot: true
        };
        const actual = createSignalingMessage(role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          access_token: metadata,
          audio: true,
          video: {
            codec_type: 'VP8',
            bit_rate: 50,
            snapshot: true
          }
        };
        assert.deepEqual(actual, expected);
      });
    });

    describe('multistream parameter', () => {
      it('multistream', () => {
        const options = {
          multistream: true
        };
        const actual = createSignalingMessage(role, channelId, metadata, options);
        const expected = {
          type: 'connect',
          role: role,
          channel_id: channelId,
          access_token: metadata,
          multistream: true,
          plan_b: true,
          video: true,
          audio: true,
        };
        assert.deepEqual(actual, expected);
      });
    });
  });
});
