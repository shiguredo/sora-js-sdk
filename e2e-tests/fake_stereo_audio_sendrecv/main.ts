import { getFakeMedia } from "../src/fake";
import { getChannelId, setSoraJsSdkVersion } from "../src/misc";

import Sora from "sora-js-sdk";
import type {
  ConnectionOptions,
  ConnectionPublisher,
  SignalingNotifyMessage,
  SoraConnection,
} from "sora-js-sdk";

// Soraオブジェクトをwindowに公開（テスト用）
declare global {
  interface Window {
    Sora: typeof Sora;
  }
}
window.Sora = Sora;

// リアルタイム音声解析クラス
class RealtimeAudioAnalyzer {
  private readonly audioContext: AudioContext;
  private readonly source: MediaStreamAudioSourceNode;
  private readonly splitter: ChannelSplitterNode;
  private readonly analyserLeft: AnalyserNode;
  private readonly analyserRight: AnalyserNode;
  private animationId: number | null = null;
  private readonly channelCount: number;

  constructor(
    stream: MediaStream,
    private readonly prefix: string,
  ) {
    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.channelCount = this.source.channelCount;

    // チャンネル分離
    this.splitter = this.audioContext.createChannelSplitter(2);
    this.source.connect(this.splitter);

    // 左チャンネルのアナライザー
    this.analyserLeft = this.audioContext.createAnalyser();
    this.analyserLeft.fftSize = 2048;
    this.analyserLeft.smoothingTimeConstant = 0.8;
    this.splitter.connect(this.analyserLeft, 0);

    // 右チャンネルのアナライザー
    this.analyserRight = this.audioContext.createAnalyser();
    this.analyserRight.fftSize = 2048;
    this.analyserRight.smoothingTimeConstant = 0.8;

    if (this.channelCount >= 2) {
      this.splitter.connect(this.analyserRight, 1);
    }
  }

  private detectDominantFrequency(analyser: AnalyserNode): number {
    const dataArray = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(dataArray);

    let maxValue = Number.NEGATIVE_INFINITY;
    let maxIndex = 0;

    // 100Hz以上の周波数のみを対象にする（ノイズ除去）
    const minIndex = Math.floor((100 * analyser.fftSize) / this.audioContext.sampleRate);

    for (let i = minIndex; i < dataArray.length; i++) {
      if (dataArray[i] > maxValue) {
        maxValue = dataArray[i];
        maxIndex = i;
      }
    }

    return (maxIndex * this.audioContext.sampleRate) / analyser.fftSize;
  }

  private updateDisplay(): void {
    const leftFreq = this.detectDominantFrequency(this.analyserLeft);
    const rightFreq =
      this.channelCount >= 2 ? this.detectDominantFrequency(this.analyserRight) : leftFreq;

    // 片方のチャンネルが0Hzの場合はステレオと判定しない
    const isStereo =
      this.channelCount >= 2 &&
      leftFreq > 0 &&
      rightFreq > 0 &&
      Math.abs(leftFreq - rightFreq) > 50;

    // 表示更新
    const channelCountEl = document.querySelector(`#${this.prefix}-channel-count`);
    const leftFreqEl = document.querySelector(`#${this.prefix}-left-frequency`);
    const rightFreqEl = document.querySelector(`#${this.prefix}-right-frequency`);
    const isStereoEl = document.querySelector(`#${this.prefix}-is-stereo`);

    if (channelCountEl) {
      channelCountEl.textContent = this.channelCount.toString();
    }
    if (leftFreqEl) {
      leftFreqEl.textContent = leftFreq.toFixed(1);
    }
    if (rightFreqEl) {
      rightFreqEl.textContent = rightFreq.toFixed(1);
    }
    if (isStereoEl) {
      isStereoEl.textContent = isStereo ? "Yes" : "No";
    }

    // 次のフレーム
    this.animationId = requestAnimationFrame(() => {
      this.updateDisplay();
    });
  }

