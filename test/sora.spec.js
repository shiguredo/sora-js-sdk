/* global describe:false, it:false */

import assert from 'power-assert';
import Sora from '../src/sora';


const channelId = '7N3fsMHob';
const accessToken = 'PG9A6RXgYqiqWKOVO';
const signalingUrl = 'ws://127.0.0.1:5000/signaling';

describe('Sora', () => {
  describe('Connection', () => {
    it('Success publisher connect', (done) => {
      const sora = Sora.connection(signalingUrl);
      const connection = sora.connection();
      const params = {
        role: 'upstream',
        channelId: channelId,
        accessToken: accessToken
      };
      connection.connect(params)
        .then(() => {
          done();
        })
        .catch(() => {
          assert(false, 'Faild signaling.');
        });
    });
  });

  describe('Params', () => {
    let connection = new Sora(signalingUrl).connection();

    it('simple', () => {
      const params = {
        role: 'upstream',
        channelId: channelId
      };
      const actual = connection._createSignalingMessage(params);
      const expected = {
        type: 'connect',
        role: 'upstream',
        channel_id: channelId,
        access_token: null,
        audio: true,
        video: true
      };
      assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
    });

    it('undefined to null', () => {
      const actual = connection._createSignalingMessage({});
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        access_token: null,
        audio: true,
        video: true
      };
      assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
    });

    it('audio and video', () => {
      const params = {
        audio: false,
        video: false
      };
      const actual = connection._createSignalingMessage(params);
      const expected = {
        type: 'connect',
        role: null,
        channel_id: null,
        access_token: null,
        audio: false,
        video: false
      };
      assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
    });

    describe('audioCodecType parameter', () => {
      it('audio true', () => {
        const params = {
          audio: true,
          audioCodecType: 'OPUS'
        };
        const actual = connection._createSignalingMessage(params);
        const expected = {
          type: 'connect',
          role: null,
          channel_id: null,
          access_token: null,
          audio: {
            codec_type: 'OPUS'
          },
          video: true
        };
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
      });

      it('audio false', () => {
        const params = {
          audio: false,
          audioCodecType: 'OPUS'
        };
        const actual = connection._createSignalingMessage(params);
        const expected = {
          type: 'connect',
          role: null,
          channel_id: null,
          access_token: null,
          audio: false,
          video: true
        };
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
      });
    });

    describe('video parameter', () => {
      it('video true', () => {
        const params = {
          video: true,
          videoCodecType: 'VP8'
        };
        const actual = connection._createSignalingMessage(params);
        const expected = {
          type: 'connect',
          role: null,
          channel_id: null,
          access_token: null,
          audio: true,
          video: {
            codec_type: 'VP8'
          }
        };
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
      });

      it('video false', () => {
        const params = {
          video: false,
          videoCodecType: 'VP8'
        };
        const actual = connection._createSignalingMessage(params);
        const expected = {
          type: 'connect',
          role: null,
          channel_id: null,
          access_token: null,
          audio: true,
          video: false
        };
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
      });

      it('videoCodecType videoBitRate videoSnapshot', () => {
        const params = {
          video: true,
          videoCodecType: 'VP8',
          videoBitRate: 50,
          videoSnapshot: true
        };
        const actual = connection._createSignalingMessage(params);
        const expected = {
          type: 'connect',
          role: null,
          channel_id: null,
          access_token: null,
          audio: true,
          video: {
            codec_type: 'VP8',
            bit_rate: 50,
            snapshot: true
          }
        };
        assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected));
      });
    });
  });
});
