/* @flow */
import ConnectionPublisher from './connection/publisher';
import ConnectionSubscriber from './connection/subscriber';
import type { ConnectionOptions } from './utils';

export default {
  connection: function(signalingUrl: string, debug: boolean = false) {
    return new SoraConnection(signalingUrl, debug);
  },
  version: function() {
    return SORA_JS_SDK_VERSION;
  }
};

class SoraConnection {
  signalingUrl: string;
  debug: boolean;

  constructor(signalingUrl: string, debug: boolean = false) {
    this.signalingUrl = signalingUrl;
    this.debug = debug;
  }

  // 古い role
  publisher(channelId: string, metadata: string, options: ConnectionOptions = { audio: true, video: true }) {
    return new ConnectionPublisher(this.signalingUrl, 'upstream', channelId, metadata, options, this.debug);
  }

  subscriber(channelId: string, metadata: string, options: ConnectionOptions = { audio: true, video: true }) {
    return new ConnectionSubscriber(this.signalingUrl, 'downstream', channelId, metadata, options, this.debug);
  }

  // 新しい role
  sendrecv(channelId: string, metadata: string, options: ConnectionOptions = { audio: true, video: true }) {
    return new ConnectionPublisher(this.signalingUrl, 'sendrecv', channelId, metadata, options, this.debug);
  }

  sendonly(channelId: string, metadata: string, options: ConnectionOptions = { audio: true, video: true }) {
    return new ConnectionPublisher(this.signalingUrl, 'sendonly', channelId, metadata, options, this.debug);
  }

  recvonly(channelId: string, metadata: string, options: ConnectionOptions = { audio: true, video: true }) {
    return new ConnectionSubscriber(this.signalingUrl, 'recvonly', channelId, metadata, options, this.debug);
  }
}
