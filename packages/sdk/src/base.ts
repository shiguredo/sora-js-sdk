import {
  createSignalingMessage,
  getPreKeyBundle,
  getSignalingNotifyData,
  getSignalingNotifyAuthnMetadata,
  trace,
  isSafari,
  ConnectError,
} from "./utils";
import {
  Callbacks,
  ConnectionOptions,
  DataChannelType,
  JSONType,
  SignalingMessage,
  SignalingPingMessage,
  SignalingPushMessage,
  SignalingOfferMessage,
  SignalingUpdateMessage,
  SignalingReOfferMessage,
  SignalingNotifyMessage,
} from "./types";
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
  metadata: JSONType | undefined;
  signalingUrl: string;
  options: ConnectionOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constraints: any;
  debug: boolean;
  clientId: string | null;
  connectionId: string | null;
  remoteConnectionIds: string[];
  stream: MediaStream | null;
  authMetadata: JSONType;
  pc: RTCPeerConnection | null;
  encodings: RTCRtpEncodingParameters[];
  protected ws: WebSocket | null;
  protected callbacks: Callbacks;
  protected e2ee: SoraE2EE | null;
  protected timeoutTimerId: number;
  protected dataChannels: {
    [key in DataChannelType]?: RTCDataChannel;
  };
  private ignoreDisconnectWebsokect: boolean;

  constructor(
    signalingUrl: string,
    role: string,
    channelId: string,
    metadata: JSONType,
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
      datachannel: (): void => {},
    };
    this.authMetadata = null;
    this.e2ee = null;
    this.timeoutTimerId = 0;
    this.dataChannels = {};
    this.ignoreDisconnectWebsokect = false;
  }

  on<T extends keyof Callbacks, U extends Callbacks[T]>(kind: T, callback: U): void {
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

  private closeStream(): Promise<void> {
    return new Promise((resolve, _) => {
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
  }

  private closeWebSocket(): Promise<void> {
    return new Promise((resolve, _) => {
      if (!this.ws) return resolve();
      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({ type: "disconnect" }));
      }
      this.ws.close();
      this.ws = null;
      return resolve();
    });
  }

  private closeDataChannel(): Promise<void> {
    return new Promise((resolve, _) => {
      if (!this.dataChannels["signaling"]) {
        return resolve();
      }
      if (this.dataChannels["signaling"].readyState === "open") {
        this.dataChannels["signaling"].send(JSON.stringify({ type: "disconnect" }));
      }
      Object.keys(this.dataChannels).forEach((key) => {
        switch (key) {
          case "signaling":
          case "notify":
          case "ping":
          case "e2ee":
            delete this.dataChannels[key];
        }
      });
      return resolve();
    });
  }

  private closePeerConnection(): Promise<void> {
    return new Promise((resolve, _reject) => {
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
  }

  async disconnect(): Promise<void> {
    this.clientId = null;
    this.connectionId = null;
    this.authMetadata = null;
    this.remoteConnectionIds = [];
    await this.closeStream();
    await this.closeWebSocket();
    await this.closeDataChannel();
    await this.closePeerConnection();
    if (this.e2ee) {
      this.e2ee.terminateWorker();
      this.e2ee = null;
    }
    return;
  }

  protected setupE2EE(): void {
    if (this.options.e2ee === true) {
      this.e2ee = new SoraE2EE();
      this.e2ee.onWorkerDisconnect = async (): Promise<void> => {
        await this.disconnect();
      };
      this.e2ee.startWorker();
    }
  }

  protected startE2EE(): void {
    if (this.options.e2ee === true && this.e2ee) {
      if (!this.connectionId) {
        const error = new Error();
        error.message = `E2EE failed. Self connectionId is null`;
        throw error;
      }
      this.e2ee.clearWorker();
      const result = this.e2ee.start(this.connectionId);
      this.e2ee.postSelfSecretKeyMaterial(this.connectionId, result.selfKeyId, result.selfSecretKeyMaterial);
    }
  }

  protected signaling(offer: RTCSessionDescriptionInit): Promise<SignalingOfferMessage> {
    this.trace("CREATE OFFER SDP", offer);
    return new Promise((resolve, reject) => {
      if (this.ws === null) {
        this.ws = new WebSocket(this.signalingUrl);
      }
      this.ws.binaryType = "arraybuffer";
      this.ws.onclose = (event): void => {
        const error = new ConnectError(
          `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`
        );
        error.code = event.code;
        error.reason = event.reason;
        reject(error);
      };
      this.ws.onopen = async (): Promise<void> => {
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
        this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
        if (this.ws) {
          this.ws.send(JSON.stringify(signalingMessage));
        }
      };
      this.ws.onmessage = async (event): Promise<void> => {
        // E2EE 時専用処理
        if (event.data instanceof ArrayBuffer) {
          this.signalingOnMessageE2EE(event.data);
          return;
        }
        const message = JSON.parse(event.data) as SignalingMessage;
        if (message.type == "offer") {
          this.signalingOnMessageTypeOffer(message);
          resolve(message);
        } else if (message.type == "update") {
          await this.signalingOnMessageTypeUpdate(message);
        } else if (message.type == "ping") {
          await this.signalingOnMessageTypePing(message);
        } else if (message.type == "push") {
          this.callbacks.push(message);
        } else if (message.type == "notify") {
          this.signalingOnMessageTypeNotify(message);
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
    if (message.ignore_disconnect_websocket !== undefined) {
      this.ignoreDisconnectWebsokect = message.ignore_disconnect_websocket;
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
    this.pc.ondatachannel = (event): void => {
      this.onDataChannel(event);
    };
    return;
  }

  protected async setRemoteDescription(
    message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage
  ): Promise<void> {
    if (!this.pc) {
      return;
    }
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: message.sdp }));
    return;
  }

  protected async createAnswer(
    message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage
  ): Promise<void> {
    if (!this.pc) {
      return;
    }
    // simulcast の場合
    if (this.options.simulcast && (this.role === "sendrecv" || this.role === "sendonly")) {
      const transceiver = this.pc.getTransceivers().find((t) => {
        if (
          t.mid &&
          0 <= t.mid.indexOf("video") &&
          t.sender.track !== null &&
          (t.currentDirection === null || t.currentDirection === "sendonly")
        ) {
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
          // TODO(yuito): Firefox は <empty string> を投げてくるようになったので対応する
          if (event.candidate === null) {
            clearInterval(timerId);
            resolve();
          } else {
            const candidate = event.candidate.toJSON();
            const message = Object.assign(candidate, { type: "candidate" });
            this.trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
            this.sendMessage(JSON.stringify(message));
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
        this.timeoutTimerId = setTimeout(async () => {
          if (
            !this.pc ||
            (this.pc && this.pc.connectionState !== undefined && this.pc.connectionState !== "connected")
          ) {
            const error = new Error();
            error.message = "CONNECTION TIMEOUT";
            this.callbacks.timeout();
            await this.disconnect();
            reject(error);
          }
        }, this.options.timeout);
      }
    });
  }

  protected clearConnectionTimeout(): void {
    clearTimeout(this.timeoutTimerId);
  }

  protected trace(title: string, message: unknown): void {
    this.callbacks.log(title, message as JSONType);
    if (!this.debug) {
      return;
    }
    trace(this.clientId, title, message);
  }

  private signalingOnMessageE2EE(data: ArrayBuffer): void {
    if (this.e2ee) {
      const message = new Uint8Array(data);
      const result = this.e2ee.receiveMessage(message);
      this.e2ee.postRemoteSecretKeyMaterials(result);
      result.messages.forEach((message) => {
        if (this.ws) {
          this.ws.send(message.buffer);
        }
      });
    }
  }

  private signalingOnMessageTypeOffer(message: SignalingOfferMessage): void {
    this.clientId = message.client_id;
    this.connectionId = message.connection_id;
    if (this.ws) {
      this.ws.onclose = async (e): Promise<void> => {
        this.callbacks.disconnect(e);
        await this.disconnect();
      };
      this.ws.onerror = null;
    }
    if ("metadata" in message && message.metadata !== undefined) {
      this.authMetadata = message.metadata;
    }
    if ("encodings" in message && Array.isArray(message.encodings)) {
      this.encodings = message.encodings;
    }
    this.trace("SIGNALING OFFER MESSAGE", message);
    this.trace("OFFER SDP", message.sdp);
  }

  private sendUpdateAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace("ANSWER SDP", this.pc.localDescription.sdp);
      this.sendMessage(JSON.stringify({ type: "update", sdp: this.pc.localDescription.sdp }));
    }
    return;
  }

  private sendReAnswer(): void {
    if (this.pc && this.pc.localDescription) {
      this.trace("RE ANSWER SDP", this.pc.localDescription.sdp);
      this.sendMessage(JSON.stringify({ type: "re-answer", sdp: this.pc.localDescription.sdp }));
    }
    return;
  }

  private async signalingOnMessageTypeUpdate(message: SignalingUpdateMessage): Promise<void> {
    this.trace("SIGNALING UPDATE MESSGE", message);
    this.trace("UPDATE SDP", message.sdp);
    await this.setRemoteDescription(message);
    await this.createAnswer(message);
    this.sendUpdateAnswer();
  }

  private async signalingOnMessageTypeReOffer(message: SignalingReOfferMessage): Promise<void> {
    this.trace("SIGNALING RE OFFER MESSGE", message);
    this.trace("RE OFFER SDP", message.sdp);
    await this.setRemoteDescription(message);
    await this.createAnswer(message);
    this.sendReAnswer();
  }

  private async signalingOnMessageTypePing(message: SignalingPingMessage): Promise<void> {
    if (message.stats) {
      const stats = await this.getStats();
      if (this.ws) {
        this.ws.send(JSON.stringify({ type: "pong", stats: stats }));
      }
    } else {
      if (this.ws) {
        this.ws.send(JSON.stringify({ type: "pong" }));
      }
    }
  }

  private signalingDataChannelOnMessageTypePing(): void {
    if (!this.dataChannels.signaling) {
      return;
    }
    this.dataChannels.signaling.send(JSON.stringify({ type: "pong" }));
  }

  private signalingOnMessageTypeNotify(message: SignalingNotifyMessage): void {
    if (message.event_type === "connection.created") {
      const connectionId = message.connection_id;
      if (this.connectionId !== connectionId) {
        const authnMetadata = getSignalingNotifyAuthnMetadata(message);
        const preKeyBundle = getPreKeyBundle(authnMetadata);
        if (preKeyBundle && this.e2ee && connectionId) {
          const result = this.e2ee.startSession(connectionId, preKeyBundle);
          this.e2ee.postRemoteSecretKeyMaterials(result);
          result.messages.forEach((message) => {
            this.sendE2EEMessage(message.buffer);
          });
          // messages を送信し終えてから、selfSecretKeyMaterial を更新する
          this.e2ee.postSelfSecretKeyMaterial(result.selfConnectionId, result.selfKeyId, result.selfSecretKeyMaterial);
        }
      }
      const data = getSignalingNotifyData(message);
      data.forEach((metadata) => {
        const authnMetadata = getSignalingNotifyAuthnMetadata(metadata);
        const preKeyBundle = getPreKeyBundle(authnMetadata);
        const connectionId = metadata.connection_id;
        if (connectionId && this.e2ee && preKeyBundle) {
          this.e2ee.addPreKeyBundle(connectionId, preKeyBundle);
        }
      });
    } else if (message.event_type === "connection.destroyed") {
      const authnMetadata = getSignalingNotifyAuthnMetadata(message);
      const preKeyBundle = getPreKeyBundle(authnMetadata);
      const connectionId = message.connection_id;
      if (preKeyBundle && this.e2ee && connectionId) {
        const result = this.e2ee.stopSession(connectionId);
        this.e2ee.postSelfSecretKeyMaterial(
          result.selfConnectionId,
          result.selfKeyId,
          result.selfSecretKeyMaterial,
          5000
        );
        result.messages.forEach((message) => {
          this.sendE2EEMessage(message.buffer);
        });
        this.e2ee.postRemoveRemoteDeriveKey(connectionId);
      }
    }
    this.callbacks.notify(message);
  }

  private async setSenderParameters(
    transceiver: RTCRtpTransceiver,
    encodings: RTCRtpEncodingParameters[]
  ): Promise<void> {
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

  private onDataChannel(dataChannelEvent: RTCDataChannelEvent): void {
    dataChannelEvent.channel.onbufferedamountlow = (event): void => {
      this.callbacks.datachannel(event);
    };
    dataChannelEvent.channel.onopen = (event): void => {
      this.callbacks.datachannel(event);
      if (!event.currentTarget) {
        return;
      }
      const channel = event.currentTarget as RTCDataChannel;
      switch (channel.label) {
        case "signaling":
        case "notify":
        case "ping":
        case "e2ee":
          this.dataChannels[channel.label] = channel;
      }
      if (channel.label === "signaling" && this.ws) {
        this.ws.onclose = async (e): Promise<void> => {
          if (!this.ignoreDisconnectWebsokect) {
            this.callbacks.disconnect(e);
            await this.disconnect();
          }
        };
      }
    };
    dataChannelEvent.channel.onclose = (event): void => {
      this.callbacks.datachannel(event);
    };
    dataChannelEvent.channel.onerror = (event): void => {
      this.callbacks.datachannel(event);
    };
    if (dataChannelEvent.channel.label === "signaling") {
      dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
        if (event.currentTarget) {
          const message = JSON.parse(event.data) as SignalingMessage;
          // this.callbacks.datachannel(channel.id, channel.label, "onmessage", message);
          if (message.type === "re-offer") {
            await this.signalingOnMessageTypeReOffer(message);
          } else if (message.type === "ping") {
            this.signalingDataChannelOnMessageTypePing();
          }
        }
      };
    } else if (dataChannelEvent.channel.label === "notify") {
      dataChannelEvent.channel.onmessage = (event): void => {
        if (event.currentTarget) {
          const message = JSON.parse(event.data) as SignalingNotifyMessage;
          this.signalingOnMessageTypeNotify(message);
        }
      };
    } else if (dataChannelEvent.channel.label === "push") {
      dataChannelEvent.channel.onmessage = (event): void => {
        if (event.currentTarget) {
          const message = JSON.parse(event.data) as SignalingPushMessage;
          this.callbacks.push(message);
        }
      };
    } else if (dataChannelEvent.channel.label === "e2ee") {
      dataChannelEvent.channel.onmessage = (event): void => {
        if (event.currentTarget) {
          const data = event.data as ArrayBuffer;
          this.signalingOnMessageE2EE(data);
        }
      };
    } else if (dataChannelEvent.channel.label === "stats") {
      dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
        if (event.currentTarget) {
          const channel = event.currentTarget as RTCDataChannel;
          const stats = await this.getStats();
          channel.send(JSON.stringify(stats));
        }
      };
    }
  }

  private sendMessage(message: string): void {
    if (this.dataChannels.signaling) {
      this.dataChannels.signaling.send(message);
    } else if (this.ws !== null) {
      this.ws.send(message);
    }
  }

  private sendE2EEMessage(message: ArrayBuffer): void {
    if (this.dataChannels.e2ee) {
      this.dataChannels.e2ee.send(message);
    } else if (this.ws !== null) {
      this.ws.send(message);
    }
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
