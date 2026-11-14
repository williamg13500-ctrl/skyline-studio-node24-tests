const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true },
  webServer: {
    command: 'python3 -m http.server 4173 --directory public',
    url: 'http://127.0.0.1:4173/studio.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
