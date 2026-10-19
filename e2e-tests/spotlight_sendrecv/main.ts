import { generateAccessToken, getChannelId, setSoraJsSdkVersion } from "../src/misc";

import Sora from "sora-js-sdk";
import type { SoraConnection, ConnectionPublisher, SignalingNotifyMessage } from "sora-js-sdk";

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;

  setSoraJsSdkVersion();

  let sendrecv: SoraClient;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix);

    sendrecv = new SoraClient(signalingUrl, channelId, secretKey);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });
      await sendrecv.connect(stream);
    } catch (error) {
      console.error("[spotlight_sendrecv] connect error:", error);
    }
  });
  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await sendrecv.disconnect();
  });
});

class SoraClient {
  private readonly debug = false;

  private readonly channelId: string;
  private readonly secretKey: string;
  private readonly options: object;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.channelId = channelId;
    this.secretKey = secretKey;

    this.sora = Sora.connection(signalingUrl, this.debug);

    this.options = {
      audio: true,
      connectionTimeout: 15_000,
      simulcast: true,
      spotlight: true,
      spotlightNumber: 1,
      video: true,
    };

    // access_token は接続の直前に生成するため、ここでは metadata を指定しない
    this.connection = this.sora.sendrecv(this.channelId, undefined, this.options);

    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
  }

  async connect(stream: MediaStream) {
    // access_token の有効期限が切れないよう、接続の直前に JWT を生成する
    this.connection.metadata = {
      access_token: await generateAccessToken(this.channelId, this.secretKey),
    };
    await this.connection.connect(stream);
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = stream;
    }
  }

  async disconnect() {
    await this.connection.disconnect();

    // お掃除
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = null;
    }
    // お掃除
    const remoteVideos = document.querySelector<HTMLDivElement>("#remote-videos");
    if (remoteVideos) {
      remoteVideos.innerHTML = "";
    }
  }

  private onnotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === "connection.created" &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector("#connection-id");
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id;
      }
    }
  }

  private ontrack(event: RTCTrackEvent): void {
    const stream = event.streams[0];
    const remoteVideoId = `remote-video-${stream.id}`;
    const remoteVideos = document.querySelector<HTMLDivElement>("#remote-videos");
    if (remoteVideos && !remoteVideos.querySelector(`#${remoteVideoId}`)) {
      const remoteVideo = document.createElement("video");
      remoteVideo.id = remoteVideoId;
      remoteVideo.style.border = "1px solid red";
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.controls = true;
      remoteVideo.width = 160;
      remoteVideo.height = 120;
      remoteVideo.srcObject = stream;
      remoteVideos.append(remoteVideo);
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent): void {
    const target = event.target as MediaStream;
    const remoteVideo = document.querySelector(`#remote-video-${target.id}`);
    if (remoteVideo) {
      remoteVideo.remove();
    }
  }
}
