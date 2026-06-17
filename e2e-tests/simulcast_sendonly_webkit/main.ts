import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  ConnectionPublisher,
  SignalingNotifyMessage,
  VideoCodecType,
} from "sora-js-sdk";
import { getFakeMedia } from "../src/fake";
import { generateJwt, getChannelId, setSoraJsSdkVersion } from "../src/misc";

document.addEventListener("DOMContentLoaded", () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;

  setSoraJsSdkVersion();

  let sendonly: SimulcastSendonlySoraClient;
  // getFakeMedia の cleanup を保持し、#disconnect / 次回 #connect / connect 失敗時に解放する。
  let fakeCleanup: (() => void) | null = null;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix);

    const videoCodecTypeElement = document.querySelector<HTMLSelectElement>("#video-codec-type")!;
    const videoCodecType = videoCodecTypeElement.value as VideoCodecType;
    const rawVideoBitRate = document.querySelector<HTMLInputElement>("#video-bit-rate")!;
    const videoBitRate = Number.parseInt(rawVideoBitRate.value, 10);

    let simulcastEncodings: Record<string, unknown> | undefined;
    const simulcastEncodingsElement =
      document.querySelector<HTMLInputElement>("#simulcast-encodings")!;
    if (simulcastEncodingsElement.value !== "") {
      console.log(`simulcastEncodingsElement.value=${simulcastEncodingsElement.value}`);
      try {
        simulcastEncodings = JSON.parse(simulcastEncodingsElement.value);
      } catch {
        throw new Error("Failed to parse simulcastEncodings");
      }
    }

    // 既存の cleanup が残っていれば解放してから新しい stream を生成する。
    if (fakeCleanup) {
      fakeCleanup();
      fakeCleanup = null;
    }

    sendonly = new SimulcastSendonlySoraClient(
      signalingUrl,
      channelId,
      videoCodecType,
      videoBitRate,
      simulcastEncodings,
      secretKey,
    );

    const { stream, cleanup } = getFakeMedia({
      audio: false,
      video: { height: 540, width: 960 },
    });
    fakeCleanup = cleanup;

    try {
      await sendonly.connect(stream);
    } catch (error) {
      // connect 失敗時にも fake stream を解放してリソースリークを防ぐ。
      if (fakeCleanup) {
        fakeCleanup();
        fakeCleanup = null;
      }
      throw error;
    }
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    // sendonly.disconnect が throw しても fake stream は必ず解放する。
    try {
      await sendonly.disconnect();
    } finally {
      if (fakeCleanup) {
        fakeCleanup();
        fakeCleanup = null;
      }
    }
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    const statsReport = await sendonly.getStats();
    const statsDiv = document.querySelector<HTMLElement>("#stats-report")!;
    const statsReportJsonDiv = document.querySelector("#stats-report-json");
    if (statsDiv && statsReportJsonDiv) {
      let statsHtml = "";
      const statsReportJson: Array<Record<string, unknown>> = [];
      for (const report of statsReport.values()) {
        statsHtml += `<h3>Type: ${report.type}</h3><ul>`;
        const reportJson: Record<string, unknown> = {
          id: report.id,
          type: report.type,
        };
        for (const [key, value] of Object.entries(report)) {
          if (key !== "type" && key !== "id") {
            statsHtml += `<li><strong>${key}:</strong> ${String(value)}</li>`;
            reportJson[key] = value;
          }
        }
        statsHtml += "</ul>";
        statsReportJson.push(reportJson);
      }
      statsDiv.innerHTML = statsHtml;
      // データ属性としても保存（オプション）
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson);
    }
  });
});

class SimulcastSendonlySoraClient {
  private readonly debug = false;

  private readonly channelId: string;
  private readonly videoCodecType: VideoCodecType;
  private readonly videoBitRate: number;
  private readonly simulcastEncodings: Record<string, unknown> | undefined;

  private readonly secretKey: string;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;

  constructor(
    signalingUrl: string,
    channelId: string,
    videoCodecType: VideoCodecType,
    videoBitRate: number,
    simulcastEncodings: Record<string, unknown> | undefined,
    secretKey: string,
  ) {
    this.channelId = channelId;
    this.videoCodecType = videoCodecType;
    this.videoBitRate = videoBitRate;
    this.simulcastEncodings = simulcastEncodings;

    this.secretKey = secretKey;

    this.sora = Sora.connection(signalingUrl, this.debug);
    this.connection = this.sora.sendonly(this.channelId, undefined, {
      audio: false,
      connectionTimeout: 15_000,
      simulcast: true,
      video: true,
      videoBitRate: this.videoBitRate,
      videoCodecType: this.videoCodecType,
    });

    this.connection.on("notify", this.onnotify.bind(this));
  }

  async connect(stream: MediaStream) {
    const privateClaims: Record<string, unknown> = {};
    if (this.simulcastEncodings !== undefined) {
      privateClaims.simulcast_encodings = this.simulcastEncodings;
    }

    const jwt = await generateJwt(this.channelId, this.secretKey, privateClaims);
    this.connection.metadata = { access_token: jwt };

    await this.connection.connect(stream);
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = stream;
    }
  }

  async disconnect() {
    await this.connection.disconnect();
    const localVideo = document.querySelector<HTMLVideoElement>("#local-video");
    if (localVideo) {
      localVideo.srcObject = null;
    }
  }

  async getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === "connection.created" &&
      event.connection_id === this.connection.connectionId
    ) {
      const localVideoConnectionId = document.querySelector("#connection-id");
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = event.connection_id;
      }
    }
  }
}
