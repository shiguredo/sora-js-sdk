import { unzlibSync, zlibSync } from "fflate";
import {
  ConnectError,
  createDataChannelData,
  createSignalingEvent,
  createSignalingMessage,
  createTimelineEvent,
  getPreKeyBundle,
  getSignalingNotifyAuthnMetadata,
  getSignalingNotifyData,
  isSafari,
  trace,
} from "./utils";
import {
  Callbacks,
  ConnectionOptions,
  JSONType,
  SignalingConnectMessage,
  SignalingMessage,
  SignalingPingMessage,
  SignalingPushMessage,
  SignalingOfferMessage,
  SignalingUpdateMessage,
  SignalingReOfferMessage,
  SignalingNotifyMessage,
  SignalingReqStatsMessage,
  SignalingSwitchedMessage,
  TransportType,
} from "./types";
import SoraE2EE from "@sora/e2ee";

declare global {
  interface Algorithm {
    namedCurve: string;
  }
}

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
  protected connectionTimeoutTimerId: number;
  protected dataChannels: {
    [key in string]?: RTCDataChannel;
  };
  private dataChannelsCompress: {
    [key in string]?: boolean;
  };
  private connectionTimeout: number;
  private disconnectWaitTimeout: number;
  private mids: {
    audio: string;
    video: string;
  };
  private signalingSwitched: boolean;
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
    // WebSocket/DataChannel の disconnect timeout の初期値をセットする
    this.disconnectWaitTimeout = 3000;
    if (typeof this.options.disconnectWaitTimeout === "number") {
      this.disconnectWaitTimeout = this.options.disconnectWaitTimeout;
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
      timeline: (): void => {},
      signaling: (): void => {},
    };
    this.authMetadata = null;
    this.e2ee = null;
    this.connectionTimeoutTimerId = 0;
    this.dataChannels = {};
    this.mids = {
      audio: "",
      video: "",
    };
    this.signalingSwitched = false;
    this.dataChannelsCompress = {};
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

  stopAudioTrack(stream: MediaStream): Promise<void> {
    for (const track of stream.getAudioTracks()) {
      track.enabled = false;
    }
    return new Promise((resolve) => {
      // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
      setTimeout(async () => {
        for (const track of stream.getAudioTracks()) {
          track.stop();
          stream.removeTrack(track);
          if (this.pc !== null) {
            const sender = this.pc.getSenders().find((s) => {
              return s.track && s.track.id === track.id;
            });
            if (sender) {
              await sender.replaceTrack(null);
            }
          }
        }
        resolve();
      }, 100);
    });
  }

  stopVideoTrack(stream: MediaStream): Promise<void> {
    for (const track of stream.getVideoTracks()) {
      track.enabled = false;
    }
    return new Promise((resolve) => {
      // すぐに stop すると視聴側に静止画像が残ってしまうので enabled false にした 100ms 後に stop する
      setTimeout(async () => {
        for (const track of stream.getVideoTracks()) {
          track.stop();
          stream.removeTrack(track);
          if (this.pc !== null) {
            const sender = this.pc.getSenders().find((s) => {
              return s.track && s.track.id === track.id;
            });
            if (sender) {
              await sender.replaceTrack(null);
            }
          }
        }
        resolve();
      }, 100);
    });
  }

  async replaceAudioTrack(stream: MediaStream, audioTrack: MediaStreamTrack): Promise<void> {
    await this.stopAudioTrack(stream);
    const transceiver = this.getAudioTransceiver();
    if (transceiver === null) {
      throw new Error("Unable to set an audio track. Audio track sender is undefined");
    }
    stream.addTrack(audioTrack);
    await transceiver.sender.replaceTrack(audioTrack);
  }

  async replaceVideoTrack(stream: MediaStream, videoTrack: MediaStreamTrack): Promise<void> {
    await this.stopVideoTrack(stream);
    const transceiver = this.getVideoTransceiver();
    if (transceiver === null) {
      throw new Error("Unable to set video track. Video track sender is undefined");
    }
    stream.addTrack(videoTrack);
    await transceiver.sender.replaceTrack(videoTrack);
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

  private terminateWebSocket(): Promise<CloseEvent | null> {
    let timerId = 0;
    if (this.signalingSwitched) {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      return Promise.resolve(null);
    }
    return new Promise((resolve, _) => {
      if (!this.ws) {
        return resolve(null);
      }
      this.ws.onclose = (event) => {
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }
        clearTimeout(timerId);
        this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
        return resolve(event);
      };
      if (this.ws.readyState === 1) {
        const message = { type: "disconnect" };
        this.ws.send(JSON.stringify(message));
        this.writeWebSocketSignalingLog("send-disconnect", message);
        // WebSocket 切断を待つ
        timerId = setTimeout(() => {
          if (this.ws) {
            this.ws.close();
            this.ws = null;
          }
          // ws close で onclose が呼ばれない、または途中で ws が null になった場合の対応
          setTimeout(() => {
            const closeEvent = new CloseEvent("close", { code: 4995 });
            return resolve(closeEvent);
          }, 500);
        }, this.disconnectWaitTimeout);
      } else {
        // ws の state が open ではない場合は後処理をして終わる
        this.ws.close();
        this.ws = null;
        const closeEvent = new CloseEvent("close", { code: 4996 });
        return resolve(closeEvent);
      }
    });
  }

  private terminateDataChannel(): Promise<void> {
    const deleteChannels = () => {
      for (const key of Object.keys(this.dataChannels)) {
        const dataChannel = this.dataChannels[key];
        if (dataChannel) {
          dataChannel.close();
        }
        delete this.dataChannels[key];
      }
    };

    if (this.signalingSwitched) {
      return new Promise((resolve, _) => {
        if (!this.dataChannels.signaling) {
          return resolve();
        }
        this.dataChannels.signaling.onclose = (event) => {
          const channel = event.currentTarget as RTCDataChannel;
          this.writeDataChannelSignalingLog("onclose", channel);
          this.trace("CLOSE DATA CHANNEL", channel.label);
          deleteChannels();
          return resolve();
        };
        const message = { type: "disconnect" };
        if (this.dataChannelsCompress.signaling === true) {
          const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
          const zlibMessage = zlibSync(binaryMessage, {});
          if (this.dataChannels.signaling.readyState === "open") {
            // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
            try {
              this.dataChannels.signaling.send(zlibMessage);
              this.writeDataChannelSignalingLog("send-disconnect", this.dataChannels.signaling, message);
            } catch (e) {
              const errorMessage = (e as Error).message;
              this.writeDataChannelSignalingLog("failed-to-send-disconnect", this.dataChannels.signaling, errorMessage);
            }
          }
        } else {
          if (this.dataChannels.signaling.readyState === "open") {
            // Firefox で readyState が open でも DataChannel send で例外がでる場合があるため処理する
            try {
              this.dataChannels.signaling.send(JSON.stringify(message));
              this.writeDataChannelSignalingLog("send-disconnect", this.dataChannels.signaling, message);
            } catch (e) {
              const errorMessage = (e as Error).message;
              this.writeDataChannelSignalingLog("failed-to-send-disconnect", this.dataChannels.signaling, errorMessage);
            }
          }
        }
        // DataChannel 切断を待つ
        setTimeout(() => {
          deleteChannels();
          return resolve();
        }, this.disconnectWaitTimeout);
      });
    }
    deleteChannels();
    return Promise.resolve();
  }

  private terminatePeerConnection(): Promise<void> {
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
      }, 10);
      this.pc.close();
    });
  }

  private async terminate(closeEvent: CloseEvent): Promise<void> {
    await this.stopStream();
    // callback を止める
    if (this.pc) {
      this.pc.ondatachannel = null;
    }
    if (this.ws) {
      // onclose はログを吐く専用に残す
      this.ws.onclose = (_) => {
        this.writeWebSocketTimelineLog("onclose");
      };
      this.ws.onmessage = null;
    }
    for (const key of Object.keys(this.dataChannels)) {
      const dataChannel = this.dataChannels[key];
      if (dataChannel) {
        dataChannel.onmessage = null;
        // onclose はログを吐く専用に残す
        dataChannel.onclose = (event) => {
          const channel = event.currentTarget as RTCDataChannel;
          this.writeDataChannelTimelineLog("onclose", channel);
          this.trace("CLOSE DATA CHANNEL", channel.label);
        };
      }
    }
    await this.terminateDataChannel();
    await this.terminateWebSocket();
    await this.terminatePeerConnection();
    if (this.e2ee) {
      this.e2ee.terminateWorker();
    }
    this.clientId = null;
    this.connectionId = null;
    this.remoteConnectionIds = [];
    this.stream = null;
    this.ws = null;
    this.pc = null;
    this.encodings = [];
    this.authMetadata = null;
    this.e2ee = null;
    this.dataChannels = {};
    this.mids = {
      audio: "",
      video: "",
    };
    this.signalingSwitched = false;
    this.callbacks.disconnect(closeEvent);
  }

  async disconnect(): Promise<void> {
    await this.stopStream();
    // callback を止める
    if (this.pc) {
      this.pc.ondatachannel = null;
    }
    if (this.ws) {
      // onclose はログを吐く専用に残す
      this.ws.onclose = (_) => {
        this.writeWebSocketTimelineLog("onclose");
      };
      this.ws.onmessage = null;
    }
    for (const key of Object.keys(this.dataChannels)) {
      const dataChannel = this.dataChannels[key];
      if (dataChannel) {
        dataChannel.onmessage = null;
        // onclose はログを吐く専用に残す
        dataChannel.onclose = (event) => {
          const channel = event.currentTarget as RTCDataChannel;
          this.writeDataChannelTimelineLog("onclose", channel);
          this.trace("CLOSE DATA CHANNEL", channel.label);
        };
      }
    }
    const dataChannelCloseEvent = new CloseEvent("close", { code: 4997 });
    await this.terminateDataChannel();
    const webSocketCloseEvent = await this.terminateWebSocket();
    await this.terminatePeerConnection();
    if (this.e2ee) {
      this.e2ee.terminateWorker();
      this.e2ee = null;
    }
    if (this.signalingSwitched) {
      this.callbacks.disconnect(dataChannelCloseEvent);
    } else if (webSocketCloseEvent !== null) {
      this.callbacks.disconnect(webSocketCloseEvent);
    }
    this.clientId = null;
    this.connectionId = null;
    this.remoteConnectionIds = [];
    this.stream = null;
    this.ws = null;
    this.pc = null;
    this.encodings = [];
    this.authMetadata = null;
    this.e2ee = null;
    this.dataChannels = {};
    this.mids = {
      audio: "",
      video: "",
    };
    this.signalingSwitched = false;
  }

  protected setupE2EE(): void {
    if (this.options.e2ee === true) {
      this.e2ee = new SoraE2EE();
      this.e2ee.onWorkerDisconnect = async (): Promise<void> => {
        const closeEvent = new CloseEvent("close", { code: 4998 });
        await this.terminate(closeEvent);
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
    this.trace("CREATE OFFER", offer);
    return new Promise((resolve, reject) => {
      if (this.ws === null) {
        this.ws = new WebSocket(this.signalingUrl);
        this.writeWebSocketSignalingLog("new-websocket", this.signalingUrl);
      }
      this.ws.binaryType = "arraybuffer";
      this.ws.onclose = (event): void => {
        const error = new ConnectError(
          `Signaling failed. CloseEventCode:${event.code} CloseEventReason:'${event.reason}'`
        );
        error.code = event.code;
        error.reason = event.reason;
        this.writeWebSocketTimelineLog("onclose", error);
        reject(error);
      };
      this.ws.onopen = async (_): Promise<void> => {
        this.writeWebSocketSignalingLog("onopen");
        let signalingMessage: SignalingConnectMessage;
        try {
          signalingMessage = createSignalingMessage(
            offer.sdp || "",
            this.role,
            this.channelId,
            this.metadata,
            this.options
          );
        } catch (error) {
          reject(error);
          return;
        }
        if (signalingMessage.e2ee && this.e2ee) {
          const initResult = await this.e2ee.init();
          // @ts-ignore signalingMessage の e2ee が true の場合は signalingNotifyMetadata が必ず object になる
          signalingMessage["signaling_notify_metadata"]["pre_key_bundle"] = initResult;
        }
        this.trace("SIGNALING CONNECT MESSAGE", signalingMessage);
        if (this.ws) {
          this.ws.send(JSON.stringify(signalingMessage));
          this.writeWebSocketSignalingLog(`send-${signalingMessage.type}`, signalingMessage);
        }
      };
      this.ws.onmessage = async (event): Promise<void> => {
        // E2EE 時専用処理
        if (event.data instanceof ArrayBuffer) {
          this.writeWebSocketSignalingLog("onmessage-e2ee", event.data);
          this.signalingOnMessageE2EE(event.data);
          return;
        }
        const message = JSON.parse(event.data) as SignalingMessage;
        if (message.type == "offer") {
          this.writeWebSocketSignalingLog("onmessage-offer", message);
          this.signalingOnMessageTypeOffer(message);
          resolve(message);
        } else if (message.type == "update") {
          this.writeWebSocketSignalingLog("onmessage-update", message);
          await this.signalingOnMessageTypeUpdate(message);
        } else if (message.type == "re-offer") {
          this.writeWebSocketSignalingLog("onmessage-re-offer", message);
          await this.signalingOnMessageTypeReOffer(message);
        } else if (message.type == "ping") {
          await this.signalingOnMessageTypePing(message);
        } else if (message.type == "push") {
          this.callbacks.push(message, "websocket");
        } else if (message.type == "notify") {
          if (message.event_type === "connection.created") {
            this.writeWebSocketTimelineLog("notify-connection.created", message);
          } else if (message.event_type === "connection.destroyed") {
            this.writeWebSocketTimelineLog("notify-connection.destroyed", message);
          }
          this.signalingOnMessageTypeNotify(message, "websocket");
        } else if (message.type == "switched") {
          this.writeWebSocketSignalingLog("onmessage-switched", message);
          await this.signalingOnMessageTypeSwitched(message);
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
      this.writePeerConnectionTimelineLog("create-offer", offer);
      return offer;
    }
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    pc.close();
    this.writePeerConnectionTimelineLog("create-offer", offer);
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
    this.writePeerConnectionTimelineLog("new-peerconnection", config);
    // @ts-ignore Chrome の場合は第2引数に goog オプションを渡すことができる
    this.pc = new window.RTCPeerConnection(config, this.constraints);
    this.pc.oniceconnectionstatechange = (_): void => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog("oniceconnectionstatechange", {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        });
        this.trace("ONICECONNECTIONSTATECHANGE ICECONNECTIONSTATE", this.pc.iceConnectionState);
      }
    };
    this.pc.onicegatheringstatechange = (_): void => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog("onicegatheringstatechange", {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        });
      }
    };
    this.pc.onconnectionstatechange = (_): void => {
      if (this.pc) {
        this.writePeerConnectionTimelineLog("onconnectionstatechange", {
          connectionState: this.pc.connectionState,
          iceConnectionState: this.pc.iceConnectionState,
          iceGatheringState: this.pc.iceGatheringState,
        });
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
    const sessionDescription = new RTCSessionDescription({ type: "offer", sdp: message.sdp });
    await this.pc.setRemoteDescription(sessionDescription);
    this.writePeerConnectionTimelineLog("set-remote-description", sessionDescription);
    return;
  }

  protected async createAnswer(
    message: SignalingOfferMessage | SignalingUpdateMessage | SignalingReOfferMessage
  ): Promise<void> {
    if (!this.pc) {
      return;
    }
    // mid と transceiver.direction を合わせる
    for (const mid of Object.values(this.mids)) {
      const transceiver = this.pc.getTransceivers().find((t) => t.mid === mid);
      if (transceiver && transceiver.direction === "recvonly") {
        transceiver.direction = "sendrecv";
      }
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
    this.writePeerConnectionTimelineLog("create-answer", sessionDescription);
    await this.pc.setLocalDescription(sessionDescription);
    this.writePeerConnectionTimelineLog("set-local-description", sessionDescription);
    return;
  }

  protected sendAnswer(): void {
    if (this.pc && this.ws && this.pc.localDescription) {
      this.trace("ANSWER SDP", this.pc.localDescription.sdp);
      const message = { type: "answer", sdp: this.pc.localDescription.sdp };
      this.ws.send(JSON.stringify(message));
      this.writeWebSocketSignalingLog("send-answer", message);
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
          this.writePeerConnectionTimelineLog("ice-connection-timeout");
          reject(error);
        } else if (this.pc && this.pc.iceConnectionState === "connected") {
          clearInterval(timerId);
          resolve();
        }
      }, 10);
      if (this.pc) {
        this.pc.onicecandidate = (event): void => {
          this.writePeerConnectionTimelineLog("onicecandidate", event.candidate);
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
        return;
      }
      const timerId = setInterval(() => {
        if (!this.pc) {
          const error = new Error();
          error.message = "PeerConnection connectionState did not change to 'connected'";
          clearInterval(timerId);
          reject(error);
        } else if (this.pc && this.pc.connectionState === "connected") {
          clearInterval(timerId);
          resolve();
        }
      }, 10);
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
            this.trace("DISCONNECT", "Signaling connection timeout");
            this.writePeerConnectionTimelineLog("signaling-connection-timeout", {
              connectionTimeout: this.connectionTimeout,
            });
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

  protected writeWebSocketSignalingLog(eventType: string, data?: unknown): void {
    this.callbacks.signaling(createSignalingEvent(eventType, data, "websocket"));
    this.writeWebSocketTimelineLog(eventType, data);
  }

  protected writeDataChannelSignalingLog(eventType: string, channel: RTCDataChannel, data?: unknown): void {
    this.callbacks.signaling(createSignalingEvent(eventType, data, "datachannel"));
    this.writeDataChannelTimelineLog(eventType, channel, data);
  }

  protected writeWebSocketTimelineLog(eventType: string, data?: unknown): void {
    const event = createTimelineEvent(eventType, data, "websocket");
    this.callbacks.timeline(event);
  }

  protected writeDataChannelTimelineLog(eventType: string, channel: RTCDataChannel, data?: unknown): void {
    const event = createTimelineEvent(eventType, data, "datachannel", channel.id, channel.label);
    this.callbacks.timeline(event);
  }

  protected writePeerConnectionTimelineLog(eventType: string, data?: unknown): void {
    const event = createTimelineEvent(eventType, data, "peerconnection");
    this.callbacks.timeline(event);
  }

  private signalingOnMessageE2EE(data: ArrayBuffer): void {
    if (this.e2ee) {
      const message = new Uint8Array(data);
      const result = this.e2ee.receiveMessage(message);
      this.e2ee.postRemoteSecretKeyMaterials(result);
      result.messages.forEach((message) => {
        this.sendE2EEMessage(message.buffer);
      });
    }
  }

  private signalingOnMessageTypeOffer(message: SignalingOfferMessage): void {
    this.clientId = message.client_id;
    this.connectionId = message.connection_id;
    if (this.ws) {
      this.ws.onclose = async (event): Promise<void> => {
        this.trace("DISCONNECT", "Trigger event WebSocket onclose");
        this.writeWebSocketTimelineLog("onclose", { code: event.code, reason: event.reason });
        await this.terminate(event);
      };
      this.ws.onerror = (event) => {
        this.writeWebSocketSignalingLog("onerror", event);
      };
    }
    if (message.metadata !== undefined) {
      this.authMetadata = message.metadata;
    }
    if (Array.isArray(message.encodings)) {
      this.encodings = message.encodings;
    }
    if (message.mid !== undefined && message.mid.audio !== undefined) {
      this.mids.audio = message.mid.audio;
    }
    if (message.mid !== undefined && message.mid.video !== undefined) {
      this.mids.video = message.mid.video;
    }
    if (message.data_channels) {
      for (const o of message.data_channels) {
        this.dataChannelsCompress[o.label] = o.compress;
      }
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
    const pongMessage: { type: "pong"; stats?: RTCStatsReport[] } = { type: "pong" };
    if (message.stats) {
      const stats = await this.getStats();
      pongMessage.stats = stats;
    }
    if (this.ws) {
      this.ws.send(JSON.stringify(pongMessage));
    }
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

  private async signalingOnMessageTypeSwitched(message: SignalingSwitchedMessage): Promise<void> {
    this.signalingSwitched = true;
    if (!this.ws) {
      return;
    }
    if (message["ignore_disconnect_websocket"]) {
      if (this.ws) {
        this.ws.onclose = null;
        await this.terminateWebSocket();
      }
      this.writeWebSocketSignalingLog("close");
    }
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
    this.writePeerConnectionTimelineLog("transceiver-sender-set-parameters", originalParameters);
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
    const dataChannel = dataChannelEvent.channel;
    this.writeDataChannelTimelineLog("ondatachannel", dataChannel, createDataChannelData(dataChannel));
    // onbufferedamountlow
    dataChannelEvent.channel.onbufferedamountlow = (event): void => {
      const channel = event.currentTarget as RTCDataChannel;
      this.writeDataChannelTimelineLog("onbufferedamountlow", channel);
    };
    // onopen
    dataChannelEvent.channel.onopen = (event): void => {
      const channel = event.currentTarget as RTCDataChannel;
      channel.bufferedAmountLowThreshold = 65536;
      channel.binaryType = "arraybuffer";
      this.dataChannels[channel.label] = channel;
      this.trace("OPEN DATA CHANNEL", channel.label);
      if (channel.label === "signaling" && this.ws) {
        this.writeDataChannelSignalingLog("onopen", channel);
      } else {
        this.writeDataChannelTimelineLog("onopen", channel);
      }
    };
    // onclose
    dataChannelEvent.channel.onclose = async (event): Promise<void> => {
      const channel = event.currentTarget as RTCDataChannel;
      this.writeDataChannelTimelineLog("onclose", channel);
      this.trace("CLOSE DATA CHANNEL", channel.label);
      const closeEvent = new CloseEvent("close", { code: 4999 });
      await this.terminate(closeEvent);
    };
    // onerror
    dataChannelEvent.channel.onerror = (event): void => {
      const channel = event.currentTarget as RTCDataChannel;
      this.writeDataChannelTimelineLog("onerror", channel);
      this.trace("ERROR DATA CHANNEL", channel.label);
    };
    // onmessage
    if (dataChannelEvent.channel.label === "signaling") {
      dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
        const channel = event.currentTarget as RTCDataChannel;
        let data = event.data as string;
        if (this.dataChannelsCompress.signaling === true) {
          const unzlibMessage = unzlibSync(new Uint8Array(event.data));
          data = new TextDecoder().decode(unzlibMessage);
        }
        const message = JSON.parse(data) as SignalingMessage;
        this.writeDataChannelSignalingLog(`onmessage-${message.type}`, channel, message);
        if (message.type === "re-offer") {
          await this.signalingOnMessageTypeReOffer(message);
        }
      };
    } else if (dataChannelEvent.channel.label === "notify") {
      dataChannelEvent.channel.onmessage = (event): void => {
        const channel = event.currentTarget as RTCDataChannel;
        let data = event.data as string;
        if (this.dataChannelsCompress.notify === true) {
          const unzlibMessage = unzlibSync(new Uint8Array(event.data));
          data = new TextDecoder().decode(unzlibMessage);
        }
        const message = JSON.parse(data) as SignalingNotifyMessage;
        if (message.event_type === "connection.created") {
          this.writeDataChannelTimelineLog("notify-connection.created", channel, message);
        } else if (message.event_type === "connection.destroyed") {
          this.writeDataChannelTimelineLog("notify-connection.destroyed", channel, message);
        }
        this.signalingOnMessageTypeNotify(message, "datachannel");
      };
    } else if (dataChannelEvent.channel.label === "push") {
      dataChannelEvent.channel.onmessage = (event): void => {
        let data = event.data as string;
        if (this.dataChannelsCompress.push === true) {
          const unzlibMessage = unzlibSync(new Uint8Array(event.data));
          data = new TextDecoder().decode(unzlibMessage);
        }
        const message = JSON.parse(data) as SignalingPushMessage;
        this.callbacks.push(message, "datachannel");
      };
    } else if (dataChannelEvent.channel.label === "e2ee") {
      dataChannelEvent.channel.onmessage = (event): void => {
        const channel = event.currentTarget as RTCDataChannel;
        const data = event.data as ArrayBuffer;
        this.signalingOnMessageE2EE(data);
        this.writeDataChannelSignalingLog("onmessage-e2ee", channel, data);
      };
    } else if (dataChannelEvent.channel.label === "stats") {
      dataChannelEvent.channel.onmessage = async (event): Promise<void> => {
        let data = event.data as string;
        if (this.dataChannelsCompress.stats === true) {
          const unzlibMessage = unzlibSync(new Uint8Array(event.data));
          data = new TextDecoder().decode(unzlibMessage);
        }
        const message = JSON.parse(data) as SignalingReqStatsMessage;
        if (message.type === "req-stats") {
          const stats = await this.getStats();
          this.sendStatsMessage(stats);
        }
      };
    }
  }

  private sendMessage(message: { type: string; [key: string]: unknown }): void {
    if (this.dataChannels.signaling) {
      if (this.dataChannelsCompress.signaling === true) {
        const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
        const zlibMessage = zlibSync(binaryMessage, {});
        this.dataChannels.signaling.send(zlibMessage);
      } else {
        this.dataChannels.signaling.send(JSON.stringify(message));
      }
      this.callbacks.signaling(createSignalingEvent(`send-${message.type}`, message, "datachannel"));
    } else if (this.ws !== null) {
      this.ws.send(JSON.stringify(message));
      this.callbacks.signaling(createSignalingEvent(`send-${message.type}`, message, "websocket"));
    }
  }

  private sendE2EEMessage(message: ArrayBuffer): void {
    if (this.dataChannels.e2ee) {
      this.dataChannels.e2ee.send(message);
      this.writeDataChannelSignalingLog("send-e2ee", this.dataChannels.e2ee, message);
    } else if (this.ws !== null) {
      this.ws.send(message);
      this.writeWebSocketSignalingLog("send-e2ee", message);
    }
  }

  private sendStatsMessage(reports: RTCStatsReport[]): void {
    if (this.dataChannels.stats) {
      const message = {
        type: "stats",
        reports: reports,
      };
      if (this.dataChannelsCompress.stats === true) {
        const binaryMessage = new TextEncoder().encode(JSON.stringify(message));
        const zlibMessage = zlibSync(binaryMessage, {});
        this.dataChannels.stats.send(zlibMessage);
      } else {
        this.dataChannels.stats.send(JSON.stringify(message));
      }
    }
  }

  private getAudioTransceiver(): RTCRtpTransceiver | null {
    if (this.pc && this.mids.audio) {
      const transceiver = this.pc.getTransceivers().find((transceiver) => {
        return transceiver.mid === this.mids.audio;
      });
      return transceiver || null;
    }
    return null;
  }

  private getVideoTransceiver(): RTCRtpTransceiver | null {
    if (this.pc && this.mids.video) {
      const transceiver = this.pc.getTransceivers().find((transceiver) => {
        return transceiver.mid === this.mids.video;
      });
      return transceiver || null;
    }
    return null;
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

  get audio(): boolean {
    return this.getAudioTransceiver() !== null;
  }

  get video(): boolean {
    return this.getVideoTransceiver() !== null;
  }
}
