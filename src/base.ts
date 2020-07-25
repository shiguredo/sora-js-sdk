import { createSignalingMessage, trace, isSafari } from "./utils";
import { Callbacks, ConnectionOptions, Encoding, Json, SignalingOfferMessage, SignalingUpdateMessage } from "./types";
import SoraE2EE from "sora-e2ee";

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
  metadata: Json;
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
    this.constraints = null;
    this.debug = debug;
    this.clientId = null;
    this.connectionId = null;
    this.remoteConnectionIds = [];
    this.stream = null;
    this.ws = null;
    this.pc = null;
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
    const closeWebSocket: Promise<void> = new Promise((resolve, reject) => {
      if (!this.ws) return resolve();
      this.ws.onclose = null;

      let counter = 5;
      const timerId = setInterval(() => {
        if (!this.ws) {
          clearInterval(timerId);
          return reject("WebSocket Closing Error");
        }
        if (this.ws.readyState === 3) {
          this.ws = null;
          clearInterval(timerId);
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timerId);
          return reject("WebSocket Closing Error");
        }
      }, 1000);
      this.ws.close();
    });
    const closePeerConnection: Promise<void> = new Promise((resolve, reject) => {
      // Safari は signalingState が常に stable のため個別に処理する
      if (isSafari() && this.pc) {
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
        this.pc = null;
        return resolve();
      }
      if (!this.pc || this.pc.signalingState === "closed") return resolve();

      let counter = 5;
      const timerId = setInterval(() => {
        if (!this.pc) {
          clearInterval(timerId);
          return reject("PeerConnection Closing Error");
        }
        if (this.pc.signalingState === "closed") {
          clearInterval(timerId);
          this.pc.oniceconnectionstatechange = null;
          this.pc = null;
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timerId);
          return reject("PeerConnection Closing Error");
        }
      }, 1000);
      this.pc.close();
    });
    if (this.e2ee) {
      this.e2ee.terminateWorker();
      this.e2ee = null;
    }
    return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
  }

  protected startE2EE(): void {
    if ("e2ee" in this.options && typeof this.options.e2ee === "string") {
      this.e2ee = new SoraE2EE(this.options.e2ee);
      this.e2ee.onWorkerDisconnect = (): void => {
        this.disconnect();
      };
      this.e2ee.startWorker();
    }
  }

  protected signaling(offer: RTCSessionDescriptionInit): Promise<SignalingOfferMessage> {
    this.trace("CREATE OFFER SDP", offer);
    return new Promise((resolve, reject) => {
      const signalingMessage = createSignalingMessage(
        offer.sdp || "",
        this.role,
        this.channelId,
        this.metadata,
        this.options
      );
      if (this.ws === null) {
        this.ws = new WebSocket(this.signalingUrl);
      }
      this.ws.onclose = (e): void => {
        reject(e);
      };
      this.ws.onopen = (): void => {
        this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
        if (this.ws) {
          this.ws.send(JSON.stringify(signalingMessage));
        }
      };
      this.ws.onmessage = (event): void => {
        const data = JSON.parse(event.data);
        if (data.type == "offer") {
          this.clientId = data.client_id;
          this.connectionId = data.connection_id;
          if (this.ws) {
            this.ws.onclose = (e): void => {
              this.disconnect().then(() => {
                this.callbacks.disconnect(e);
              });
            };
            this.ws.onerror = null;
          }
          if ("metadata" in data) {
            this.authMetadata = data.metadata;
          }
          this.trace("SIGNALING OFFER MESSAGE", data);
          this.trace("OFFER SDP", data.sdp);
          resolve(data);
        } else if (data.type == "update") {
          this.trace("UPDATE SDP", data.sdp);
          this.update(data);
        } else if (data.type == "ping") {
          if (data.stats) {
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
        } else if (data.type == "push") {
          this.callbacks.push(data);
        } else if (data.type == "notify") {
          this.callbacks.notify(data);
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
      encodedInsertableStreams
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
    if (
      this.options.simulcast &&
      (this.role === "upstream" || this.role === "sendrecv" || this.role === "sendonly") &&
      message.encodings
    ) {
      const transceiver = this.pc.getTransceivers().find((t) => {
        if (t.mid && 0 <= t.mid.indexOf("video") && t.currentDirection == null) {
          return t;
        }
      });
      if (!transceiver) {
        throw new Error("Simulcast Error");
      }
      await this.setSenderParameters(transceiver, message.encodings);
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

  private setSenderParameters(transceiver: RTCRtpTransceiver, encodings: Encoding[]): Promise<void> {
    const originalParameters = transceiver.sender.getParameters();
    // @ts-ignore
    originalParameters.encodings = encodings;
    return transceiver.sender.setParameters(originalParameters);
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
}
