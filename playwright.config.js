// Browser regression tests for index.html (see tests/README.md). Run with: npm test
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // the tests are deterministic: a failure is a real failure
  timeout: 120000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1400, height: 900 },
    trace: 'off',
  },
  projects: [{ name: 'chromium' }],
});
