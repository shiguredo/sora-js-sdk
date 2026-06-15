import type { Page } from "@playwright/test";

export interface VersionRequirement {
  majorVersion: number;
  minorVersion: number;
  featureName: string;
}

export type StatsReport = Array<Record<string, unknown>>;

export interface Resolution {
  height: number;
  width: number;
}

// 音声分析結果（1 接続分）
export interface AudioChannelAnalysis {
  channelCount?: number;
  isStereo: boolean;
  leftFrequency: number;
  rightFrequency: number;
}

// 音声分析結果（送受信 1 接続分）
export interface StereoAudioAnalysisData {
  local: AudioChannelAnalysis;
  remote: AudioChannelAnalysis;
}

// 音声分析結果（双方向 2 接続分）
export interface StereoAudioSendRecvAnalysisData {
  connection1: StereoAudioAnalysisData;
  connection2: StereoAudioAnalysisData;
}

// fake_stereo_audio fixture の #stereo-negotiation dataset 形式
// stereo audio E2E で送信 / 受信側の localDescription と codec stats を持ち回す
export interface StereoNegotiationData {
  sendLocalSdp: string;
  recvLocalSdp: string;
  sendOpusCodec: StatsReport[number] | null;
}

// fake_stereo_audio_sendrecv fixture の #stereo-negotiation dataset 形式
// 2 接続分の sendrecv answer SDP を持ち回す
export interface StereoSendRecvNegotiationData {
  conn1LocalSdp: string;
  conn2LocalSdp: string;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/u;

const CHROME_PROJECT_NAMES = new Set([
  "Google Chrome Canary",
  "Google Chrome Dev",
  "Google Chrome Beta",
  "Google Chrome",
]);

// Playwright に依存しない純粋な関数
export function checkVersionSupport(
  version: string | null,
  requirement: VersionRequirement,
): { isSupported: boolean; skipReason?: string; version?: string } {
  if (!version) {
    return {
      isSupported: false,
      skipReason: "Sora JS SDK version not found",
    };
  }

  const versionMatch = VERSION_PATTERN.exec(version);
  if (!versionMatch) {
    return {
      isSupported: false,
      skipReason: `Cannot parse Sora JS SDK version: ${version}`,
    };
  }

  const majorVersion = Number.parseInt(versionMatch[1], 10);
  const minorVersion = Number.parseInt(versionMatch[2], 10);

  if (
    majorVersion < requirement.majorVersion ||
    (majorVersion === requirement.majorVersion && minorVersion < requirement.minorVersion)
  ) {
    return {
      isSupported: false,
      skipReason: `Sora JS SDK version ${version} is older than ${requirement.majorVersion}.${requirement.minorVersion} (${requirement.featureName} support required)`,
      version,
    };
  }

  return { isSupported: true, version };
}

// バージョン未対応時のスキップ理由を返す
export function unsupportedVersionSkipReason(skipReason?: string): string {
  return skipReason ?? "Version not supported";
}

// opus の payload type を answer SDP から抽出する。
// WebRTC では opus channel 数は rtpmap で常に 2 として宣言されるが、
// 保険として末尾の channel 数は緩く受ける。
// CRLF SDP の末尾 \r を許容するため `\r?` を入れる。
export function getOpusPayloadType(sdp: string): number | null {
  const match = /^a=rtpmap:(\d+) opus\/48000\/\d+\r?$/mu.exec(sdp);
  return match === null ? null : Number.parseInt(match[1], 10);
}

// opus payload type に対応する fmtp 行のパラメータ列を抽出する内部 helper。
// CRLF / LF どちらの SDP でも末尾の \r を group 1 に含めないため
// `([^\r\n]+)` で行末文字を除外する。
function extractFmtpParams(sdp: string, payloadType: number): string[] | null {
  const fmtpRegex = new RegExp(`^a=fmtp:${payloadType} ([^\\r\\n]+)$`, "mu");
  const match = fmtpRegex.exec(sdp);
  if (match === null) {
    return null;
  }
  return match[1].split(";").map((param) => param.trim());
}

// opus fmtp に stereo=1 が含まれるかを判定する。
// addStereoToFmtp / Sora の audio.opus_params.stereo 反映の検証に使う。
export function hasOpusStereo(sdp: string, payloadType: number): boolean {
  const params = extractFmtpParams(sdp, payloadType);
  return params !== null && params.includes("stereo=1");
}

// appendStereo の冪等ガードが壊れて二重付与された場合を検知するため
// `stereo=1` の出現回数を返す。
export function countOpusStereo(sdp: string, payloadType: number): number {
  const params = extractFmtpParams(sdp, payloadType);
  if (params === null) {
    return 0;
  }
  return params.filter((param) => param === "stereo=1").length;
}

// opus fmtp に minptime パラメータが含まれるかを判定する。
// forceStereoOutput 経路は recv answer に minptime があることが addStereoToFmtp の起動条件のため
// 受信 SDP の minptime 有無で assert を分岐させる。
export function hasOpusMinptime(sdp: string, payloadType: number): boolean {
  const params = extractFmtpParams(sdp, payloadType);
  return params !== null && params.some((param) => /^minptime=\d+$/u.test(param));
}

// Playwright 用のラッパー関数
export async function checkSoraVersion(
  page: Page,
  requirement: VersionRequirement,
): Promise<{ isSupported: boolean; skipReason?: string; version?: string }> {
  // sora-js-sdk-version 要素が更新されるまで待つ
  await page.waitForSelector("#sora-js-sdk-version:not(:empty)", {
    timeout: 5000,
  });

  // バージョンを DOM 要素から取得
  const version = await page.evaluate(() => {
    const versionElement = document.querySelector("#sora-js-sdk-version");
    return versionElement ? versionElement.textContent : null;
  });

  return checkVersionSupport(version, requirement);
}

// window.Sora.version() からバージョンを取得してチェックする
export async function checkSoraVersionFromWindow(
  page: Page,
  requirement: VersionRequirement,
): Promise<{ isSupported: boolean; skipReason?: string; version?: string }> {
  const version = await page.evaluate(() => {
    const sora = (window as { Sora?: { version(): string } }).Sora;
    return sora === undefined ? null : sora.version();
  });

  return checkVersionSupport(version, requirement);
}

// H265 テストをスキップすべきかどうか
export function shouldSkipH265Test(projectName: string): boolean {
  return (
    !CHROME_PROJECT_NAMES.has(projectName) ||
    process.env.RUNNER_ENVIRONMENT !== "self-hosted" ||
    process.platform !== "darwin"
  );
}

// WebKit テストをスキップすべきかどうか
export function shouldSkipWebKitTest(projectName: string): boolean {
  return projectName !== "WebKit" || process.platform !== "darwin";
}

// 統計レポート JSON を DOM から取得する
export async function getStatsReportJson(
  page: Page,
  selector = "#stats-report",
): Promise<StatsReport> {
  return page.$eval(selector, (el) => {
    const element = el as HTMLElement;
    const json = element.dataset.statsReportJson;
    return JSON.parse(json ?? "[]");
  });
}

// data 属性名を指定して統計レポート JSON を取得する
export async function getStatsReportJsonByDatasetKey(
  page: Page,
  selector: string,
  datasetKey: string,
): Promise<StatsReport> {
  return page.$eval(
    selector,
    (el, key) => {
      const element = el as HTMLElement;
      const json = element.dataset[key as keyof DOMStringMap];
      return JSON.parse(json ?? "[]");
    },
    datasetKey,
  );
}

// 受信側統計レポート JSON を取得する
export async function getRecvStatsReportJson(page: Page): Promise<StatsReport> {
  return getStatsReportJsonByDatasetKey(
    page,
    "[data-recv-stats-report-json]",
    "recvStatsReportJson",
  );
}

// 音声分析結果を DOM から取得する
export async function getAnalysisData<T>(page: Page, selector = "#audio-analysis"): Promise<T> {
  return page.$eval(selector, (el) => {
    const element = el as HTMLElement;
    const json = element.dataset.analysis;
    return JSON.parse(json ?? "{}") as T;
  });
}

// #stereo-negotiation の dataset.negotiation が現れるまで待ってから JSON を取り出す。
// #get-stats クリック直後は dataset が未書き込みの可能性があるため、
// 必ずこの helper 経由でアクセスする。
// timeout は短め (10 秒) にして失敗時に原因切り分けを早める。Playwright デフォルトの 30 秒は
// 「dataset 書き込み失敗」の原因を 30 秒待たないと見えないため不適切。
// ジェネリクスデフォルトは設けず、呼び出し側で <StereoNegotiationData> か
// <StereoSendRecvNegotiationData> を明示することで形状ミスを compile 時に検知する。
export async function waitForStereoNegotiationData<T>(
  page: Page,
  options: { selector?: string; timeout?: number } = {},
): Promise<T> {
  const { selector = "#stereo-negotiation", timeout = 10_000 } = options;
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el !== null && (el as HTMLElement).dataset.negotiation !== undefined;
    },
    selector,
    { timeout },
  );
  return page.$eval(selector, (el) => {
    const element = el as HTMLElement;
    const json = element.dataset.negotiation;
    // fixture 側は必ず JSON.stringify(...) で非空文字を書き込むが、防御として空文字時は
    // 明示的に throw して原因を即座に特定できるようにする
    if (json === undefined || json === "") {
      throw new Error("#stereo-negotiation dataset.negotiation is empty");
    }
    return JSON.parse(json) as T;
  });
}

