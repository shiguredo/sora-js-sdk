import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// root が examples なので examples/dist にビルドされる

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    // NPM_PKG_E2E_TEST が true の時は alias を無効化する
    // これは .github/workflows/npm-pkg-e2e-test.yml で、
    // E2E テストで複数のバージョンの npm の sora-js-sdk をインストールして利用するため
    alias: process.env.NPM_PKG_E2E_TEST
      ? {}
      : {
          'sora-js-sdk': resolve(__dirname, '../dist/sora.mjs'),
        },
  },
  envDir: resolve(__dirname, '..'),
})
