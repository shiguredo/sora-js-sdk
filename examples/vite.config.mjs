import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// root が examples なので examples/dist にビルドされる

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: {
      'sora-js-sdk': resolve(__dirname, '../dist/sora.mjs'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        sendrecv: resolve(__dirname, 'sendrecv/index.html'),
        sendonly: resolve(__dirname, 'sendonly/index.html'),
        recvonly: resolve(__dirname, 'recvonly/index.html'),
        check_stereo: resolve(__dirname, 'check_stereo/index.html'),
        check_stereo_multi: resolve(__dirname, 'check_stereo_multi/index.html'),
        replace_track: resolve(__dirname, 'replace_track/index.html'),
        simulcast: resolve(__dirname, 'simulcast/index.html'),
        spotlight_sendrecv: resolve(__dirname, 'spotlight_sendrecv/index.html'),
        messaging: resolve(__dirname, 'messaging/index.html'),
      },
    },
  },
  envDir: resolve(__dirname, '..'),
})
