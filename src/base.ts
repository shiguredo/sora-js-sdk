import { createSignalingMessage, trace, isSafari } from "./utils";
import { Callbacks, ConnectionOptions, Encoding, SignalingOfferMessage, SignalingUpdateMessage } from "./types";
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
  metadata: string | null;
  signalingUrl: string;
  options: ConnectionOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constraints: any;
  debug: boolean;
  clientId: string | null;
  connectionId: string | null;
  remoteConnectionIds: string[];
  stream: MediaStream | null;
  authMetadata: string | null;
  _ws: WebSocket | null;
  _pc: RTCPeerConnection | null;
  _callbacks: Callbacks;
  protected e2ee: SoraE2EE | null;

  constructor(
    signalingUrl: string,
    role: string,
    channelId: string,
    metadata: string | null,
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
    this._ws = null;
    this._pc = null;
    this._callbacks = {
      disconnect: (): void => {},
      push: (): void => {},
      addstream: (): void => {},
      track: (): void => {},
      removestream: (): void => {},
      notify: (): void => {},
      log: (): void => {},
      timeout: (): void => {},
    };
    this.authMetadata = null;
    this.e2ee = null;
  }

  on(kind: keyof Callbacks, callback: Function): void {
    if (kind in this._callbacks) {
      this._callbacks[kind] = callback;
    }
  }

  disconnect(): Promise<[void, void, void]> {
    this.clientId = null;
    this.connectionId = null;
    this.authMetadata = null;
    this.remoteConnectionIds = [];
    const closeStream: Promise<void> = new Promise((resolve, _) => {
      if (!this.stream) return resolve();
      this.stream.getTracks().forEach((t) => {
        t.stop();
      });
      this.stream = null;
      return resolve();
    });
    const closeWebSocket: Promise<void> = new Promise((resolve, reject) => {
      if (!this._ws) return resolve();
      this._ws.onclose = null;

      let counter = 5;
      const timerId = setInterval(() => {
        if (!this._ws) {
          clearInterval(timerId);
          return reject("WebSocket Closing Error");
        }
        if (this._ws.readyState === 3) {
          this._ws = null;
          clearInterval(timerId);
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timerId);
          return reject("WebSocket Closing Error");
        }
      }, 1000);
      this._ws.close();
    });
    const closePeerConnection: Promise<void> = new Promise((resolve, reject) => {
      // Safari は signalingState が常に stable のため個別に処理する
      if (isSafari() && this._pc) {
        this._pc.oniceconnectionstatechange = null;
        this._pc.close();
        this._pc = null;
        return resolve();
      }
      if (!this._pc || this._pc.signalingState === "closed") return resolve();

      let counter = 5;
      const timerId = setInterval(() => {
        if (!this._pc) {
          clearInterval(timerId);
          return reject("PeerConnection Closing Error");
        }
        if (this._pc.signalingState === "closed") {
          clearInterval(timerId);
          this._pc.oniceconnectionstatechange = null;
          this._pc = null;
          return resolve();
        }
        --counter;
        if (counter < 0) {
          clearInterval(timerId);
          return reject("PeerConnection Closing Error");
        }
      }, 1000);
      this._pc.close();
    });
    if (this.e2ee) {
      this.e2ee.terminateWorker();
      this.e2ee = null;
    }
    return Promise.all([closeStream, closeWebSocket, closePeerConnection]);
  }

  _startE2EE(): void {
    if ("e2ee" in this.options && typeof this.options.e2ee === "string") {
      this.e2ee = new SoraE2EE(this.options.e2ee);
      this.e2ee.onWorkerDisconnect = (): void => {
        this.disconnect();
      };
      this.e2ee.startWorker();
    }
  }

  _signaling(offer: RTCSessionDescriptionInit): Promise<SignalingOfferMessage> {
    this._trace("CREATE OFFER SDP", offer);
    return new Promise((resolve, reject) => {
      const signalingMessage = createSignalingMessage(
        offer.sdp || "",
        this.role,
        this.channelId,
        this.metadata,
        this.options
      );
      if (this._ws === null) {
        this._ws = new WebSocket(this.signalingUrl);
      }
      this._ws.onclose = (e): void => {
        reject(e);
      };
      this._ws.onopen = (): void => {
        this._trace("SIGNALING CONNECT MESSAGE", signalingMessage);
        if (this._ws) {
          this._ws.send(JSON.stringify(signalingMessage));
        }
      };
      this._ws.onmessage = (event): void => {
        const data = JSON.parse(event.data);
        if (data.type == "offer") {
          this.clientId = data.client_id;
          this.connectionId = data.connection_id;
          if (this._ws) {
            this._ws.onclose = (e): void => {
              this.disconnect().then(() => {
                this._callbacks.disconnect(e);
              });
            };
            this._ws.onerror = null;
          }
          if ("metadata" in data) {
            this.authMetadata = data.metadata;
          }
          this._trace("SIGNALING OFFER MESSAGE", data);
          this._trace("OFFER SDP", data.sdp);
          resolve(data);
        } else if (data.type == "update") {
          this._trace("UPDATE SDP", data.sdp);
          this._update(data);
        } else if (data.type == "ping") {
          if (data.stats) {
            this._getStats().then((stats) => {
              if (this._ws) {
                this._ws.send(JSON.stringify({ type: "pong", stats: stats }));
              }
            });
          } else {
            if (this._ws) {
              this._ws.send(JSON.stringify({ type: "pong" }));
            }
          }
        } else if (data.type == "push") {
          this._callbacks.push(data);
        } else if (data.type == "notify") {
          this._callbacks.notify(data);
        }
      };
    });
  }

  async _createOffer(): Promise<RTCSessionDescriptionInit> {
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

  async _connectPeerConnection(message: SignalingOfferMessage): Promise<void> {
    const messageConfig = message.config || {};
    let config = messageConfig;
    if (this.e2ee) {
      // @ts-ignore
      config["forceEncodedVideoInsertableStreams"] = true;
      // @ts-ignore
      config["forceEncodedAudioInsertableStreams"] = true;
    }
    if (window.RTCPeerConnection.generateCertificate !== undefined) {
      const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
      config = Object.assign({ certificates: [certificate] }, messageConfig);
    }
    this._trace("PEER CONNECTION CONFIG", config);
    this._pc = new window.RTCPeerConnection(config, this.constraints);
    this._pc.oniceconnectionstatechange = (_): void => {
      if (this._pc) {
        this._trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this._pc.iceConnectionState);
      }
    };
    return;
  }

  async _setRemoteDescription(message: SignalingOfferMessage | SignalingUpdateMessage): Promise<void> {
    if (!this._pc) {
      return;
    }
    await this._pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: message.sdp }));
    return;
  }

  async _createAnswer(message: SignalingOfferMessage | SignalingUpdateMessage): Promise<void> {
    if (!this._pc) {
      return;
    }
    // simulcast の場合
    if (
      this.options.simulcast &&
      (this.role === "upstream" || this.role === "sendrecv" || this.role === "sendonly") &&
      message.encodings
    ) {
      const transceiver = this._pc.getTransceivers().find((t) => {
        if (t.mid && 0 <= t.mid.indexOf("video") && t.currentDirection == null) {
          return t;
        }
      });
      if (!transceiver) {
        throw new Error("Simulcast Error");
      }
      await this._setSenderParameters(transceiver, message.encodings);
    }
    const sessionDescription = await this._pc.createAnswer();
    await this._pc.setLocalDescription(sessionDescription);
    return;
  }

  _setSenderParameters(transceiver: RTCRtpTransceiver, encodings: Encoding[]): Promise<void> {
    const originalParameters = transceiver.sender.getParameters();
    // @ts-ignore
    originalParameters.encodings = encodings;
    return transceiver.sender.setParameters(originalParameters);
  }

  _sendAnswer(): void {
    if (this._pc && this._ws && this._pc.localDescription) {
      this._trace("ANSWER SDP", this._pc.localDescription.sdp);
      this._ws.send(JSON.stringify({ type: "answer", sdp: this._pc.localDescription.sdp }));
    }
    return;
  }

  _sendUpdateAnswer(): void {
    if (this._pc && this._ws && this._pc.localDescription) {
      this._trace("ANSWER SDP", this._pc.localDescription.sdp);
      this._ws.send(JSON.stringify({ type: "update", sdp: this._pc.localDescription.sdp }));
    }
    return;
  }

  _onIceCandidate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = setInterval(() => {
        if (this._pc === null) {
          clearInterval(timerId);
          const error = new Error();
          error.message = "ICECANDIDATE TIMEOUT";
          reject(error);
        } else if (this._pc && this._pc.iceConnectionState === "connected") {
          clearInterval(timerId);
          resolve();
        }
      }, 100);
      if (this._pc) {
        this._pc.onicecandidate = (event): void => {
          if (this._pc) {
            this._trace("ONICECANDIDATE ICEGATHERINGSTATE", this._pc.iceGatheringState);
          }
          if (event.candidate === null) {
            clearInterval(timerId);
            resolve();
          } else {
            const candidate = event.candidate.toJSON();
            const message = Object.assign(candidate, { type: "candidate" });
            this._trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
            if (this._ws) {
              this._ws.send(JSON.stringify(message));
            }
          }
        };
      }
    });
  }

  async _update(message: SignalingUpdateMessage): Promise<void> {
    await this._setRemoteDescription(message);
    await this._createAnswer(message);
    this._sendUpdateAnswer();
  }

  async _getStats(): Promise<RTCStatsReport[]> {
    const stats: RTCStatsReport[] = [];
    if (!this._pc) {
      return stats;
    }
    const reports = await this._pc.getStats();
    reports.forEach((s) => {
      stats.push(s);
    });
    return stats;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _trace(title: string, message: any): void {
    this._callbacks.log(title, message);
    if (!this.debug) {
      return;
    }
    trace(this.clientId, title, message);
  }
}
