import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import dts from "vite-plugin-dts";
import pkg from "./package.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));

const banner = `/**
 * ${pkg.name}
 * ${pkg.description}
 * @version: ${pkg.version}
 * @author: ${pkg.author}
 * @license: ${pkg.license}
 **/
`;
export default defineConfig({
  build: {
    minify: true,
    target: "es2022",
    emptyOutDir: true,
    manifest: false,
    outDir: path.resolve(__dirname, "./dist"),
    lib: {
      entry: path.resolve(__dirname, "src/sora.ts"),
      name: "WebRTC SFU Sora JavaScript SDK",
      formats: ["es"],
      fileName: "sora",
    },
    rolldownOptions: {
      output: {
        banner: banner,
      },
    },
  },
  define: {
    __SORA_JS_SDK_VERSION__: JSON.stringify(pkg.version),
  },
  envDir: path.resolve(__dirname, "./"),
  plugins: [
    dts({
      include: ["src/**/*"],
    }),
  ],
  root: process.cwd(),
  lint: {
    ignorePatterns: ["dist/**"],
    options: {
      typeAware: true,
    },
  },
  fmt: {
    ignorePatterns: ["dist/**", "devtools/dist/**"],
  },
});
