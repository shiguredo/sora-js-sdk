/// <reference types="vite/client" />

interface ImportMetaEnv {
  VITE_TEST_SIGNALING_URL: string
  VITE_TEST_API_URL: string
  VITE_TEST_CHANNEL_ID_PREFIX: string
  VITE_TEST_CHANNEL_ID_SUFFIX: string
  VITE_TEST_SECRET_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
