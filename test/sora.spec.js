/* global describe:false, it:false, assert:false */

import Sora from '../src/sora';

const channelId = '7N3fsMHob';
const metadata = 'PG9A6RXgYqiqWKOVO';
const signalingUrl = 'ws://127.0.0.1:5000/signaling';

describe('Sora', () => {
  describe('Connection', () => {
    it('Success publisher connect', done => {
      const sora = Sora.connection(signalingUrl);
      const publisher = sora.publisher(channelId, metadata);
      navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(mediaStream => {
        publisher
          .connect(mediaStream)
          .then(_ => {
            done();
          })
          .catch(e => {
            assert(false, 'Faild publisher signaling.' + e);
          });
      });
    });
    it('Success subscriber connect', done => {
      const sora = Sora.connection(signalingUrl);
      const subscriber = sora.subscriber(channelId, metadata);
      subscriber
        .connect()
        .then(_ => {
          done();
        })
        .catch(e => {
          assert(false, 'Faild subscriber signaling.' + e);
        });
    });
  });
});
