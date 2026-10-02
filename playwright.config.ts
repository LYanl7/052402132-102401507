import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3001',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command:
        process.env.E2E_PRODUCTION === 'true'
          ? 'npm start -w @mayoimon/web'
          : 'npm run dev -w @mayoimon/web -- --port 3001',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        PORT: '3001',
        FRONTEND_ORIGIN: 'http://127.0.0.1:3001',
        DATA_DIR: resolve('data/e2e'),
        COOKIE_SECURE: 'false',
      },
    },
  ],
});
