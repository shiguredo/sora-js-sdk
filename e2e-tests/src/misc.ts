import { SignJWT } from 'jose'
import type { VideoCodecType } from 'sora-js-sdk'

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

export const getChannelId = (): string => {
  const channelIdPrefix = import.meta.env.VITE_TEST_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = import.meta.env.VITE_TEST_CHANNEL_ID_SUFFIX || ''

  const channelNameElement = document.querySelector<HTMLInputElement>('#channel-name')
  const channelName = channelNameElement?.value
  if (channelName === '' || channelName === undefined) {
    throw new Error('channelName is empty')
  }
  return channelIdPrefix + channelName + channelIdSuffix
}

export const getVideoCodecType = (): VideoCodecType | undefined => {
  const videoCodecTypeElement = document.querySelector<HTMLSelectElement>('#video-codec-type')
  const videoCodecType = videoCodecTypeElement?.value
  if (videoCodecType === '') {
    return undefined
  }
  return videoCodecType as VideoCodecType
}
