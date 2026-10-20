import { SignJWT } from "jose";
import type { VideoCodecType } from "sora-js-sdk";

import Sora from "sora-js-sdk";

// access_token に使う JWT の有効期限
const ACCESS_TOKEN_EXPIRATION_TIME = "30s";

// access_token のプライベートクレームで cluster_affinity を false にする
// sora-js-sdk のバージョン
// type redirect に対応していないバージョンは、テストサーバーがクラスター
// アフィニティを有効にしていると接続時に type redirect を受け取っても
// 再接続できない。type redirect 対応は 2021.2.0 で追加されており、
// npm-pkg-e2e-test の matrix では 2021.1.7 のみが該当する。matrix に含まれる
// 古いバージョンは今後増えないため、バージョン比較ではなく列挙で管理する
const CLUSTER_AFFINITY_FALSE_VERSIONS = ["2021.1.7"] as const;

// cluster_affinity を false にして接続する sora-js-sdk のバージョンかどうか
const isClusterAffinityFalseVersion = (version: string): boolean =>
  CLUSTER_AFFINITY_FALSE_VERSIONS.some(
    (clusterAffinityFalseVersion) => clusterAffinityFalseVersion === version,
  );

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
// CLUSTER_AFFINITY_FALSE_VERSIONS に該当する sora-js-sdk では、認証の
// プライベートクレームで cluster_affinity を false にして、クラスターアフィニティ
// による redirect が発生しないようにする。対応しているバージョンでは指定せず、
// テストサーバーの既定 (有効) に任せる。
export const generateAccessToken = async (
  channelId: string,
  secretKey: string,
  privateClaims: Record<string, unknown> = {},
): Promise<string> => {
  const privateClaimsWithClusterAffinity = isClusterAffinityFalseVersion(Sora.version())
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
