import { SignJWT } from 'jose'
import type { VideoCodecType } from 'sora-js-sdk'

import Sora from 'sora-js-sdk'

export const generateJwt = async (
  channelId: string,
  secretKey: string,
  privateClaims: Record<string, unknown> = {},
): Promise<string> => {
  console.log('privateClaims:', privateClaims)
  const payload = {
    channel_id: channelId,
    ...privateClaims,
  }
  console.log('payload:', payload)
  return (
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      // 30 秒後に有効期限切れ
      .setExpirationTime('30s')
      .sign(new TextEncoder().encode(secretKey))
  )
}

export const setSdkVersion = (id = 'sdk-version'): void => {
  const sdkVersionElement = document.querySelector<HTMLDivElement>(`#${id}`)
  if (sdkVersionElement) {
    sdkVersionElement.textContent = `${Sora.version()}`
  }
}

export const getChannelId = (
  channelIdPrefix: string,
  channelIdSuffix: string,
  id = 'channel-name',
): string => {
  const channelNameElement = document.querySelector<HTMLInputElement>(`#${id}`)
  const channelName = channelNameElement?.value
  if (channelName === '' || channelName === undefined) {
    throw new Error('channelName is empty')
  }
  return `${channelIdPrefix}${channelName}${channelIdSuffix}`
}

export const getVideoCodecType = (id = 'video-codec-type'): VideoCodecType => {
  const videoCodecTypeElement = document.querySelector<HTMLSelectElement>(`#${id}`)
  const videoCodecType = videoCodecTypeElement?.value
  if (videoCodecType === '') {
    throw new Error('videoCodecType is empty')
  }
  return videoCodecType as VideoCodecType
}
