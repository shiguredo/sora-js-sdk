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
