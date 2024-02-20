import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname, 'example'),
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'example/index.html'),
        sendrecv: resolve(__dirname, 'example/sendrecv/index.html'),
        sendonly: resolve(__dirname, 'example/sendonly/index.html'),
      },
    },
  },
  envDir: resolve(__dirname, './'),
})
