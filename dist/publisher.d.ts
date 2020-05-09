import ConnectionBase from "./base";
export default class ConnectionPublisher extends ConnectionBase {
    connect(stream: MediaStream): Promise<MediaStream>;
    _singleStream(stream: MediaStream): Promise<MediaStream>;
    _multiStream(stream: MediaStream): Promise<MediaStream>;
}
