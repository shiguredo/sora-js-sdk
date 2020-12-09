import {
  createSignalingMessage,
  getPreKeyBundle,
  getSignalingNotifyData,
  getSignalingNotifyAuthnMetadata,
  trace,
  isSafari,
} from "./utils";
import { Callbacks, ConnectionOptions, Encoding, Json, SignalingOfferMessage, SignalingUpdateMessage } from "./types";
import SoraE2EE from "@sora/e2ee";

// Override from @type/WebRTC
interface SoraRTCPeerConnectionStatic extends RTCPeerConnectionStatic {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generateCertificate(keygenAlgorithm: any): Promise<RTCCertificate>;
}

interface Window {
  RTCPeerConnection: SoraRTCPeerConnectionStatic;
}

declare let window: Window;

export default class ConnectionBase {
  role: string;
  channelId: string;
  metadata: Json | undefined;
  signalingUrl: string;
  options: ConnectionOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constraints: any;
  debug: boolean;
  clientId: string | null;
  connectionId: string | null;
  remoteConnectionIds: string[];
  stream: MediaStream | null;
  authMetadata: Json;
  pc: RTCPeerConnection | null;
  encodings: Encoding[];
  protected ws: WebSocket | null;
  protected callbacks: Callbacks;
  protected e2ee: SoraE2EE | null;

  constructor(
    signalingUrl: string,
    role: string,
    channelId: string,
    metadata: Json,
    options: ConnectionOptions,
    debug: boolean
  ) {
    this.role = role;
    this.channelId = channelId;
    this.metadata = metadata;
    this.signalingUrl = signalingUrl;
    this.options = options;
    // client timeout の初期値をセットする
    if (this.options.timeout === undefined) {
      this.options.timeout = 60000;
    }
    this.constraints = null;
    this.debug = debug;
    this.clientId = null;
    this.connectionId = null;
    this.remoteConnectionIds = [];
    this.stream = null;
    this.ws = null;
    this.pc = null;
    this.encodings = [];
    this.callbacks = {
      disconnect: (): void => {},
      push: (): void => {},
      addstream: (): void => {},
      track: (): void => {},
      removestream: (): void => {},
      removetrack: (): void => {},
      notify: (): void => {},
      log: (): void => {},
      timeout: (): void => {},
    };
    this.authMetadata = null;
    this.e2ee = null;
  }

  on(kind: keyof Callbacks, callback: Function): void {
    // @deprecated message
    if (kind === "addstream") {
      console.warn("@deprecated addstream callback will be removed in a future version. Use track callback.");
    } else if (kind === "removestream") {
      console.warn("@deprecated removestream callback will be removed in a future version. Use removetrack callback.");
    }
    if (kind in this.callbacks) {
      this.callbacks[kind] = callback;
    }
  }

