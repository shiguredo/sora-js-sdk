import { defineConfig } from 'vitest/config'
import pkg from '../../package.json'

export default defineConfig({
  define: {
    __SORA_JS_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
  },
})
