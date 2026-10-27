import {
  generateAccessToken,
  getChannelId,
  getVideoCodecType,
  setSoraJsSdkVersion,
} from "../src/misc";

import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  ConnectionPublisher,
  SignalingNotifyMessage,
  ConnectionSubscriber,
  SimulcastRid,
  VideoCodecType,
  ConnectionOptions,
} from "sora-js-sdk";

document.addEventListener("DOMContentLoaded", () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;

  setSoraJsSdkVersion();

  let sendonly: SimulcastSendonlySoraClient;
  let recvonlyR0: SimulcastRecvonlySoraClient;
  let recvonlyR1: SimulcastRecvonlySoraClient;
  let recvonlyR2: SimulcastRecvonlySoraClient;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    // video_codec_type と video_bit_rate はページ表示時ではなく connect 時に読み取る。
    // ページ表示後に選択を変えても、次の connect から反映されるようにするため。
    const videoCodecType = getVideoCodecType();

    const videoBitRateElement = document.querySelector<HTMLInputElement>("#video-bit-rate");
    if (!videoBitRateElement) {
      throw new Error("#video-bit-rate element not found");
    }
    const videoBitRate = Number.parseInt(videoBitRateElement.value, 10);
    // 空文字・0 以下・非数値は Sora に送らず、接続前にエラーにする。
    if (!Number.isFinite(videoBitRate) || videoBitRate <= 0) {
      throw new Error(
        `videoBitRate must be a positive number: ${JSON.stringify(videoBitRateElement.value)}`,
      );
    }

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix);

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { height: { exact: 540 }, width: { exact: 960 } },
    });

    // 再接続時は、新しい接続を確立する前に旧接続を切断する。
    // 旧接続を残したまま新しいクライアントで変数を上書きすると、
    // 新しい接続が失敗したときに旧接続への参照を失って #disconnect で解放できなくなる。
    // getUserMedia に失敗したときは旧接続を維持するため、切断は取得の成功後に行う。
    if (sendonly) {
      await sendonly.disconnect();
    }
    if (recvonlyR0) {
      await recvonlyR0.disconnect();
    }
    if (recvonlyR1) {
      await recvonlyR1.disconnect();
    }
    if (recvonlyR2) {
      await recvonlyR2.disconnect();
    }

    // sendonly
    sendonly = new SimulcastSendonlySoraClient(
      signalingUrl,
      channelId,
      videoCodecType,
      videoBitRate,
      secretKey,
    );

    recvonlyR0 = new SimulcastRecvonlySoraClient(signalingUrl, channelId, "r0", secretKey);

    recvonlyR1 = new SimulcastRecvonlySoraClient(signalingUrl, channelId, "r1", secretKey);

    recvonlyR2 = new SimulcastRecvonlySoraClient(signalingUrl, channelId, "r2", secretKey);

    await sendonly.connect(stream);

    // recvonly r0
    await recvonlyR0.connect();
    // recvonly r1
    await recvonlyR1.connect();
    // recvonly r2
    await recvonlyR2.connect();
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    // クライアントは connect の入力検証と getUserMedia が成功した後に 4 つまとめて代入する。
    // 初回 connect 前と、代入前に失敗した場合は未設定なので何もしない。
    if (!sendonly) {
      return;
    }
    await sendonly.disconnect();

    // recvonly r0
    await recvonlyR0.disconnect();
    // recvonly r1
    await recvonlyR1.disconnect();
    // recvonly r2
    await recvonlyR2.disconnect();
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    // クライアントは connect の入力検証と getUserMedia が成功した後に 4 つまとめて代入する。
    // 初回 connect 前と、代入前に失敗した場合は未設定なので何もしない。
    if (!sendonly) {
      return;
    }
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
  private readonly secretKey: string;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;

  constructor(
    signalingUrl: string,
    channelId: string,
    videoCodecType: VideoCodecType | undefined,
    videoBitRate: number,
    secretKey: string,
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug);
    this.channelId = channelId;
    this.secretKey = secretKey;

    // access_token は接続の直前に生成するため、ここでは metadata を指定しない
    const options: ConnectionOptions = {
      audio: false,
      connectionTimeout: 15_000,
      simulcast: true,
      video: true,
      videoBitRate,
    };
    // 未指定のときは videoCodecType を送らず、Sora の既定のコーデック選択に任せる。
    if (videoCodecType !== undefined) {
      options.videoCodecType = videoCodecType;
    }
    this.connection = this.sora.sendonly(this.channelId, undefined, options);

    this.connection.on("notify", this.onnotify.bind(this));
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
      const localVideoConnectionId = document.querySelector("#local-video-connection-id");
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = event.connection_id;
      }
    }
  }
}

class SimulcastRecvonlySoraClient {
  private readonly debug = false;

  private readonly channelId: string;
  private readonly secretKey: string;
  private readonly rid: SimulcastRid;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionSubscriber;

  constructor(signalingUrl: string, channelId: string, rid: SimulcastRid, secretKey: string) {
    this.channelId = channelId;
    this.secretKey = secretKey;
    this.rid = rid;

    this.sora = Sora.connection(signalingUrl, this.debug);

    // access_token は接続の直前に生成するため、ここでは metadata を指定しない
    this.connection = this.sora.recvonly(this.channelId, undefined, {
      connectionTimeout: 15_000,
      simulcast: true,
      simulcastRid: this.rid,
    });

    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
  }

  async connect() {
    // access_token の有効期限が切れないよう、接続の直前に JWT を生成する
    this.connection.metadata = {
      access_token: await generateAccessToken(this.channelId, this.secretKey),
    };
    await this.connection.connect();
  }

  async disconnect() {
    await this.connection.disconnect();
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`);
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
  }

  private onnotify(event: SignalingNotifyMessage) {
    if (
      event.event_type === "connection.created" &&
      event.connection_id === this.connection.connectionId
    ) {
      const localVideoConnectionId = document.querySelector(
        `#remote-video-connection-id-${this.rid}`,
      );
      if (localVideoConnectionId) {
        localVideoConnectionId.textContent = event.connection_id;
      }
    }
  }

  private ontrack(event: RTCTrackEvent) {
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`);
    if (remoteVideo) {
      remoteVideo.srcObject = event.streams[0];
    }
  }

  private onremovetrack(_event: MediaStreamTrackEvent) {
    const remoteVideo = document.querySelector<HTMLVideoElement>(`#remote-video-${this.rid}`);
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
  }
}
