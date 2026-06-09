import { setSoraJsSdkVersion } from "../src/misc";

import Sora from "sora-js-sdk";
import type {
  ConnectionOptions,
  ConnectionPublisher,
  SignalingEvent,
  SignalingNotifyConnectionCreated,
  SignalingNotifyMessage,
  SignalingSwitchedMessage,
  SoraCloseEvent,
  SoraConnection,
  TimelineEvent,
} from "sora-js-sdk";

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;
  const apiUrl = import.meta.env.VITE_TEST_API_URL;

  setSoraJsSdkVersion();

  // disconnectWaitTimeout を URL クエリから受け取る (E2E は正常値しか渡さない前提)
  // "0" を falsy で握り潰さないため !== null で判定する
  const disconnectWaitTimeoutParam = new URLSearchParams(location.search).get(
    "disconnectWaitTimeout",
  );
  const disconnectWaitTimeout =
    disconnectWaitTimeoutParam === null
      ? undefined
      : Number.parseInt(disconnectWaitTimeoutParam, 10);

  let client: SoraClient;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    // channelName
    const channelName = document.querySelector<HTMLInputElement>("#channel-name")?.value;
    if (!channelName) {
      throw new Error("channelName is required");
    }

    client = new SoraClient(
      signalingUrl,
      channelIdPrefix,
      channelIdSuffix,
      secretKey,
      channelName,
      apiUrl,
      disconnectWaitTimeout,
    );
    await client.connect(stream);
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await client.disconnect();
  });

  document.querySelector("#disconnect-api")?.addEventListener("click", async () => {
    await client.apiDisconnect();
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    const statsReport = await client.getStats();
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

class SoraClient {
  private readonly debug = false;
  private readonly channelId: string;
  private readonly metadata: { access_token: string };
  private readonly options: ConnectionOptions;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;

  private readonly apiUrl: string;

  constructor(
    signalingUrl: string,
    channelIdPrefix: string,
    channelIdSuffix: string,
    secretKey: string,
    channelName: string,
    apiUrl: string,
    disconnectWaitTimeout?: number,
  ) {
    this.apiUrl = apiUrl;

    // disconnectWaitTimeout が指定された場合のみ options に追加する (未指定なら SDK のデフォルト 3000ms に委ねる)
    this.options = {
      connectionTimeout: 15_000,
      dataChannelSignaling: true,
      ignoreDisconnectWebSocket: true,
    };
    if (disconnectWaitTimeout !== undefined) {
      this.options.disconnectWaitTimeout = disconnectWaitTimeout;
    }

    this.sora = Sora.connection(signalingUrl, this.debug);

    // channel_id の生成
    this.channelId = `${channelIdPrefix}${channelName}${channelIdSuffix}`;
    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey };

    this.connection = this.sora.sendonly(this.channelId, this.metadata, this.options);
    this.connection.on("notify", this.onNotify.bind(this));
    this.connection.on("connected", this.onConnected.bind(this));
    this.connection.on("switched", this.onSwitched.bind(this));
    this.connection.on("disconnect", this.onDisconnect.bind(this));
    this.connection.on("timeline", this.onTimeline.bind(this));

    // E2E テスト用のコード
    this.connection.on("signaling", this.onSignaling.bind(this));
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream);

    const videoElement = document.querySelector<HTMLVideoElement>("#local-video");
    if (videoElement !== null) {
      videoElement.srcObject = stream;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();

    const videoElement = document.querySelector<HTMLVideoElement>("#local-video");
    if (videoElement !== null) {
      videoElement.srcObject = null;
    }
  }

  async getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
  }

  private onNotify(event: SignalingNotifyMessage): void {
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

  // connected コールバック
  private onConnected(event: SignalingNotifyConnectionCreated): void {
    console.log("[connected]", event);
    const connectedStatusElement = document.querySelector("#connected-status");
    if (connectedStatusElement) {
      connectedStatusElement.textContent = "connected";
    }
  }

  // switched コールバック
  private onSwitched(event: SignalingSwitchedMessage): void {
    console.log("[switched]", event);
    const switchedStatusElement = document.querySelector("#switched-status");
    if (switchedStatusElement) {
      switchedStatusElement.textContent = "switched";
    }
    // E2E テスト用に switched 完了後の SoraConnection を window へ露出する
    // private な soraDataChannels 等の内部参照にもアクセス可能 (テスト側で型キャストして利用)
    (window as unknown as { soraConnection: ConnectionPublisher | null }).soraConnection =
      this.connection;
  }

  // disconnect コールバック (E2E テスト用)
  // disconnect が発火するたびに count を増分し、event 種別 / reason を DOM に反映する
  // 4 系統 (disconnect / abend / abendPeerConnectionState / shutdown) の多重発火検出に使う
  private onDisconnect(event: SoraCloseEvent): void {
    const countElement = document.querySelector("#disconnect-count");
    if (countElement) {
      const current = Number.parseInt(countElement.textContent ?? "0", 10);
      countElement.textContent = String(current + 1);
    }
    const typeElement = document.querySelector("#disconnect-event-type");
    if (typeElement) {
      typeElement.textContent = event.type;
    }
    const reasonElement = document.querySelector("#disconnect-event-reason");
    if (reasonElement) {
      reasonElement.textContent = event.reason ?? "";
    }
    // 最後の disconnect event を window 経由でテスト側に渡す (timeline event との構造一致 assert 用)
    (window as unknown as { e2eLastDisconnectEvent: SoraCloseEvent }).e2eLastDisconnectEvent =
      event;
    // 切断完了したので連結された SoraConnection への参照は捨てる
    (window as unknown as { soraConnection: ConnectionPublisher | null }).soraConnection = null;
  }

  // timeline コールバック (E2E テスト用)
  // disconnect-abend / disconnect-normal だけを抽出し、window へ最後の timeline event を渡す
  private onTimeline(event: TimelineEvent): void {
    if (event.type === "disconnect-abend" || event.type === "disconnect-normal") {
      (window as unknown as { e2eLastTimelineEvent: unknown }).e2eLastTimelineEvent = event.data;
    }
  }

  // E2E テスト用のコード
  private onSignaling(event: SignalingEvent): void {
    if (event.type === "onmessage-switched") {
      console.log("[signaling]", event.type, event.transportType);
      const signalingTypeSwitchedElement = document.querySelector("#signaling-type-switched");
      if (signalingTypeSwitchedElement) {
        signalingTypeSwitchedElement.textContent = event.transportType;
      }
    }
    if (event.type === "onmessage-close") {
      console.log("[signaling]", event.type, event.transportType);
      const signalingCloseTypeElement = document.querySelector("#signaling-close-type");
      if (signalingCloseTypeElement) {
        signalingCloseTypeElement.textContent = event.transportType;
      }
    }
  }

  // E2E テスト側で実行した方が良い気がする
  async apiDisconnect(): Promise<void> {
    const statusElement = document.querySelector("#api-disconnect-status");

    if (!this.apiUrl) {
      console.log(
        "[data_channel_signaling_only] apiDisconnect error: VITE_TEST_API_URL is not set",
      );
      if (statusElement) {
        statusElement.textContent = "error";
      }
      throw new Error("VITE_TEST_API_URL is not set");
    }

    console.log("[data_channel_signaling_only] apiDisconnect start", {
      apiUrl: this.apiUrl,
      channelId: this.channelId,
      connectionId: this.connection.connectionId,
    });

    // fetch にタイムアウトを設定する
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log("[data_channel_signaling_only] apiDisconnect timeout after 10000ms");
      controller.abort();
    }, 10_000);

    try {
      const response = await fetch(this.apiUrl, {
        body: JSON.stringify({
          channel_id: this.channelId,
          connection_id: this.connection.connectionId,
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Sora-Target": "Sora_20151104.DisconnectConnection",
        },
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log("[data_channel_signaling_only] apiDisconnect response", {
        ok: response.ok,
        status: response.status,
      });
      if (!response.ok) {
        if (statusElement) {
          statusElement.textContent = "error";
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (statusElement) {
        statusElement.textContent = "success";
      }
      console.log("[data_channel_signaling_only] apiDisconnect success");
    } catch (error) {
      clearTimeout(timeoutId);
      console.log("[data_channel_signaling_only] apiDisconnect error", error);
      if (statusElement) {
        statusElement.textContent = "error";
      }
      throw error;
    }
  }
}
