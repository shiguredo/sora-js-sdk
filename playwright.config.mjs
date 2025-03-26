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
      executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
    },
  },
  projects: [
    // Chrome
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },
    {
      name: 'Google Chrome Beta',
      use: { ...devices['Desktop Chrome'], channel: 'chrome-beta' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },
    {
      name: 'Google Chrome Dev',
      use: { ...devices['Desktop Chrome'], channel: 'chrome-dev' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },
    {
      name: 'Google Chrome Canary',
      use: { ...devices['Desktop Chrome'], channel: 'chrome-canary' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },

    // Edge
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },
    {
      name: 'Microsoft Edge Beta',
      use: { ...devices['Desktop Edge'], channel: 'msedge-beta' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },
    {
      name: 'Microsoft Edge Dev',
      use: { ...devices['Desktop Edge'], channel: 'msedge-dev' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
    },
    {
      name: 'Microsoft Edge Canary',
      use: { ...devices['Desktop Edge'], channel: 'msedge-canary' },
      launchOptions: {
        executablePath: process.env.BROWSER_PATH ? process.env.BROWSER_PATH : undefined,
      },
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
