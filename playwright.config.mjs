import { defineConfig, devices } from '@playwright/test'

// pnpm exec playwright test --ui

export default defineConfig({
  testDir: 'e2e-tests/tests',
  workers: 1,
  // fullyParallel: true,
  reporter: 'list',
  use: {
    launchOptions: {
      args: [
        // CORS 無効
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',

        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // "--use-file-for-fake-video-capture=/app/sample.mjpeg",

        // '--enable-features=WebRtcAllowH265Send,WebRtcAllowH265Receive',
      ],
    },
  },
  projects: [
    // Chromium
    {
      name: 'Chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Chrome
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'Google Chrome Beta',
      use: { ...devices['Desktop Chrome'], channel: 'chrome-beta' },
    },
    {
      name: 'Google Chrome Dev',
      use: { ...devices['Desktop Chrome'], channel: 'chrome-dev' },
    },
    {
      name: 'Google Chrome Canary',
      use: { ...devices['Desktop Chrome'], channel: 'chrome-canary' },
    },

    // Edge
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Microsoft Edge Beta',
      use: { ...devices['Desktop Edge'], channel: 'msedge-beta' },
    },
    {
      name: 'Microsoft Edge Dev',
      use: { ...devices['Desktop Edge'], channel: 'msedge-dev' },
    },
    {
      name: 'Microsoft Edge Canary',
      use: { ...devices['Desktop Edge'], channel: 'msedge-canary' },
    },

    {
      name: 'WebKit',
      use: { ...devices['Desktop Safari'] },
    },

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],
  webServer: {
    command: 'pnpm run e2e-dev --port 9000',
    url: 'http://localhost:9000/',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
