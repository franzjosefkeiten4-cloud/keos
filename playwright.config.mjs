import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60000,
    expect: { timeout: 10000 },
    fullyParallel: false,
    retries: 0,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:4173',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node scripts/test-static-server.mjs',
        port: 4173,
        reuseExistingServer: true,
        timeout: 120000
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
