import { defineConfig } from 'vite';
import { attachMp } from './tools/mp-server.mjs';

// LAN=1 npm run dev  -> other machines on your network can join; default stays local-only
// (read via globalThis: the project has no @types/node and doesn't need it for one flag)
const lan = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.LAN;

export default defineConfig({
  server: { host: lan ? '0.0.0.0' : '127.0.0.1' },
  preview: { host: lan ? '0.0.0.0' : '127.0.0.1' },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  plugins: [
    {
      name: 'the-wall-multiplayer',
      configureServer: (s) => attachMp(s.httpServer),
      configurePreviewServer: (s) => attachMp(s.httpServer),
    },
  ],
});
