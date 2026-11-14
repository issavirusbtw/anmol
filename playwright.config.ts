import { defineConfig } from '@playwright/test';

// BASE_URL=http://127.0.0.1:8080 runs the suite against the production server (npm run build && npm start)
const base = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BASE_URL;

export default defineConfig({
  testDir: 'tests',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: base ?? 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: base
    ? undefined
    : {
        command: 'node node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
