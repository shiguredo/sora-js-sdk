/// <reference types="vitest/config" />

import { resolve } from 'node:path'
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mjs'

export default mergeConfig(viteConfig, defineConfig({
    test: {
      environment: 'jsdom',
  },
}))
