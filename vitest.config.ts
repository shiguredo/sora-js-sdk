import { defineConfig, mergeConfig } from "vite-plus/test/config";
import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      include: ["tests/**/*.ts"],
    },
  }),
);