  start(): void {
    this.updateDisplay();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.source.disconnect();
    void this.audioContext.close();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;

  setSoraJsSdkVersion();

  let soraClient1: SoraSendRecvClient | null = null;
  let soraClient2: SoraSendRecvClient | null = null;
  let localAnalyzer1: RealtimeAudioAnalyzer | null = null;
  let remoteAnalyzer1: RealtimeAudioAnalyzer | null = null;
  let localAnalyzer2: RealtimeAudioAnalyzer | null = null;
  let remoteAnalyzer2: RealtimeAudioAnalyzer | null = null;
  // 接続 1 / 接続 2 の fake stream 由来 cleanup を個別に保持する。
  let fakeCleanup1: (() => void) | null = null;
  let fakeCleanup2: (() => void) | null = null;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    const channelId = getChannelId(channelIdPrefix, channelIdSuffix);

    // sendrecv 方向では addStereoToFmtp が isRecvOnly ゲートで弾かれて no-op になるため
    // forceStereoOutput は SDP 上の差を生まない。fixture では useStereo のみを反映する。
    // HTML 初期値への暗黙依存を解消するためテスト側からも明示的にチェック状態を制御する。
    const useStereo1 = document.querySelector<HTMLInputElement>("#use-stereo-1")!.checked;
    const useStereo2 = document.querySelector<HTMLInputElement>("#use-stereo-2")!.checked;

    // 接続1を作成
    soraClient1 = new SoraSendRecvClient(signalingUrl, channelId, secretKey, "1", {
      useStereo: useStereo1,
    });

    // 既存の cleanup が残っていれば解放してから新しい stream を生成する。
    if (fakeCleanup1) {
      fakeCleanup1();
      fakeCleanup1 = null;
    }
    // 接続1用の音声ストリームを生成（440Hz基準）
    const { stream: stream1, cleanup: cleanup1 } = getFakeMedia({
      audio: {
        frequency: 440,
        stereo: useStereo1,
        volume: 0.1,
      },
    });
    fakeCleanup1 = cleanup1;

    // 接続1のローカル音声解析を開始
    if (localAnalyzer1) {
      localAnalyzer1.stop();
    }
    localAnalyzer1 = new RealtimeAudioAnalyzer(stream1, "conn1-local");
    localAnalyzer1.start();

    // 接続1のリモートストリーム受信時のコールバックを設定
    soraClient1.setOnStreamCallback((remoteStream: MediaStream) => {
      if (remoteAnalyzer1) {
        remoteAnalyzer1.stop();
      }
      remoteAnalyzer1 = new RealtimeAudioAnalyzer(remoteStream, "conn1-remote");
      remoteAnalyzer1.start();
    });

    // 接続1を開始
    try {
      await soraClient1.connect(stream1);
    } catch (error) {
      // connect 失敗時にも接続 1 の fake stream を解放する。
      if (fakeCleanup1) {
        fakeCleanup1();
        fakeCleanup1 = null;
      }
      throw error;
    }

    // 少し待機してから接続2を開始
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 接続2を作成
    soraClient2 = new SoraSendRecvClient(signalingUrl, channelId, secretKey, "2", {
      useStereo: useStereo2,
    });

    // 既存の cleanup が残っていれば解放してから新しい stream を生成する。
    if (fakeCleanup2) {
      fakeCleanup2();
      fakeCleanup2 = null;
    }
    // 接続2用の音声ストリームを生成（880Hz基準、接続1と区別するため）
    const { stream: stream2, cleanup: cleanup2 } = getFakeMedia({
      audio: {
        frequency: 880,
        stereo: useStereo2,
        volume: 0.1,
      },
    });
    fakeCleanup2 = cleanup2;

    // 接続2のローカル音声解析を開始
    if (localAnalyzer2) {
      localAnalyzer2.stop();
    }
    localAnalyzer2 = new RealtimeAudioAnalyzer(stream2, "conn2-local");
    localAnalyzer2.start();

    // 接続2のリモートストリーム受信時のコールバックを設定
    soraClient2.setOnStreamCallback((remoteStream: MediaStream) => {
      if (remoteAnalyzer2) {
        remoteAnalyzer2.stop();
      }
      remoteAnalyzer2 = new RealtimeAudioAnalyzer(remoteStream, "conn2-remote");
      remoteAnalyzer2.start();
    });

    // 接続2を開始
    try {
      await soraClient2.connect(stream2);
    } catch (error) {
      // connect 失敗時にも接続 2 の fake stream を解放する。
      if (fakeCleanup2) {
        fakeCleanup2();
        fakeCleanup2 = null;
      }
      throw error;
    }
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    // analyzer.stop / client.disconnect が throw しても fake stream は必ず解放する。
    try {
      if (localAnalyzer1) {
        localAnalyzer1.stop();
        localAnalyzer1 = null;
      }
      if (remoteAnalyzer1) {
        remoteAnalyzer1.stop();
        remoteAnalyzer1 = null;
      }
      if (localAnalyzer2) {
        localAnalyzer2.stop();
        localAnalyzer2 = null;
      }
      if (remoteAnalyzer2) {
        remoteAnalyzer2.stop();
        remoteAnalyzer2 = null;
      }
      if (soraClient1) {
        await soraClient1.disconnect();
        soraClient1 = null;
      }
      if (soraClient2) {
        await soraClient2.disconnect();
        soraClient2 = null;
      }
    } finally {
      if (fakeCleanup1) {
        fakeCleanup1();
        fakeCleanup1 = null;
      }
      if (fakeCleanup2) {
        fakeCleanup2();
        fakeCleanup2 = null;
      }
    }
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    if (!soraClient1 || !soraClient2) {
      return;
    }

    // 接続1の統計情報を取得
    const statsReport1 = await soraClient1.getStats();
    const statsDiv1 = document.querySelector<HTMLElement>("#stats-report-1")!;
    if (statsDiv1) {
      let statsHtml = "<h3>接続1の統計情報</h3>";
      const statsReportJson1: Array<Record<string, unknown>> = [];
      for (const report of statsReport1.values()) {
        statsHtml += `<h4>Type: ${report.type}</h4><ul>`;
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
        statsReportJson1.push(reportJson);
      }
      statsDiv1.innerHTML = statsHtml;
      statsDiv1.dataset.statsReportJson = JSON.stringify(statsReportJson1);
    }

    // 接続2の統計情報を取得
    const statsReport2 = await soraClient2.getStats();
    const statsDiv2 = document.querySelector<HTMLElement>("#stats-report-2")!;
    if (statsDiv2) {
      let statsHtml = "<h3>接続2の統計情報</h3>";
      const statsReportJson2: Array<Record<string, unknown>> = [];
      for (const report of statsReport2.values()) {
        statsHtml += `<h4>Type: ${report.type}</h4><ul>`;
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
        statsReportJson2.push(reportJson);
      }
      statsDiv2.innerHTML = statsHtml;
      statsDiv2.dataset.statsReportJson = JSON.stringify(statsReportJson2);
    }

    // テスト用の音声解析データを保存
    const analysisDiv = document.querySelector<HTMLElement>("#audio-analysis")!;
    if (analysisDiv) {
      analysisDiv.dataset.analysis = JSON.stringify({
        connection1: {
          local: {
            channelCount: Number.parseInt(
              document.querySelector("#conn1-local-channel-count")?.textContent ?? "0",
              10,
            ),
            isStereo: document.querySelector("#conn1-local-is-stereo")?.textContent === "Yes",
            leftFrequency: Number.parseFloat(
              document.querySelector("#conn1-local-left-frequency")?.textContent ?? "0",
            ),
            rightFrequency: Number.parseFloat(
              document.querySelector("#conn1-local-right-frequency")?.textContent ?? "0",
            ),
          },
          remote: {
            channelCount: Number.parseInt(
              document.querySelector("#conn1-remote-channel-count")?.textContent ?? "0",
              10,
            ),
            isStereo: document.querySelector("#conn1-remote-is-stereo")?.textContent === "Yes",
            leftFrequency: Number.parseFloat(
              document.querySelector("#conn1-remote-left-frequency")?.textContent ?? "0",
            ),
            rightFrequency: Number.parseFloat(
              document.querySelector("#conn1-remote-right-frequency")?.textContent ?? "0",
            ),
          },
        },
        connection2: {
          local: {
            channelCount: Number.parseInt(
              document.querySelector("#conn2-local-channel-count")?.textContent ?? "0",
              10,
            ),
            isStereo: document.querySelector("#conn2-local-is-stereo")?.textContent === "Yes",
            leftFrequency: Number.parseFloat(
              document.querySelector("#conn2-local-left-frequency")?.textContent ?? "0",
            ),
            rightFrequency: Number.parseFloat(
              document.querySelector("#conn2-local-right-frequency")?.textContent ?? "0",
            ),
          },
          remote: {
            channelCount: Number.parseInt(
              document.querySelector("#conn2-remote-channel-count")?.textContent ?? "0",
              10,
            ),
            isStereo: document.querySelector("#conn2-remote-is-stereo")?.textContent === "Yes",
            leftFrequency: Number.parseFloat(
              document.querySelector("#conn2-remote-left-frequency")?.textContent ?? "0",
            ),
            rightFrequency: Number.parseFloat(
              document.querySelector("#conn2-remote-right-frequency")?.textContent ?? "0",
            ),
          },
        },
      });
    }

    // 2 接続分の sendrecv answer SDP を持ち回す #stereo-negotiation を atomic に書き込んで append する。
    // fake_stereo_audio_sendrecv の #stats-report-1 は statsDiv1.innerHTML 上書きで再構築されるため、
    // append は innerHTML 上書きの後に行う。複数回 click 対策の防御的 remove も残す。
    document.querySelector("#stereo-negotiation")?.remove();

    const negotiationDiv = document.createElement("div");
    negotiationDiv.id = "stereo-negotiation";
    negotiationDiv.dataset.negotiation = JSON.stringify({
      conn1LocalSdp: soraClient1.getLocalSdp() ?? "",
      conn2LocalSdp: soraClient2.getLocalSdp() ?? "",
    });
    document.querySelector("#stats-report-1")?.append(negotiationDiv);
  });
});