// codec 統計を検索する
export function findCodecStats(
  stats: StatsReport,
  mimeType: string,
): Record<string, unknown> | undefined {
  return stats.find((s) => s.type === "codec" && s.mimeType === mimeType);
}

// ビデオ codec 統計を検索する
export function findVideoCodecStats(
  stats: StatsReport,
  codecType: string,
): Record<string, unknown> | undefined {
  return findCodecStats(stats, `video/${codecType}`);
}

// outbound-rtp 統計を検索する
export function findOutboundRtpStats(
  stats: StatsReport,
  kind: string,
): Record<string, unknown> | undefined {
  return stats.find((s) => s.type === "outbound-rtp" && s.kind === kind);
}

// inbound-rtp 統計を検索する
export function findInboundRtpStats(
  stats: StatsReport,
  kind: string,
): Record<string, unknown> | undefined {
  return stats.find((s) => s.type === "inbound-rtp" && s.kind === kind);
}

// RID 付き outbound-rtp 統計を検索する
export function findOutboundRtpStatsByRid(
  stats: StatsReport,
  kind: string,
  rid: string,
): Record<string, unknown> | undefined {
  return stats.find((s) => s.type === "outbound-rtp" && s.kind === kind && s.rid === rid);
}

// data-channel 統計をフィルタする
export function filterDataChannelStats(stats: StatsReport): StatsReport {
  return stats.filter((s) => s.type === "data-channel");
}

// data-channel 統計を検索する
export function findDataChannelStats(
  stats: StatsReport,
  label: string,
  state: string,
): Record<string, unknown> | undefined {
  return stats.find((s) => s.type === "data-channel" && s.label === label && s.state === state);
}

// RPC メソッド一覧を取得する
export async function getRpcMethods(page: Page): Promise<string[]> {
  return page.$eval("#rpc-methods", (el) => {
    const element = el as HTMLElement;
    const json = element.dataset.rpcMethods;
    return JSON.parse(json ?? "[]");
  });
}

// ビデオ解像度を取得する
export async function getVideoResolution(page: Page): Promise<Resolution> {
  return page.$eval("#video-resolution", (el) => {
    const element = el as HTMLElement;
    const height = element.dataset.height;
    const width = element.dataset.width;
    return {
      height: Number(height ?? 0),
      width: Number(width ?? 0),
    };
  });
}

// RPC ログの内容を取得する
export async function getRpcLogContent(page: Page): Promise<string> {
  return page.$eval("#rpc-log", (el) => el.textContent ?? "");
}
