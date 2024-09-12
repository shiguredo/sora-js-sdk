import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import pkg from './package.json'

const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`

export default defineConfig({
  define: {
    __SORA_JS_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  root: process.cwd(),
  build: {
    minify: 'esbuild',
    target: 'es2020',
    emptyOutDir: true,
    manifest: true,
    outDir: resolve(__dirname, 'dist'),
    lib: {
      entry: resolve(__dirname, 'src/sora.ts'),
      name: 'WebRTC SFU Sora JavaScript SDK',
      formats: ['es'],
      fileName: 'sora',
    },
    rollupOptions: {
      output: {
        banner: banner,
      },
    },
  },
  envDir: resolve(__dirname, './'),
  plugins: [
    dts({
      include: ['src/**/*'],
    }),
  ],
})
