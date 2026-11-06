import { generateAccessToken, getChannelId, setSoraJsSdkVersion } from "../src/misc";

import Sora from "sora-js-sdk";
import type {
  SoraConnection,
  ConnectionMessaging,
  SignalingNotifyMessage,
  DataChannelMessageEvent,
  DataChannelEvent,
  MessagingHeaderField,
} from "sora-js-sdk";

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;

  setSoraJsSdkVersion();

  let client: SoraClient;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix);

    client = new SoraClient(signalingUrl, channelId, secretKey);
    const checkCompress = document.querySelector<HTMLInputElement>("#check-compress")!;
    const compress = checkCompress.checked;
    const checkHeader = document.querySelector<HTMLInputElement>("#check-header")!;
    const header = checkHeader.checked;
    const declareReceiverConnectionIdList =
      document.querySelector<HTMLInputElement>("#check-receiver-connection-id-list")?.checked ??
      false;

    await client.connect(compress, header, declareReceiverConnectionIdList);
  });
  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await client.disconnect();
  });
  document.querySelector("#send-message")?.addEventListener("click", async () => {
    const value = document.querySelector<HTMLInputElement>("input[name=message]")?.value;
    if (value !== undefined && value !== "") {
      await client.sendMessage(value);
    }
  });
  document.querySelector("#send-message-to-receivers")?.addEventListener("click", async () => {
    const value = document.querySelector<HTMLInputElement>("input[name=message]")?.value;
    // 宛先の connection_id はカンマ区切りで入力する
    const receiverConnectionIds = (
      document.querySelector<HTMLInputElement>("#receiver-connection-ids")?.value ?? ""
    )
      .split(",")
      .map((receiverConnectionId) => receiverConnectionId.trim())
      .filter((receiverConnectionId) => receiverConnectionId !== "");
    if (value !== undefined && value !== "") {
      await client.sendMessageToReceivers(value, receiverConnectionIds);
    }
  });

  // #get-stats を押すごとに振る番号
  // getStats は非同期なので、押した直後に統計を読むと前に押したときの統計を読んでしまう。
  // そこで押した回の統計を書き込んだら、その番号を #stats-report の data-stats-response-id に残す。
  // E2E テストは押した回の番号が残るまで待ってから統計を読む
  let statsRequestId = 0;
  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    statsRequestId += 1;
    const requestId = statsRequestId;
    const statsReport = await client.getStats();
    // 後から押された回があれば、古い統計で上書きしない
    if (requestId !== statsRequestId) {
      return;
    }
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
      // E2E テストが読むため、データ属性にも保存する
      statsDiv.dataset.statsReportJson = JSON.stringify(statsReportJson);
      statsDiv.dataset.statsResponseId = String(requestId);
    }
  });
});

class SoraClient {
  private readonly debug = false;

  private readonly channelId: string;
  private readonly secretKey: string;
  private readonly options: object;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionMessaging;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.sora = Sora.connection(signalingUrl, this.debug);
    this.channelId = channelId;
    this.secretKey = secretKey;

    this.options = {
      connectionTimeout: 15_000,
      dataChannelSignaling: true,
      dataChannels: [
        {
          compress: true,
          direction: "sendrecv",
          label: "#example",
        },
      ],
    };

