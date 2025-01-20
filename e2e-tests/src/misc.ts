import { SignJWT } from 'jose'

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

export const generateChannelId = (): string => {
  // qs を確認する
  const urlParams = new URLSearchParams(window.location.search)
  const qsChannelId = urlParams.get('channelId') || ''
  const qsChannelIdPrefix = urlParams.get('channelIdPrefix') || ''
  const qsChannelIdSuffix = urlParams.get('channelIdSuffix') || ''

  // qs が指定されていればその値を優先するようにする
  const channelId = qsChannelId || import.meta.env.VITE_SORA_CHANNEL_ID || ''
  const channelIdPrefix = qsChannelIdPrefix || import.meta.env.VITE_SORA_CHANNEL_ID_PREFIX || ''
  const channelIdSuffix = qsChannelIdSuffix || import.meta.env.VITE_SORA_CHANNEL_ID_SUFFIX || ''

  // 環境変数の channelId が指定されていない場合はエラー
  if (!channelId) {
    throw new Error('VITE_SORA_CHANNEL_ID is not set')
  }

  // channelIdPrefix と channelIdSuffix が指定されている場合はそれを利用する
  if (channelIdPrefix && channelIdSuffix) {
    return `${channelIdPrefix}${channelId}${channelIdSuffix}`
  }

  // channelIdPrefix が指定されている場合はそれを利用する
  if (channelIdPrefix) {
    return `${channelIdPrefix}${channelId}`
  }

  // channelIdSuffix が指定されている場合はそれを利用する
  if (channelIdSuffix) {
    return `${channelId}${channelIdSuffix}`
  }

  return channelId
}
