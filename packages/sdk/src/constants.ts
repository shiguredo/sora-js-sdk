// シグナリングトランスポートタイプ
export const TRANSPORT_TYPE_WEBSOCKET = 'websocket' as const
export const TRANSPORT_TYPE_DATACHANNEL = 'datachannel' as const

// シグナリング ROLE
export const SIGNALING_ROLE_SENDRECV = 'sendrecv' as const
export const SIGNALING_ROLE_SENDONLY = 'sendonly' as const
export const SIGNALING_ROLE_RECVONLY = 'recvonly' as const

// WebSocket シグナリングでのみ利用する
export const SIGNALING_MESSAGE_TYPE_CONNECT = 'connect' as const
export const SIGNALING_MESSAGE_TYPE_REDIRECT = 'redirect' as const
export const SIGNALING_MESSAGE_TYPE_OFFER = 'offer' as const
export const SIGNALING_MESSAGE_TYPE_ANSWER = 'answer' as const
export const SIGNALING_MESSAGE_TYPE_CANDIDATE = 'candidate' as const
export const SIGNALING_MESSAGE_TYPE_SWITCHED = 'switched' as const
export const SIGNALING_MESSAGE_TYPE_PING = 'ping' as const
export const SIGNALING_MESSAGE_TYPE_PONG = 'pong' as const

// DataChannel シグナリングでのみ利用する
export const SIGNALING_MESSAGE_TYPE_REQ_STATS = 'req-stats' as const
export const SIGNALING_MESSAGE_TYPE_STATS = 'stats' as const
export const SIGNALING_MESSAGE_TYPE_CLOSE = 'close' as const

// WebSocket と DataChannel シグナリング両方で了する
export const SIGNALING_MESSAGE_TYPE_RE_OFFER = 're-offer' as const
export const SIGNALING_MESSAGE_TYPE_RE_ANSWER = 're-answer' as const
export const SIGNALING_MESSAGE_TYPE_DISCONNECT = 'disconnect' as const
export const SIGNALING_MESSAGE_TYPE_NOTIFY = 'notify' as const
export const SIGNALING_MESSAGE_TYPE_PUSH = 'push' as const

// @deprecated この定数は将来的に削除される予定です
export const SIGNALING_MESSAGE_TYPE_UPDATE = 'update' as const
