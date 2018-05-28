/* @flow */
type ConnectionOptions = {
  audio: boolean,
  audioCodecType?: string,
  video: boolean,
  videoCodecType?: string,
  videoBitRate?: number,
  multistream?: boolean
}
import ConnectionPublisher from './connection/publisher';
import ConnectionSubscriber from './connection/subscriber';


const Sora = {
  connection: function(signalingUrl: string, debug: boolean=false) {
    return new SoraConnection(signalingUrl, debug);
  }
};


class SoraConnection {
  signalingUrl: string;
  debug: boolean;

  constructor(signalingUrl: string, debug: boolean=false) {
    this.signalingUrl = signalingUrl;
    this.debug = debug;
  }

  publisher(channelId: string, metadata: string, options: ConnectionOptions={ audio: true, video: true }) {
    return new ConnectionPublisher(this.signalingUrl, channelId, metadata, options, this.debug);
  }

  subscriber(channelId: string, metadata: string, options: ConnectionOptions={ audio: true, video: true }) {
    return new ConnectionSubscriber(this.signalingUrl, channelId, metadata, options, this.debug);
  }
}

module.exports = Sora;