  disconnect(): Promise<[void, void, void]> {
    this.clientId = null;
    this.connectionId = null;
    this.authMetadata = null;
    this.remoteConnectionIds = [];
    const closeStream: Promise<void> = new Promise((resolve, _) => {
      if (this.debug) {
        console.warn(
          "@deprecated closing MediaStream in disconnect will be removed in a future version. Close every track in the MediaStream by yourself."
        );
      }
      if (!this.stream) return resolve();
      this.stream.getTracks().forEach((t) => {
        t.stop();
      });
      this.stream = null;
      return resolve();
    });
    const closeWebSocket: Promise<void> = new Promise((resolve, _reject) => {
      if (!this.ws) return resolve();
      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ type: "disconnect" }));
      }
      this.ws.close();
      this.ws = null;
      return resolve();
    });
    const closePeerConnection: Promise<void> = new Promise((resolve, _reject) => {
      if (!this.pc || this.pc.connectionState === "closed" || this.pc.connectionState === undefined) return resolve();
      let counter = 50;
      const timerId = setInterval(() => {
        if (!this.pc) {
          clearInterval(timerId);
          return resolve();
        }
        if (this.pc.connectionState === "closed") {
          clearInterval(timerId);
          this.pc = null;
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timerId);
          return resolve();
        }
      }, 100);
      this.pc.close();
    });
    if (this.e2ee) {
      this.e2ee.terminateWorker();
      this.e2ee = null;
    }
    return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
  }

  protected setupE2EE(): void {
    if (this.options.e2ee === true) {
      this.e2ee = new SoraE2EE();
      this.e2ee.onWorkerDisconnect = (): void => {
        this.disconnect();
      };
      this.e2ee.startWorker();
    }
  }

  protected startE2EE(): void {
    if (this.options.e2ee === true && this.e2ee) {
      if (!this.connectionId) {
        const error = new Error();
        error.message = `E2EE failed. Self connectionId is ${this.connectionId}`;
        throw error;
      }
      this.e2ee.clearWorker();
      const result = this.e2ee.start(this.connectionId);
      this.e2ee.postSelfSecretKeyMaterial(this.connectionId, result.selfKeyId, result.selfSecretKeyMaterial);
    }
  }

  protected signaling(offer: RTCSessionDescriptionInit): Promise<SignalingOfferMessage> {
    this.trace("CREATE OFFER SDP", offer);
    // TODO(yuito): 一旦 disable にする
    // eslint-disable-next-line  no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const signalingMessage = createSignalingMessage(
        offer.sdp || "",
        this.role,
        this.channelId,
        this.metadata,
        this.options
      );
      if (signalingMessage.e2ee && this.e2ee) {
        const initResult = await this.e2ee.init();
        // @ts-ignore signalingMessage の e2ee が true の場合は signalingNotifyMetadata が必ず object になる
        signalingMessage["signaling_notify_metadata"]["pre_key_bundle"] = initResult;
      }
      if (this.ws === null) {
        this.ws = new WebSocket(this.signalingUrl);
      }
      this.ws.binaryType = "arraybuffer";
      this.ws.onclose = (event): void => {
        const error = new Error();
        error.message = `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`;
        reject(error);
      };
      this.ws.onopen = (): void => {
        this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
        if (this.ws) {
          this.ws.send(JSON.stringify(signalingMessage));
        }
      };
      this.ws.onmessage = (event): void => {
        // E2EE 時専用処理
        if (event.data instanceof ArrayBuffer && this.e2ee) {
          const message = new Uint8Array(event.data);
          const result = this.e2ee.receiveMessage(message);
          this.e2ee.postRemoteSecretKeyMaterials(result);
          result.messages.forEach((message) => {
            if (this.ws) {
              this.ws.send(message.buffer);
            }
          });
          return;
        }
        const message = JSON.parse(event.data);
        if (message.type == "offer") {
          this.clientId = message.client_id;
          this.connectionId = message.connection_id;
          if (this.ws) {
            this.ws.onclose = (e): void => {
              this.callbacks.disconnect(e);
              this.disconnect();
            };
            this.ws.onerror = null;
          }
          if ("metadata" in message) {
            this.authMetadata = message.metadata;
          }
          if ("encodings" in message && Array.isArray(message.encodings)) {
            this.encodings = message.encodings;
          }
          this.trace("SIGNALING OFFER MESSAGE", message);
          this.trace("OFFER SDP", message.sdp);
          resolve(message);
        } else if (message.type == "update") {
          this.trace("UPDATE SDP", message.sdp);
          this.update(message);
        } else if (message.type == "ping") {
          if (message.stats) {
            this.getStats().then((stats) => {
              if (this.ws) {
                this.ws.send(JSON.stringify({ type: "pong", stats: stats }));
              }
            });
          } else {
            if (this.ws) {
              this.ws.send(JSON.stringify({ type: "pong" }));
            }
          }
        } else if (message.type == "push") {
          this.callbacks.push(message);
        } else if (message.type == "notify") {
          if (message.event_type === "connection.created") {
            const connectionId = message.connection_id;
            if (this.connectionId !== connectionId) {
              const authnMetadata = getSignalingNotifyAuthnMetadata(message);
              const preKeyBundle = getPreKeyBundle(authnMetadata);
              if (preKeyBundle && this.e2ee) {
                const result = this.e2ee.startSession(connectionId, preKeyBundle);
                this.e2ee.postRemoteSecretKeyMaterials(result);
                result.messages.forEach((message) => {
                  if (this.ws) {
                    this.ws.send(message.buffer);
                  }
                });
                // messages を送信し終えてから、selfSecretKeyMaterial を更新する
                this.e2ee.postSelfSecretKeyMaterial(
                  result.selfConnectionId,
                  result.selfKeyId,
                  result.selfSecretKeyMaterial
                );
              }
            }
            const data = getSignalingNotifyData(message);
            data.forEach((metadata) => {
              const authnMetadata = getSignalingNotifyAuthnMetadata(metadata);
              const preKeyBundle = getPreKeyBundle(authnMetadata);
              const connectionId = metadata.connection_id;
              if (connectionId && this.e2ee && preKeyBundle) {
                this.e2ee.addPreKeyBundle(connectionId as string, preKeyBundle);
              }
            });
          } else if (message.event_type === "connection.destroyed") {
            const authnMetadata = getSignalingNotifyAuthnMetadata(message);
            const preKeyBundle = getPreKeyBundle(authnMetadata);
            if (preKeyBundle && this.e2ee) {
              const connectionId = message.connection_id;
              const result = this.e2ee.stopSession(connectionId);
              this.e2ee.postSelfSecretKeyMaterial(
                result.selfConnectionId,
                result.selfKeyId,
                result.selfSecretKeyMaterial,
                5000
              );
              result.messages.forEach((message) => {
                if (this.ws) {
                  this.ws.send(message.buffer);
                }
              });
              this.e2ee.postRemoveRemoteDeriveKey(connectionId);
            }
          }
          this.callbacks.notify(message);
        }
      };
    });
  }

  protected async createOffer(): Promise<RTCSessionDescriptionInit> {
    const config = { iceServers: [] };
    const pc = new window.RTCPeerConnection(config);
    if (isSafari()) {
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      const offer = await pc.createOffer();
      pc.close();
      return offer;
    }
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    pc.close();
    return offer;
  }

  protected async connectPeerConnection(message: SignalingOfferMessage): Promise<void> {
    const messageConfig = message.config || {};
    let config = messageConfig;
    if (this.e2ee) {
      // @ts-ignore
      config["encodedInsertableStreams"] = true;
    }
    if (window.RTCPeerConnection.generateCertificate !== undefined) {
      const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
      config = Object.assign({ certificates: [certificate] }, messageConfig);
    }
    this.trace("PEER CONNECTION CONFIG", config);
    this.pc = new window.RTCPeerConnection(config, this.constraints);
    this.pc.oniceconnectionstatechange = (_): void => {
      if (this.pc) {
        this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
      }
    };
    return;
  }

  protected async setRemoteDescription(message: SignalingOfferMessage | SignalingUpdateMessage): Promise<void> {
    if (!this.pc) {
      return;
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: message.sdp }));
    return;
  }

  protected async createAnswer(message: SignalingOfferMessage | SignalingUpdateMessage): Promise<void> {
    if (!this.pc) {
      return;
    }
    // simulcast の場合
    if (this.options.simulcast && (this.role === "upstream" || this.role === "sendrecv" || this.role === "sendonly")) {
      const transceiver = this.pc.getTransceivers().find((t) => {
        if (t.mid && 0 <= t.mid.indexOf("video") && t.currentDirection == null && t.sender.track !== null) {
          return t;
        }
      });
      if (transceiver) {
        await this.setSenderParameters(transceiver, this.encodings);
        await this.setRemoteDescription(message);
        this.trace("TRANSCEIVER SENDER GET_PARAMETERS", transceiver.sender.getParameters());
        // setRemoteDescription 後でないと active が反映されないのでもう一度呼ぶ
        await this.setSenderParameters(transceiver, this.encodings);
        const sessionDescription = await this.pc.createAnswer();
        await this.pc.setLocalDescription(sessionDescription);
        this.trace("TRANSCEIVER SENDER GET_PARAMETERS", transceiver.sender.getParameters());
        return;
      }
    }
    const sessionDescription = await this.pc.createAnswer();
    await this.pc.setLocalDescription(sessionDescription);
    return;
  }

  protected sendAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace("ANSWER SDP", this.pc.localDescription.sdp);
      this.ws.send(JSON.stringify({ type: "answer", sdp: this.pc.localDescription.sdp }));
    }
    return;
  }

  protected sendUpdateAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace("ANSWER SDP", this.pc.localDescription.sdp);
      this.ws.send(JSON.stringify({ type: "update", sdp: this.pc.localDescription.sdp }));
    }
    return;
  }

  protected onIceCandidate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = setInterval(() => {
        if (this.pc === null) {
          clearInterval(timerId);
          const error = new Error();
          error.message = "ICECANDIDATE TIMEOUT";
          reject(error);
        } else if (this.pc && this.pc.iceConnectionState === "connected") {
          clearInterval(timerId);
          resolve();
        }
      }, 100);
      if (this.pc) {
        this.pc.onicecandidate = (event): void => {
          if (this.pc) {
            this.trace("ONICECANDIDATE ICEGATHERINGSTATE", this.pc.iceGatheringState);
          }
          if (event.candidate === null) {
            clearInterval(timerId);
            resolve();
          } else {
            const candidate = event.candidate.toJSON();
            const message = Object.assign(candidate, { type: "candidate" });
            this.trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
            if (this.ws) {
              this.ws.send(JSON.stringify(message));
            }
          }
        };
      }
    });
  }

  protected waitChangeConnectionStateConnected(): Promise<void> {
    return new Promise((resolve, reject) => {
      // connectionState が存在しない場合はそのまま抜ける
      if (this.pc && this.pc.connectionState === undefined) {
        resolve();
      }
      const timerId = setInterval(() => {
        if (!this.pc) {
          const error = new Error();
          error.message = "PeerConnection connectionState did not change to 'connected'";
          clearInterval(timerId);
          reject(error);
        } else if (!this.ws || this.ws.readyState !== 1) {
          const error = new Error();
          error.message = "PeerConnection connectionState did not change to 'connected'";
          clearInterval(timerId);
          reject(error);
        } else if (this.pc && this.pc.connectionState === "connected") {
          clearInterval(timerId);
          resolve();
        }
      }, 100);
    });
  }

  protected setConnectionTimeout(): Promise<MediaStream> {
    return new Promise((_, reject) => {
      if (this.options.timeout && 0 < this.options.timeout) {
        setTimeout(() => {
          if (
            !this.pc ||
            (this.pc && this.pc.connectionState !== undefined && this.pc.connectionState !== "connected")
          ) {
            const error = new Error();
            error.message = "CONNECTION TIMEOUT";
            this.callbacks.timeout();
            this.disconnect();
            reject(error);
          }
        }, this.options.timeout);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected trace(title: string, message: any): void {
    this.callbacks.log(title, message);
    if (!this.debug) {
      return;
    }
    trace(this.clientId, title, message);
  }

  private async update(message: SignalingUpdateMessage): Promise<void> {
    await this.setRemoteDescription(message);
    await this.createAnswer(message);
    this.sendUpdateAnswer();
  }

  private async setSenderParameters(transceiver: RTCRtpTransceiver, encodings: Encoding[]): Promise<void> {
    const originalParameters = transceiver.sender.getParameters();
    // @ts-ignore
    originalParameters.encodings = encodings;
    await transceiver.sender.setParameters(originalParameters);
    this.trace("TRANSCEIVER SENDER SET_PARAMETERS", originalParameters);
    return;
  }

  private async getStats(): Promise<RTCStatsReport[]> {
    const stats: RTCStatsReport[] = [];
    if (!this.pc) {
      return stats;
    }
    const reports = await this.pc.getStats();
    reports.forEach((s) => {
      stats.push(s);
    });
    return stats;
  }

  get e2eeSelfFingerprint(): string | undefined {
    if (this.options.e2ee && this.e2ee) {
      return this.e2ee.selfFingerprint();
    }
    return;
  }

  get e2eeRemoteFingerprints(): Record<string, string> | undefined {
    if (this.options.e2ee && this.e2ee) {
      return this.e2ee.remoteFingerprints();
    }
    return;
  }
}
