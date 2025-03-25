import { defineConfig, devices } from '@playwright/test'

// pnpm exec playwright test --ui

export default defineConfig({
  testDir: 'e2e-tests/tests',
  // fullyParallel: true,
  reporter: 'html',
  use: {
    launchOptions: {
      args: [
        // CORS 無効
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',

        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        // "--use-file-for-fake-video-capture=/app/sample.mjpeg",

        '--enable-features=WebRtcAllowH265Send,WebRtcAllowH265Receive',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
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

    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
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
