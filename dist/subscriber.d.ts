import ConnectionBase from "./base";
export default class ConnectionSubscriber extends ConnectionBase {
    connect(): Promise<MediaStream | void>;
    _singleStream(): Promise<MediaStream>;
    _multiStream(): Promise<void>;
}