    // access_token は接続の直前に生成するため、ここでは metadata を指定しない
    this.connection = this.sora.messaging(this.channelId, undefined, this.options);

    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("datachannel", this.ondatachannel.bind(this));
    this.connection.on("message", this.onmessage.bind(this));
  }

  async connect(compress: boolean, header: boolean, declareReceiverConnectionIdList: boolean) {
    // connect ボタンを無効にする
    const connectButton = document.querySelector<HTMLButtonElement>("#connect");
    if (connectButton) {
      connectButton.disabled = true;
    }

    // header が true の場合は sender_connection_id を追加
    // declareReceiverConnectionIdList が true の場合は receiver_connection_id_list を追加
    const headerFields: MessagingHeaderField[] = [];
    if (header) {
      headerFields.push({ type: "sender_connection_id" });
    }
    if (declareReceiverConnectionIdList) {
      headerFields.push({ type: "receiver_connection_id_list" });
    }
    // dataChannels の compress と header の設定を上書きする
    this.connection.options.dataChannels = [
      {
        label: "#example",
        direction: "sendrecv",
        compress,
        header: headerFields.length > 0 ? headerFields : undefined,
      },
    ];
    // access_token の有効期限が切れないよう、接続の直前に JWT を生成する
    this.connection.metadata = {
      access_token: await generateAccessToken(this.channelId, this.secretKey),
    };
    await this.connection.connect();

    // disconnect ボタンを有効にする
    const disconnectButton = document.querySelector<HTMLButtonElement>("#disconnect");
    if (disconnectButton) {
      disconnectButton.disabled = false;
    }
  }

  async disconnect() {
    await this.connection.disconnect();

    // connect ボタンを有効にする
    const connectButton = document.querySelector<HTMLButtonElement>("#connect");
    if (connectButton) {
      connectButton.disabled = false;
    }

    // disconnect ボタンを無効にする
    const disconnectButton = document.querySelector<HTMLButtonElement>("#disconnect");
    if (disconnectButton) {
      disconnectButton.disabled = true;
    }

    const receivedMessagesElement = document.querySelector("#received-messages");
    if (receivedMessagesElement) {
      receivedMessagesElement.innerHTML = "";
    }

    // 前回の接続での送信時の例外の表示を消す
    const sendMessageErrorElement = document.querySelector("#send-message-error");
    if (sendMessageErrorElement) {
      sendMessageErrorElement.textContent = "";
    }
  }

  async getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
  }

  async sendMessage(message: string) {
    if (message !== "") {
      await this.sendWithErrorDisplay(() =>
        this.connection.sendMessage("#example", new TextEncoder().encode(message)),
      );
    }
  }

  async sendMessageToReceivers(message: string, receiverConnectionIds: string[]) {
    if (message !== "") {
      await this.sendWithErrorDisplay(() =>
        this.connection.sendMessageToReceivers(
          "#example",
          new TextEncoder().encode(message),
          receiverConnectionIds,
        ),
      );
    }
  }

  // 送信処理を実行し、例外が発生した場合は #send-message-error にその内容を表示する
  // 成功した場合は前回の表示を消す
  // E2E テストから送信時の例外の内容を確かめられるようにするため
  private async sendWithErrorDisplay(send: () => Promise<void>) {
    const sendMessageErrorElement = document.querySelector("#send-message-error");
    try {
      await send();
      if (sendMessageErrorElement) {
        sendMessageErrorElement.textContent = "";
      }
    } catch (error) {
      console.error(error);
      if (sendMessageErrorElement) {
        sendMessageErrorElement.textContent =
          error instanceof Error ? error.message : String(error);
      }
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

      // 送信ボタンを有効にする
      const sendMessageButton = document.querySelector<HTMLButtonElement>("#send-message");
      if (sendMessageButton) {
        sendMessageButton.disabled = false;
      }
      const sendMessageToReceiversButton = document.querySelector<HTMLButtonElement>(
        "#send-message-to-receivers",
      );
      if (sendMessageToReceiversButton) {
        sendMessageToReceiversButton.disabled = false;
      }
    }
  }

  private ondatachannel(event: DataChannelEvent) {
    const openDataChannel = document.createElement("li");
    openDataChannel.textContent = new TextDecoder().decode(
      new TextEncoder().encode(event.datachannel.label),
    );
    document.querySelector("#messaging")?.append(openDataChannel);
  }

  private onmessage(event: DataChannelMessageEvent) {
    const message = document.createElement("li");
    message.textContent = new TextDecoder().decode(event.data);
    document.querySelector("#received-messages")?.append(message);
  }
}
