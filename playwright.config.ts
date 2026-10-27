import { existsSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// vp exec playwright test --ui

// Firefox の H264 は OpenH264 (GMP) のプラグインが必要になる。
// e2e-tests/scripts/install-openh264.sh で .gmp に配置する
const openH264Dir =
  process.env.MOZ_GMP_PATH ?? join(process.cwd(), ".gmp", "gmp-gmpopenh264", "2.6.0");

export default defineConfig({
  testDir: "e2e-tests/tests",
  // 本来は flaky テストをなくすべきだが、一時的に対応
  retries: 3,
  workers: 1,
  // fullyParallel: true,
  reporter: "list",
  use: {
    launchOptions: {
      args: [
        // CORS 無効
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",

        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        // "--use-file-for-fake-video-capture=/app/sample.mjpeg",

        // '--enable-features=WebRtcAllowH265Send,WebRtcAllowH265Receive',
      ],
    },
  },
  projects: [
    // Chromium
    {
      name: "Chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // Chrome
    {
      name: "Google Chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        userAgent: undefined,
      },
    },
    {
      name: "Google Chrome Beta",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome-beta",
        userAgent: undefined,
      },
    },
    {
      name: "Google Chrome Dev",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome-dev",
        userAgent: undefined,
      },
    },
    {
      name: "Google Chrome Canary",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome-canary",
        userAgent: undefined,
      },
    },

    // Edge
    {
      name: "Microsoft Edge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
    {
      name: "Microsoft Edge Beta",
      use: { ...devices["Desktop Edge"], channel: "msedge-beta" },
    },
    {
      name: "Microsoft Edge Dev",
      use: { ...devices["Desktop Edge"], channel: "msedge-dev" },
    },
    {
      name: "Microsoft Edge Canary",
      use: { ...devices["Desktop Edge"], channel: "msedge-canary" },
    },

    {
      name: "WebKit",
      use: { ...devices["Desktop Safari"] },
    },

    // Firefox は e2e-tests/tests/firefox.test.ts でのみ利用する
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          // Firefox の WebRTC は macOS では H264 のハードウェアエンコーダが
          // デフォルトで無効になっているため、テストでは有効にする
          // OpenH264 (GMP) のソフトウェアエンコーダも有効にする
          firefoxUserPrefs: {
            "media.webrtc.hw.h264.enabled": true,
            "media.gmp-gmpopenh264.enabled": true,
          },
          // OpenH264 のプラグインを Firefox に読み込ませる
          ...(existsSync(openH264Dir)
            ? { env: { ...process.env, MOZ_GMP_PATH: openH264Dir } }
            : {}),
        },
      },
    },
  ],
  webServer: {
    command: "vp run e2e-dev --port 9000",
    reuseExistingServer: !process.env.CI,
    stderr: "pipe",
    stdout: "pipe",
    url: "http://localhost:9000/",
  },
});
