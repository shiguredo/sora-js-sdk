import { SignJWT } from "jose";
import type { VideoCodecType } from "sora-js-sdk";

import Sora from "sora-js-sdk";

// access_token に使う JWT の有効期限
const ACCESS_TOKEN_EXPIRATION_TIME = "30s";

// type redirect に対応した sora-js-sdk の最初のバージョン
// これより前のバージョンは、テストサーバーがクラスターアフィニティを有効に
// していると接続時に type redirect を受け取っても再接続できない
const TYPE_REDIRECT_SUPPORTED_VERSION = "2021.2.0";

// sora-js-sdk のバージョン文字列の先頭 3 つの数値 (年.リリース番号.パッチ) を取り出す
// 例: "2021.1.7", "2026.2.0-canary.0"
const SDK_VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/u;

// sora-js-sdk のバージョン文字列を比較用の数値の三つ組に変換する
// 解析できない場合は null を返す
const parseSdkVersion = (version: string): [number, number, number] | null => {
  const versionMatch = SDK_VERSION_PATTERN.exec(version);
  if (versionMatch === null) {
    return null;
  }
  const majorVersion = versionMatch[1];
  const minorVersion = versionMatch[2];
  const patchVersion = versionMatch[3];
  if (majorVersion === undefined || minorVersion === undefined || patchVersion === undefined) {
    return null;
  }
  return [Number(majorVersion), Number(minorVersion), Number(patchVersion)];
};

// バージョン文字列が比較対象のバージョンより古いかどうか
// sora-js-sdk は CalVer (YYYY.リリース番号.パッチ) のため、年 -> リリース番号 -> パッチの
// 順に比較する
const isVersionOlderThan = (version: string, comparisonVersion: string): boolean => {
  const parsedVersion = parseSdkVersion(version);
  if (parsedVersion === null) {
    throw new Error(`Failed to parse sora-js-sdk version: ${version}`);
  }
  const parsedComparisonVersion = parseSdkVersion(comparisonVersion);
  if (parsedComparisonVersion === null) {
    throw new Error(`Failed to parse comparison sora-js-sdk version: ${comparisonVersion}`);
  }
  const [majorVersion, minorVersion, patchVersion] = parsedVersion;
  const [comparisonMajorVersion, comparisonMinorVersion, comparisonPatchVersion] =
    parsedComparisonVersion;
  if (majorVersion !== comparisonMajorVersion) {
    return majorVersion < comparisonMajorVersion;
  }
  if (minorVersion !== comparisonMinorVersion) {
    return minorVersion < comparisonMinorVersion;
  }
  return patchVersion < comparisonPatchVersion;
};

// type redirect に対応していない sora-js-sdk かどうか
const isTypeRedirectUnsupportedVersion = (): boolean =>
  isVersionOlderThan(Sora.version(), TYPE_REDIRECT_SUPPORTED_VERSION);

const generateJwt = async (
  channelId: string,
  secretKey: string,
  privateClaims: Record<string, unknown> = {},
): Promise<string> => {
  console.log("privateClaims:", privateClaims);
  const payload = {
    channel_id: channelId,
    ...privateClaims,
  };
  console.log("payload:", payload);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(ACCESS_TOKEN_EXPIRATION_TIME)
    .sign(new TextEncoder().encode(secretKey));
};

// access_token はテストサーバーが JWT として検証し、プライベートクレームを
// 認証ウェブフックの払い出しとして扱う。そのため fixture はシークレットキーを
// そのまま access_token に指定せず、このヘルパで JWT を生成して指定する。
// JWT の有効期限は ACCESS_TOKEN_EXPIRATION_TIME (30 秒) なので、
// 接続の直前に呼ぶこと。
//
// type redirect に対応していない sora-js-sdk では、テストサーバーがクラスター
// アフィニティを有効にしていると接続時に type redirect が返り、再接続できずに
// 接続に失敗する。そのため、そのようなバージョンでは認証のプライベートクレームで
// cluster_affinity を false にして redirect 自体が発生しないようにする。
// 対応しているバージョンでは指定せず、テストサーバーの既定 (有効) に任せる。
export const generateAccessToken = async (
  channelId: string,
  secretKey: string,
  privateClaims: Record<string, unknown> = {},
): Promise<string> => {
  const privateClaimsWithClusterAffinity = isTypeRedirectUnsupportedVersion()
    ? { cluster_affinity: false, ...privateClaims }
    : privateClaims;
  return generateJwt(channelId, secretKey, privateClaimsWithClusterAffinity);
};

export const setSoraJsSdkVersion = (id = "sora-js-sdk-version"): void => {
  const sdkVersionElement = document.querySelector<HTMLDivElement>(`#${id}`);
  if (sdkVersionElement) {
    sdkVersionElement.textContent = Sora.version();
  }
};

export const getChannelId = (
  channelIdPrefix: string,
  channelIdSuffix: string,
  id = "channel-name",
): string => {
  const channelNameElement = document.querySelector<HTMLInputElement>(`#${id}`);
  const channelName = channelNameElement?.value;
  if (channelName === "" || channelName === undefined) {
    throw new Error("channelName is empty");
  }
  return `${channelIdPrefix}${channelName}${channelIdSuffix}`;
};

export const getVideoCodecType = (id = "video-codec-type"): VideoCodecType | undefined => {
  const videoCodecTypeElement = document.querySelector<HTMLSelectElement>(`#${id}`);
  const videoCodecType = videoCodecTypeElement?.value;
  if (videoCodecType === "") {
    return undefined;
  }
  return videoCodecType as VideoCodecType;
};