class SoraSendRecvClient {
  private readonly debug = false;
  private readonly channelId: string;
  private readonly metadata: { access_token: string };
  private readonly options: ConnectionOptions;

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionPublisher;
  private onStreamCallback: ((stream: MediaStream) => void) | null = null;
  private remoteStream: MediaStream | null = null;
  private readonly connectionNumber: string;

  constructor(
    signalingUrl: string,
    channelId: string,
    secretKey: string,
    connectionNumber: string,
    fixtureOptions: { useStereo: boolean },
  ) {
    this.sora = Sora.connection(signalingUrl, this.debug);
    this.channelId = channelId;
    this.connectionNumber = connectionNumber;

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey };

    const baseOptions: ConnectionOptions = { connectionTimeout: 15_000 };
    if (fixtureOptions.useStereo) {
      baseOptions.audioOpusParamsStereo = true;
    }
    // sendrecv では addStereoToFmtp が呼ばれないため audioOpusParamsMinptime は設定しない。
    this.options = baseOptions;

    this.connection = this.sora.sendrecv(this.channelId, this.metadata, this.options);
    this.connection.on("track", this.onTrack.bind(this));
    this.connection.on("notify", this.onNotify.bind(this));
  }

  setOnStreamCallback(callback: (stream: MediaStream) => void): void {
    this.onStreamCallback = callback;
  }

  async connect(stream: MediaStream): Promise<void> {
    await this.connection.connect(stream);

    const audioElement = document.querySelector<HTMLAudioElement>(
      `#local-audio-${this.connectionNumber}`,
    );
    if (audioElement !== null) {
      audioElement.srcObject = stream;
    }
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();

    const localAudioElement = document.querySelector<HTMLAudioElement>(
      `#local-audio-${this.connectionNumber}`,
    );
    if (localAudioElement !== null) {
      localAudioElement.srcObject = null;
    }

    const remoteAudioElement = document.querySelector<HTMLAudioElement>(
      `#remote-audio-${this.connectionNumber}`,
    );
    if (remoteAudioElement !== null) {
      remoteAudioElement.srcObject = null;
    }
  }

  async getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
  }

  // SDK 内部 PC の localDescription.sdp を fixture 経由で取得するための getter。
  getLocalSdp(): string | null {
    return this.connection.pc?.localDescription?.sdp ?? null;
  }

  private onTrack(event: RTCTrackEvent): void {
    this.remoteStream = event.streams[0];
    const audioElement = document.querySelector<HTMLAudioElement>(
      `#remote-audio-${this.connectionNumber}`,
    );
    if (audioElement !== null) {
      audioElement.srcObject = event.streams[0];
    }

    // ストリームコールバックを実行
    if (this.onStreamCallback && event.streams[0]) {
      this.onStreamCallback(event.streams[0]);
    }
  }

  private onNotify(event: SignalingNotifyMessage): void {
    if (
      event.event_type === "connection.created" &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector(`#connection-id-${this.connectionNumber}`);
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id;
      }
    }
  }
}
