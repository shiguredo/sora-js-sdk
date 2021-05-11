import {
  createSignalingMessage,
  getPreKeyBundle,
  getSignalingNotifyData,
  getSignalingNotifyAuthnMetadata,
  createDataChannelEvent,
  createSignalingEvent,
  trace,
  isSafari,
  ConnectError,
} from "./utils";
import {
  Callbacks,
  ConnectionOptions,
  JSONType,
  SignalingEvent,
  SignalingMessage,
  SignalingPingMessage,
  SignalingPushMessage,
  SignalingOfferMessage,
  SignalingUpdateMessage,
  SignalingReOfferMessage,
  SignalingNotifyMessage,
  TransportType,
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
  dataChannelSignaling: boolean;
  dataChannelLabels: string[];
  protected ws: WebSocket | null;
  protected callbacks: Callbacks;
  protected e2ee: SoraE2EE | null;
  protected connectionTimeoutTimerId: number;
  protected dataChannels: {
    [key in string]?: RTCDataChannel;
  };
  private ignoreDisconnectWebSocket: boolean;
  private closeWebSocket: boolean;
  private connectionTimeout: number;
  private dataChannelSignalingTimeout: number;
  private dataChannelSignalingTimeoutId: number;

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
    // connection timeout の初期値をセットする
    this.connectionTimeout = 60000;
    if (typeof this.options.timeout === "number") {
      console.warn("@deprecated timeout option will be removed in a future version. Use connectionTimeout.");
      this.connectionTimeout = this.options.timeout;
    }
    if (typeof this.options.connectionTimeout === "number") {
      this.connectionTimeout = this.options.connectionTimeout;
    }
    // closeWebsocket の初期値をセットする
    this.closeWebSocket = true;
    if (typeof this.options.closeWebSocket === "boolean") {
      this.closeWebSocket = this.options.closeWebSocket;
    }
    // DataChannel signaling timeout の初期値をセットする
    this.dataChannelSignalingTimeout = 3000;
    if (typeof this.options.dataChannelSignalingTimeout === "number") {
      this.dataChannelSignalingTimeout = this.options.dataChannelSignalingTimeout;
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
      signaling: (): void => {},
    };
    this.authMetadata = null;
    this.e2ee = null;
    this.connectionTimeoutTimerId = 0;
    this.dataChannelSignalingTimeoutId = 0;
    this.dataChannels = {};
    this.ignoreDisconnectWebSocket = false;
    this.dataChannelSignaling = false;
    this.dataChannelLabels = [];
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

  private stopStream(): Promise<void> {
    return new Promise((resolve, _) => {
      if (this.debug) {
        console.warn(
          "@deprecated closing MediaStream in disconnect will be removed in a future version. Close every track in the MediaStream by yourself."
        );
      }
      if (!this.stream) {
        return resolve();
      }
      this.stream.getTracks().forEach((t) => {
        t.stop();
      });
      this.stream = null;
      return resolve();
    });
  }

  private disconnectWebSocket(): Promise<void> {
    return new Promise((resolve, _) => {
      if (!this.ws) {
        return resolve();
      }
      if (this.ws.readyState === 1) {
        const message = { type: "disconnect" };
        this.ws.send(JSON.stringify(message));
        this.callbacks.signaling(createSignalingEvent("disconnect", message, "websocket"));
      }
      this.ws.close();
      this.ws = null;
      return resolve();
    });
  }

  private disconnectDataChannel(): Promise<void> {
    return new Promise((resolve, _) => {
      if (!this.dataChannels["signaling"]) {
        return resolve();
      }
      if (this.dataChannels["signaling"].readyState === "open") {
        const message = { type: "disconnect" };
        this.dataChannels["signaling"].send(JSON.stringify(message));
        this.callbacks.signaling(createSignalingEvent("disconnect", message, "datachannel"));
      }
      // DataChannel 切断を待つ
      setTimeout(() => {
        Object.keys(this.dataChannels).forEach((key) => {
          delete this.dataChannels[key];
        });
        return resolve();
      }, 100);
    });
  }

  private disconnectPeerConnection(): Promise<void> {
    return new Promise((resolve, _reject) => {
      if (!this.pc || this.pc.connectionState === "closed" || this.pc.connectionState === undefined) {
        return resolve();
      }
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
    await this.stopStream();
    await this.disconnectDataChannel();
    await this.disconnectWebSocket();
    await this.disconnectPeerConnection();
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
        this.callbacks.signaling(createSignalingEvent("connect", this.signalingUrl, "websocket"));
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
      this.ws.onopen = async (event): Promise<void> => {
        const signalingEvent = Object.assign(event, { transportType: "websocket" }) as SignalingEvent;
        this.callbacks.signaling(signalingEvent);
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
          this.callbacks.signaling(
            createSignalingEvent(`send-${signalingMessage.type}`, signalingMessage, "websocket")
          );
        }
      };
      this.ws.onmessage = async (event): Promise<void> => {
        // E2EE 時専用処理
        if (event.data instanceof ArrayBuffer) {
          this.callbacks.signaling(createSignalingEvent("onmessage-e2ee", event.data, "websocket"));
          this.signalingOnMessageE2EE(event.data);
          return;
        }
        const message = JSON.parse(event.data) as SignalingMessage;
        if (message.type == "offer") {
          this.callbacks.signaling(createSignalingEvent("onmessage-offer", message, "websocket"));
          this.signalingOnMessageTypeOffer(message);
          resolve(message);
        } else if (message.type == "update") {
          this.callbacks.signaling(createSignalingEvent("onmessage-update", message, "websocket"));
          await this.signalingOnMessageTypeUpdate(message);
        } else if (message.type == "re-offer") {
          this.callbacks.signaling(createSignalingEvent("onmessage-re-offer", message, "websocket"));
          await this.signalingOnMessageTypeReOffer(message);
        } else if (message.type == "ping") {
          this.callbacks.signaling(createSignalingEvent("onmessage-ping", message, "websocket"));
          await this.signalingOnMessageTypePing(message);
        } else if (message.type == "push") {
          this.callbacks.push(message, "websocket");
        } else if (message.type == "notify") {
          this.signalingOnMessageTypeNotify(message, "websocket");
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
    let config = Object.assign({}, message.config);
    if (this.e2ee) {
      // @ts-ignore https://w3c.github.io/webrtc-encoded-transform/#specification
      config = Object.assign({ encodedInsertableStreams: true }, config);
    }
    if (window.RTCPeerConnection.generateCertificate !== undefined) {
      const certificate = await window.RTCPeerConnection.generateCertificate({ name: "ECDSA", namedCurve: "P-256" });
      config = Object.assign({ certificates: [certificate] }, config);
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
      const message = { type: "answer", sdp: this.pc.localDescription.sdp };
      this.ws.send(JSON.stringify(message));
      this.callbacks.signaling(createSignalingEvent("send-answer", message, "websocket"));
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
            const message = Object.assign(candidate, { type: "candidate" }) as { type: string; [key: string]: unknown };
            this.trace("ONICECANDIDATE CANDIDATE MESSAGE", message);
            this.sendMessage(message);
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
        } else if (this.pc && this.pc.connectionState === "connected") {
          clearInterval(timerId);
          this.monitorDataChannelMessage();
          resolve();
        }
      }, 100);
    });
  }

  protected setConnectionTimeout(): Promise<MediaStream> {
    return new Promise((_, reject) => {
      if (0 < this.connectionTimeout) {
        this.connectionTimeoutTimerId = setTimeout(async () => {
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
        }, this.connectionTimeout);
      }
    });
  }

  protected clearConnectionTimeout(): void {
    clearTimeout(this.connectionTimeoutTimerId);
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
          this.callbacks.signaling(createSignalingEvent("send-e2ee", message.buffer, "websocket"));
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
    if (message.metadata !== undefined) {
      this.authMetadata = message.metadata;
    }
    if (Array.isArray(message.encodings)) {
      this.encodings = message.encodings;
    }
    if (message.ignore_disconnect_websocket !== undefined) {
      this.ignoreDisconnectWebSocket = message.ignore_disconnect_websocket;
    }
    if (message.data_channel_signaling !== undefined) {
      this.dataChannelSignaling = message.data_channel_signaling;
    }
    if (message.data_channel_labels !== undefined && Array.isArray(message.data_channel_labels)) {
      this.dataChannelLabels = message.data_channel_labels;
    }
    this.trace("SIGNALING OFFER MESSAGE", message);
    this.trace("OFFER SDP", message.sdp);
  }

  private sendUpdateAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace("ANSWER SDP", this.pc.localDescription.sdp);
      this.sendMessage({ type: "update", sdp: this.pc.localDescription.sdp });
    }
  }

  private sendReAnswer(): void {
    if (this.pc && this.pc.localDescription) {
      this.trace("RE ANSWER SDP", this.pc.localDescription.sdp);
      this.sendMessage({ type: "re-answer", sdp: this.pc.localDescription.sdp });
    }
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
    if (!this.ws) {
      return;
    }
    const pongMessage: { type: "pong"; stats?: RTCStatsReport[] } = { type: "pong" };
    if (message.stats) {
      const stats = await this.getStats();
      pongMessage.stats = stats;
    }
    this.ws.send(JSON.stringify(pongMessage));
    this.callbacks.signaling(createSignalingEvent("send-pong", pongMessage, "websocket"));
  }

  private signalingOnMessageTypeNotify(message: SignalingNotifyMessage, transportType: TransportType): void {
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
    this.callbacks.notify(message, transportType);
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
    this.callbacks.datachannel(createDataChannelEvent("ondatachannel", dataChannelEvent.channel));
    // onbufferedamountlow
    dataChannelEvent.channel.onbufferedamountlow = (event): void => {
      const channel = event.currentTarget as RTCDataChannel;
      this.callbacks.datachannel(createDataChannelEvent("onbufferedamountlow", channel));
    };
    // onopen
    dataChannelEvent.channel.onopen = async (event): Promise<void> => {
      const channel = event.currentTarget as RTCDataChannel;
      this.callbacks.datachannel(createDataChannelEvent("onopen", channel));
      this.dataChannels[channel.label] = channel;
      this.trace("OPEN DATA CHANNEL", channel.label);
      if (channel.label === "signaling" && this.ws) {
        this.ws.onclose = async (e): Promise<void> => {
          if (!this.ignoreDisconnectWebSocket) {
            this.callbacks.disconnect(e);
            await this.disconnect();
          }
        };
        const signalingEvent = Object.assign(event, { transportType: "datachannel" }) as SignalingEvent;
        this.callbacks.signaling(signalingEvent);
      }
      // signaling offer で受け取った labels と open したラベルがすべて一致したかどうか
      const isOpenAllDataChannels = this.dataChannelLabels.every(
        (label) => 0 <= Object.keys(this.dataChannels).indexOf(label)
      );
      if (isOpenAllDataChannels && this.ignoreDisconnectWebSocket && this.closeWebSocket) {
        await this.disconnectWebSocket();
      }
    };
    // onclose
    dataChannelEvent.channel.onclose = async (event): Promise<void> => {
      const channel = event.currentTarget as RTCDataChannel;
      this.callbacks.datachannel(createDataChannelEvent("onclose", channel));
      this.trace("CLOSE DATA CHANNEL", channel.label);
      if (this.ignoreDisconnectWebSocket && channel.label === "signaling") {
        const closeEvent = new CloseEvent("close", { code: 4999 });
        this.callbacks.disconnect(closeEvent);
        await this.disconnect();
      }
    };
    // onerror
    dataChannelEvent.channel.onerror = (event): void => {
      const channel = event.currentTarget as RTCDataChannel;
      this.callbacks.datachannel(createDataChannelEvent("onerror", channel));
      this.trace("ERROR DATA CHANNEL", channel.label);
    };
    // onmessage
    dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
      // DataChannel の timeout 処理を初期化する
      this.monitorDataChannelMessage();
      const channel = event.currentTarget as RTCDataChannel;
      if (channel.label === "signaling") {
        const message = JSON.parse(event.data) as SignalingMessage;
        this.callbacks.signaling(createSignalingEvent(`onmessage-${message.type}`, message, "datachannel"));
        if (message.type === "re-offer") {
          await this.signalingOnMessageTypeReOffer(message);
        }
      } else if (channel.label === "notify") {
        const message = JSON.parse(event.data) as SignalingNotifyMessage;
        this.signalingOnMessageTypeNotify(message, "datachannel");
      } else if (channel.label === "push") {
        const message = JSON.parse(event.data) as SignalingPushMessage;
        this.callbacks.push(message, "datachannel");
      } else if (channel.label === "e2ee") {
        const data = event.data as ArrayBuffer;
        this.signalingOnMessageE2EE(data);
      } else if (channel.label === "stats") {
        if (event.currentTarget) {
          const channel = event.currentTarget as RTCDataChannel;
          const stats = await this.getStats();
          const sendMessage = {
            type: "stats",
            reports: stats,
          };
          channel.send(JSON.stringify(sendMessage));
        }
      }
    };
  }

  private sendMessage(message: { type: string; [key: string]: unknown }): void {
    if (this.dataChannels.signaling) {
      this.dataChannels.signaling.send(JSON.stringify(message));
      this.callbacks.signaling(createSignalingEvent(`send-${message.type}`, message, "datachannel"));
    } else if (this.ws !== null) {
      this.ws.send(JSON.stringify(message));
      this.callbacks.signaling(createSignalingEvent(`send-${message.type}`, message, "websocket"));
    }
  }

  private sendE2EEMessage(message: ArrayBuffer): void {
    if (this.dataChannels.e2ee) {
      this.dataChannels.e2ee.send(message);
      this.callbacks.signaling(createSignalingEvent("send-e2ee", message, "datachannel"));
    } else if (this.ws !== null) {
      this.ws.send(message);
      this.callbacks.signaling(createSignalingEvent("send-e2ee", message, "websocket"));
    }
  }

  private monitorDataChannelMessage(): void {
    clearTimeout(this.dataChannelSignalingTimeoutId);
    this.dataChannelSignalingTimeoutId = setTimeout(async () => {
      await this.disconnect();
    }, this.dataChannelSignalingTimeout);
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
