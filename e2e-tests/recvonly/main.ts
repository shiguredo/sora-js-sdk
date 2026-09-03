import { getChannelId, setSoraJsSdkVersion } from "../src/misc";

import Sora from "sora-js-sdk";
import type { SoraConnection, SignalingNotifyMessage, ConnectionSubscriber } from "sora-js-sdk";

type StereoPcmReport = {
  channelCount: number;
  sampleRate: number;
  frames: number;
  rmsLeft: number;
  rmsRight: number;
  diffRms: number;
  correlation: number | null;
};

type StereoPcmBlock = {
  channelCount: number;
  left: Float32Array;
  right: Float32Array;
};

const AUDIO_WORKLET_PROCESSOR_NAME = "sora-stereo-pcm-analyzer";

const AUDIO_WORKLET_SOURCE = `
class SoraStereoPcmAnalyzer extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // 受信音声をスピーカーへ二重に出さない。再生は既存の video 要素が担当する。
    for (const channel of output) {
      channel.fill(0);
    }

    if (input.length === 0 || input[0].length === 0) {
      return true;
    }

    const left = input[0];
    const right = input[1] || input[0];
    const leftCopy = left.slice();
    const rightCopy = right.slice();
    this.port.postMessage(
      {
        channelCount: input.length,
        left: leftCopy,
        right: rightCopy,
      },
      [leftCopy.buffer, rightCopy.buffer],
    );
    return true;
  }
}

registerProcessor("${AUDIO_WORKLET_PROCESSOR_NAME}", SoraStereoPcmAnalyzer);
`;

class StereoPcmAnalyzer {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private muteOutput: GainNode | null = null;
  private reportTimer: number | null = null;
  private stopped = false;

  private channelCount = 0;
  private frames = 0;
  private sumLeft = 0;
  private sumRight = 0;
  private sumLeftSquared = 0;
  private sumRightSquared = 0;
  private sumCross = 0;
  private sumDifferenceSquared = 0;

  constructor(
    private readonly stream: MediaStream,
    private readonly onReport: (report: StereoPcmReport) => void,
    private readonly onBlock: (block: StereoPcmBlock) => void,
  ) {}

