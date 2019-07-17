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
        user_agent: userAgent
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
        user_agent: userAgent
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
        user_agent: userAgent
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
          user_agent: userAgent
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
          user_agent: userAgent
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
          user_agent: userAgent
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
          user_agent: userAgent
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
          user_agent: userAgent
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
        user_agent: userAgent
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
        user_agent: userAgent
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
        user_agent: userAgent
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
          video: true,
          audio: true,
          user_agent: userAgent
        };
        assert.deepEqual(actual, expected);
      });
    });

    describe('spotlight parameter', () => {
      it('spotlight', () => {
        const options = {
          multistream: true,
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
          user_agent: userAgent,
          multistream: true,
          spotlight: 2
        };
        assert.deepEqual(actual, expected);
      });
    });

    describe('client id parameter', () => {
      it('client_id', () => {
        const options = {
          clientId: 'client_id'
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
          user_agent: userAgent,
          client_id: 'client_id'
        };
        assert.deepEqual(actual, expected);
      });
    });

    describe('simulcast parameter', () => {
      it('simulcast true', () => {
        const options = {
          simulcast: true
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
          user_agent: userAgent,
          simulcast: true
        };
        assert.deepEqual(actual, expected);
      });

      it('simulcast false', () => {
        const options = {
          simulcast: false
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
          user_agent: userAgent,
        };
        assert.deepEqual(actual, expected);
      });

      it('simulcast quality', () => {
        const options = {
          simulcastQuality: 'low'
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
          user_agent: userAgent,
          simulcast: {
            quality: 'low'
          }
        };
        assert.deepEqual(actual, expected);
      });

      it('unknown simulcast quality', () => {
        const options = {
          simulcastQuality: 'test'
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
          user_agent: userAgent
        };
        assert.deepEqual(actual, expected);
      });

      it('simulcast with VP9', () => {
        const options = {
          simulcast: true,
          videoCodecType: 'VP9',
        };
        assert.throws(
          () => {
            createSignalingMessage(sdp, 'downstream', channelId, metadata, options);
          },
          (error) => {
            assert(error.message === 'Simulcast can not be used with this browser');
            return true;
          }
        );
      });

      it('simulcast with Firefox upstream', () => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => { return '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10.14; rv:66.0) Gecko/20100101 Firefox/66.0"'; },
          enumerable: true,
          configurable: true,
        });
        const options = {
          simulcast: true
        };
        assert.throws(
          () => {
            createSignalingMessage(sdp, 'upstream', channelId, metadata, options);
          },
          (error) => {
            assert(error.message === 'Simulcast can not be used with this browser');
            return true;
          }
        );
      });

      it('simulcast with Safari 12.0 upstream', () => {
        const localUserAgent = '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15"';  // eslint-disable-line
        Object.defineProperty(navigator, 'userAgent', {
          get: () => { return localUserAgent; },
          enumerable: true,
          configurable: true,
        });
        const appVersion = '"5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15"';  // eslint-disable-line
        Object.defineProperty(navigator, 'appVersion', {
          get: () => { return appVersion; },
          enumerable: true,
          configurable: true,
        });
        const options = {
          simulcast: true
        };
        assert.throws(
          () => {
            createSignalingMessage(sdp, 'upstream', channelId, metadata, options);
          },
          (error) => {
            assert(error.message === 'Simulcast can not be used with this browser');
            return true;
          }
        );
      });

      it('simulcast with Safari 12.0 VP8 downstream', () => {
        const localUserAgent = '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15"';  // eslint-disable-line
        Object.defineProperty(navigator, 'userAgent', {
          get: () => { return localUserAgent; },
          enumerable: true,
          configurable: true,
        });
        const appVersion = '"5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.0 Safari/605.1.15"';  // eslint-disable-line
        Object.defineProperty(navigator, 'appVersion', {
          get: () => { return appVersion; },
          enumerable: true,
          configurable: true,
        });
        const options = {
          simulcast: true
        };
        assert.throws(
          () => {
            createSignalingMessage(sdp, 'downstream', channelId, metadata, options);
          },
          (error) => {
            assert(error.message === 'Simulcast can not be used with this browser');
            return true;
          }
        );
      });
    });
  });
});
