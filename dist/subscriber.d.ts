import ConnectionBase from "./base";
export default class ConnectionSubscriber extends ConnectionBase {
    connect(): Promise<MediaStream | void>;
    private singleStream;
    private multiStream;
}
