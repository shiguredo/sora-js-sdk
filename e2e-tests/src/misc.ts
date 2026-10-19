import { SignJWT } from "jose";
import type { VideoCodecType } from "sora-js-sdk";

import Sora from "sora-js-sdk";

// access_token に使う JWT の有効期限
const ACCESS_TOKEN_EXPIRATION_TIME = "30s";

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
export const generateAccessToken = async (
  channelId: string,
  secretKey: string,
  privateClaims: Record<string, unknown> = {},
): Promise<string> => {
  return generateJwt(channelId, secretKey, privateClaims);
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