  async start(): Promise<void> {
    this.audioContext = new AudioContext();
    const workletUrl = URL.createObjectURL(
      new Blob([AUDIO_WORKLET_SOURCE], { type: "application/javascript" }),
    );
    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    if (this.stopped) {
      return;
    }

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = new AudioWorkletNode(this.audioContext, AUDIO_WORKLET_PROCESSOR_NAME, {
      channelInterpretation: "discrete",
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.muteOutput = this.audioContext.createGain();
    this.muteOutput.gain.value = 0;

    this.processor.port.onmessage = (event: MessageEvent) => {
      const { channelCount, left, right } = event.data as {
        channelCount: number;
        left: Float32Array;
        right: Float32Array;
      };
      this.onBlock({ channelCount, left, right });
      this.addSamples(channelCount, left, right);
    };

    this.source.connect(this.processor);
    this.processor.connect(this.muteOutput);
    this.muteOutput.connect(this.audioContext.destination);
    this.reportTimer = window.setInterval(() => this.report(), 1000);
    await this.audioContext.resume();
  }

  stop(): void {
    this.stopped = true;
    if (this.reportTimer !== null) {
      window.clearInterval(this.reportTimer);
      this.reportTimer = null;
    }
    this.processor?.port.close();
    this.source?.disconnect();
    this.processor?.disconnect();
    this.muteOutput?.disconnect();
    void this.audioContext?.close();
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this.muteOutput = null;
  }

  private addSamples(channelCount: number, left: Float32Array, right: Float32Array): void {
    this.channelCount = Math.max(this.channelCount, channelCount);
    if (channelCount < 2) {
      return;
    }

    const sampleCount = Math.min(left.length, right.length);
    for (let index = 0; index < sampleCount; index += 1) {
      const leftSample = left[index];
      const rightSample = right[index];
      const difference = leftSample - rightSample;
      this.frames += 1;
      this.sumLeft += leftSample;
      this.sumRight += rightSample;
      this.sumLeftSquared += leftSample * leftSample;
      this.sumRightSquared += rightSample * rightSample;
      this.sumCross += leftSample * rightSample;
      this.sumDifferenceSquared += difference * difference;
    }
  }

  private report(): void {
    const frames = this.frames;
    if (frames === 0) {
      return;
    }

    const meanLeft = this.sumLeft / frames;
    const meanRight = this.sumRight / frames;
    const varianceLeft = Math.max(0, this.sumLeftSquared / frames - meanLeft * meanLeft);
    const varianceRight = Math.max(0, this.sumRightSquared / frames - meanRight * meanRight);
    const covariance = this.sumCross / frames - meanLeft * meanRight;
    const denominator = Math.sqrt(varianceLeft * varianceRight);
    const correlation = denominator > 1e-12 ? covariance / denominator : null;

    this.onReport({
      channelCount: this.channelCount,
      sampleRate: this.audioContext?.sampleRate ?? 0,
      frames,
      rmsLeft: Math.sqrt(this.sumLeftSquared / frames),
      rmsRight: Math.sqrt(this.sumRightSquared / frames),
      diffRms: Math.sqrt(this.sumDifferenceSquared / frames),
      correlation,
    });

    this.frames = 0;
    this.sumLeft = 0;
    this.sumRight = 0;
    this.sumLeftSquared = 0;
    this.sumRightSquared = 0;
    this.sumCross = 0;
    this.sumDifferenceSquared = 0;
  }
}

class StereoWaveformRenderer {
  private static readonly HISTORY_FRAMES = 4_800;

  private readonly left = new Float32Array(StereoWaveformRenderer.HISTORY_FRAMES);
  private readonly right = new Float32Array(StereoWaveformRenderer.HISTORY_FRAMES);
  private readonly difference = new Float32Array(StereoWaveformRenderer.HISTORY_FRAMES);
  private readonly context: CanvasRenderingContext2D | null;
  private writeIndex = 0;
  private sampleCount = 0;
  private animationId: number | null = null;

  constructor(private readonly canvas: HTMLCanvasElement | null) {
    this.context = canvas?.getContext("2d") ?? null;
  }

  addBlock(block: StereoPcmBlock): void {
    if (this.context === null || block.channelCount < 2) {
      return;
    }

    const count = Math.min(block.left.length, block.right.length);
    for (let index = 0; index < count; index += 1) {
      const leftSample = block.left[index];
      const rightSample = block.right[index];
      this.left[this.writeIndex] = leftSample;
      this.right[this.writeIndex] = rightSample;
      this.difference[this.writeIndex] = leftSample - rightSample;
      this.writeIndex = (this.writeIndex + 1) % StereoWaveformRenderer.HISTORY_FRAMES;
      this.sampleCount = Math.min(
        this.sampleCount + 1,
        StereoWaveformRenderer.HISTORY_FRAMES,
      );
    }

    if (this.animationId === null) {
      this.animationId = window.requestAnimationFrame(() => this.draw());
    }
  }

  stop(): void {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.sampleCount = 0;
    this.writeIndex = 0;
    this.left.fill(0);
    this.right.fill(0);
    this.difference.fill(0);
    this.clear();
  }

  private clear(): void {
    if (this.context && this.canvas) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private draw(): void {
    this.animationId = null;
    if (this.context === null || this.canvas === null) {
      return;
    }

    const { width, height } = this.canvas;
    const laneHeight = height / 3;
    this.context.fillStyle = "#111";
    this.context.fillRect(0, 0, width, height);

    const channelPeak = Math.max(this.peak(this.left), this.peak(this.right), 1e-4);
    const differencePeak = Math.max(this.peak(this.difference), 1e-4);
    this.drawLane(0, laneHeight, "L", "#f66", 1 / channelPeak);
    this.drawLane(laneHeight, laneHeight, "R", "#66f", 1 / channelPeak);
    this.drawLane(laneHeight * 2, laneHeight, "L - R", "#bbb", 1 / differencePeak);

    if (this.sampleCount > 0) {
      this.animationId = window.requestAnimationFrame(() => this.draw());
    }
  }

  private drawLane(
    top: number,
    height: number,
    label: string,
    color: string,
    amplitudeScale = 1,
  ): void {
    if (this.context === null || this.canvas === null) {
      return;
    }

    const center = top + height / 2;
    this.context.strokeStyle = "#444";
    this.context.beginPath();
    this.context.moveTo(0, center);
    this.context.lineTo(this.canvas.width, center);
    this.context.stroke();

    this.context.fillStyle = color;
    this.context.font = "16px sans-serif";
    this.context.fillText(label, 8, top + 20);

    if (this.sampleCount < 2) {
      return;
    }

    const buffer = label === "L" ? this.left : label === "R" ? this.right : this.difference;
    const firstIndex =
      (this.writeIndex - this.sampleCount + StereoWaveformRenderer.HISTORY_FRAMES) %
      StereoWaveformRenderer.HISTORY_FRAMES;
    const lastPixel = Math.max(1, this.canvas.width - 1);
    const lastSample = this.sampleCount - 1;

    this.context.strokeStyle = color;
    this.context.lineWidth = 1.5;
    this.context.beginPath();
    for (let pixel = 0; pixel < this.canvas.width; pixel += 1) {
      const sampleIndex = Math.min(lastSample, Math.floor((pixel / lastPixel) * lastSample));
      const bufferIndex = (firstIndex + sampleIndex) % StereoWaveformRenderer.HISTORY_FRAMES;
      const sample = Math.max(-1, Math.min(1, buffer[bufferIndex] * amplitudeScale));
      const y = center - sample * height * 0.42;
      if (pixel === 0) {
        this.context.moveTo(pixel, y);
      } else {
        this.context.lineTo(pixel, y);
      }
    }
    this.context.stroke();
  }

  private peak(buffer: Float32Array): number {
    if (this.sampleCount === 0) {
      return 0;
    }

    const firstIndex =
      (this.writeIndex - this.sampleCount + StereoWaveformRenderer.HISTORY_FRAMES) %
      StereoWaveformRenderer.HISTORY_FRAMES;
    let peak = 0;
    for (let index = 0; index < this.sampleCount; index += 1) {
      const bufferIndex = (firstIndex + index) % StereoWaveformRenderer.HISTORY_FRAMES;
      peak = Math.max(peak, Math.abs(buffer[bufferIndex]));
    }
    return peak;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const signalingUrl = import.meta.env.VITE_TEST_SIGNALING_URL;
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || "";
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || "";
  const secretKey = import.meta.env.VITE_TEST_SECRET_KEY;

  setSoraJsSdkVersion();

  let client: SoraClient;

  document.querySelector("#connect")?.addEventListener("click", async () => {
    if (client) {
      await client.disconnect();
    }

    const channelId = getChannelId(channelIdPrefix, channelIdSuffix);

    client = new SoraClient(signalingUrl, channelId, secretKey);

    await client.connect();
  });

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    if (!client) {
      return;
    }

    await client.disconnect();
  });

  document.querySelector("#get-stats")?.addEventListener("click", async () => {
    if (!client) {
      return;
    }

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
  private readonly options: object = { connectionTimeout: 15_000 };

  private readonly sora: SoraConnection;
  private readonly connection: ConnectionSubscriber;
  private readonly waveformRenderer: StereoWaveformRenderer;
  private pcmAnalyzer: StereoPcmAnalyzer | null = null;

  constructor(signalingUrl: string, channelId: string, secretKey: string) {
    this.sora = Sora.connection(signalingUrl, this.debug);
    this.channelId = channelId;

    // access_token を指定する metadata の生成
    this.metadata = { access_token: secretKey };

    this.waveformRenderer = new StereoWaveformRenderer(
      document.querySelector<HTMLCanvasElement>("#audio-waveform"),
    );
    this.connection = this.sora.recvonly(this.channelId, this.metadata, this.options);
    this.connection.options.forceStereoOutput = true;
    this.connection.on("notify", this.onnotify.bind(this));
    this.connection.on("track", this.ontrack.bind(this));
    this.connection.on("removetrack", this.onremovetrack.bind(this));
  }

  async connect(): Promise<void> {
    await this.connection.connect();
  }

  async disconnect(): Promise<void> {
    this.pcmAnalyzer?.stop();
    this.pcmAnalyzer = null;
    this.waveformRenderer.stop();
    await this.connection.disconnect();
    const remoteVideos = document.querySelector("#remote-videos");
    if (remoteVideos) {
      remoteVideos.innerHTML = "";
    }
  }

  async getStats(): Promise<RTCStatsReport> {
    if (this.connection.pc === null) {
      throw new Error("PeerConnection is not ready");
    }
    return this.connection.pc.getStats();
  }

  private onnotify(event: SignalingNotifyMessage) {
    // 自分の connection_id を取得する
    if (
      event.event_type === "connection.created" &&
      this.connection.connectionId === event.connection_id
    ) {
      const connectionIdElement = document.querySelector<HTMLDivElement>("#connection-id");
      if (connectionIdElement) {
        connectionIdElement.textContent = event.connection_id;
      }
    }
  }

  private ontrack(event: RTCTrackEvent) {
    // Sora の場合、event.streams には MediaStream が 1 つだけ含まれる
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
      remoteVideo.srcObject = stream;
      remoteVideos.append(remoteVideo);
    }

    if (event.track.kind === "audio") {
      this.pcmAnalyzer?.stop();
      this.waveformRenderer.stop();
      this.pcmAnalyzer = new StereoPcmAnalyzer(
        stream,
        (report) => {
          const analysisElement = document.querySelector<HTMLElement>("#audio-analysis");
          if (!analysisElement) {
            return;
          }
          const differenceRatio =
            report.diffRms / Math.max(report.rmsLeft, report.rmsRight, Number.EPSILON);
          analysisElement.textContent = [
            `observed channels: ${report.channelCount}`,
            `sample rate: ${report.sampleRate} Hz`,
            `frames: ${report.frames}`,
            `L RMS: ${report.rmsLeft.toFixed(6)}`,
            `R RMS: ${report.rmsRight.toFixed(6)}`,
            `L/R diff RMS: ${report.diffRms.toFixed(6)}`,
            `diff ratio: ${differenceRatio.toFixed(6)}`,
            `correlation: ${report.correlation === null ? "n/a" : report.correlation.toFixed(6)}`,
          ].join("\n");
        },
        (block) => this.waveformRenderer.addBlock(block),
      );
      void this.pcmAnalyzer.start().catch((error: unknown) => {
        const analysisElement = document.querySelector<HTMLElement>("#audio-analysis");
        if (analysisElement) {
          analysisElement.textContent = `PCM 解析エラー: ${String(error)}`;
        }
      });
    }
  }

  private onremovetrack(event: MediaStreamTrackEvent) {
    // このトラックが属している MediaStream の id を取得する
    const stream = event.target as MediaStream;
    const remoteVideo = document.querySelector(`#remote-video-${stream.id}`);
    if (remoteVideo) {
      remoteVideo.remove();
    }
  }
}
