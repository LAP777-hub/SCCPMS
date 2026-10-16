import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  workers: 1,
  outputDir: './test-results/playwright',
  use: { baseURL: 'http://127.0.0.1:5178', channel: 'chrome', headless: true, launchOptions: { args: ['--disable-gpu', '--disable-software-rasterizer', '--renderer-process-limit=1'] } },
  webServer: { command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5178 --strictPort', url: 'http://127.0.0.1:5178', reuseExistingServer: !process.env.CI, timeout: 30000 },
  reporter: 'list',
});
