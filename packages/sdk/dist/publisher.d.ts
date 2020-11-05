import ConnectionBase from "./base";
export default class ConnectionPublisher extends ConnectionBase {
    connect(stream: MediaStream): Promise<MediaStream>;
    private singleStream;
    private multiStream;
}
