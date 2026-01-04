import { defineConfig } from '@playwright/test';

const baseURL = process.env.PW_BASE_URL || 'http://localhost:3201';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // 見た目差分を安定させる
    launchOptions: { args: ['--disable-dev-shm-usage'] },
  },
  reporter: [['list']],
});
