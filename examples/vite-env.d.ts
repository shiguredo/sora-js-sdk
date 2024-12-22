/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_SORA_SIGNALING_URL: string
  VITE_SORA_API_URL: string
  VITE_SORA_CHANNEL_ID_PREFIX: string
  VITE_SORA_CHANNEL_ID_SUFFIX: string
  VITE_ACCESS_TOKEN: string

  VITE_SORA_WHIP_ENDPOINT_URL: string
  VITE_SORA_WHEP_ENDPOINT_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
