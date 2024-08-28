import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// root が examples なので examples/dist にビルドされる

export default defineConfig({
  root: resolve(__dirname, 'examples'),
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'examples/index.html'),
        sendrecv: resolve(__dirname, 'examples/sendrecv/index.html'),
        sendonly: resolve(__dirname, 'examples/sendonly/index.html'),
        recvonly: resolve(__dirname, 'examples/recvonly/index.html'),
        simulcast: resolve(__dirname, 'examples/simulcast/index.html'),
        spotlight_sendrecv: resolve(__dirname, 'examples/spotlight_sendrecv/index.html'),
        spotlight_sendonly: resolve(__dirname, 'examples/spotlight_sendonly/index.html'),
        spotlight_recvonly: resolve(__dirname, 'examples/spotlight_recvonly/index.html'),
        messaging: resolve(__dirname, 'examples/messaging/index.html'),
      },
    },
  },
  envDir: resolve(__dirname, './'),
})
