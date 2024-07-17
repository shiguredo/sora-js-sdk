/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_SORA_SIGNALING_URL: string
  VITE_SORA_CHANNEL_ID_PREFIX: string
  VITE_SORA_CHANNEL_ID_SUFFIX: string
  VITE_ACCESS_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
