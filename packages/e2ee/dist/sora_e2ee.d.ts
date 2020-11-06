declare type PreKeyBundle = {
    identityKey: string;
    signedPreKey: string;
    preKeySignature: string;
};
declare type RemoteSecretKeyMaterial = {
    keyId: number;
    secretKeyMaterial: Uint8Array;
};
declare type ReceiveMessageResult = {
    remoteSecretKeyMaterials: Record<string, RemoteSecretKeyMaterial>;
    messages: Uint8Array[];
};
declare type StartResult = {
    selfKeyId: number;
    selfSecretKeyMaterial: Uint8Array;
};
declare type StartSessionResult = {
    selfConnectionId: string;
    selfKeyId: number;
    selfSecretKeyMaterial: Uint8Array;
    remoteSecretKeyMaterials: Record<string, RemoteSecretKeyMaterial>;
    messages: Uint8Array[];
};
declare type StopSessionResult = {
    selfConnectionId: string;
    selfKeyId: number;
    selfSecretKeyMaterial: Uint8Array;
    messages: Uint8Array[];
};
declare class SoraE2EE {
    worker: Worker | null;
    onWorkerDisconnect: (() => void) | null;
    constructor();
    startWorker(): void;
    clearWorker(): void;
    terminateWorker(): void;
    init(): Promise<PreKeyBundle>;
    setupSenderTransform(sender: RTCRtpSender): void;
    setupReceiverTransform(receiver: RTCRtpReceiver): void;
    postRemoteSecretKeyMaterials(result: ReceiveMessageResult): void;
    postSelfSecretKeyMaterial(selfConnectionId: string, selfKeyId: number, selfSecretKeyMaterial: Uint8Array, waitingTime: number): void;
    startSession(connectionId: string, preKeyBundle: PreKeyBundle): StartSessionResult;
    stopSession(connectionId: string): StopSessionResult;
    receiveMessage(message: Uint8Array): ReceiveMessageResult;
    start(selfConnectionId: string): StartResult;
    addPreKeyBundle(connectionId: string, preKeyBundle: PreKeyBundle): void;
    selfFingerprint(): string;
    remoteFingerprints(): Record<string, string>;
    static version(): string;
    static wasmVersion(): string;
}
export default SoraE2EE;
