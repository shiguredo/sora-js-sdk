import { defineConfig, devices } from "@playwright/test";

// vp exec playwright test --ui

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
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  webServer: {
    // localhost だと macOS では ::1 で待ち受けてしまい、ページの HTTP 接続の remote IP が
    // ::1 になることで Firefox の既定アドレス検出が IPv6 に向くため、
    // 待ち受けとテスト URL を 127.0.0.1 に固定する
    command: "vp run e2e-dev --host 127.0.0.1 --port 9000",
    reuseExistingServer: !process.env.CI,
    stderr: "pipe",
    stdout: "pipe",
    url: "http://127.0.0.1:9000/",
  },
});
