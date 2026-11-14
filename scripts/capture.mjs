// Batch capture of review views. node scripts/capture.mjs <outDir> [only]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const outDir = process.argv[2] ?? 'shots/review';
const only = process.argv[3];
fs.mkdirSync(outDir, { recursive: true });

// [name, query, waitMs, js to place camera/player (optional)]
const views = [
  ['01-overview', '?view=wide&t=4', 4000],
  ['02-market-view', '?view=market&t=6', 4000],
  ['03-candy-hand', '?view=market&event=candy&t=7.2', 4000],
  ['04-candy-fall', '?view=market&event=candy&t=9.1', 4000],
  ['05-candy-aftermath', '?view=market&event=candy&t=16', 4000],
  ['06-depths-player', '?state=lower&test=1&t=3', 3000, 'g.cam.yaw = Math.PI * 0.75; g.cam.pitch = 0.18; g.cam.dist = 5.5;'],
  ['07-market-player', '?state=market&test=1&t=5', 3000, "g.player.place(new g.player.body.pos.constructor(4, 20, 3), 0); g.cam.yaw = 0.35; g.cam.pitch = 0.12; g.cam.dist = 5;"],
  ['08-material-close', '?state=lower&test=1&t=2', 3000, "g.player.place(new g.player.body.pos.constructor(5.6, 0, -2.6), 0); g.cam.yaw = 0.2; g.cam.pitch = 0.05; g.cam.dist = 2.4;"],
  ['09-home-interior', '?state=market&test=1&t=1', 3000, "g.place('depths'); g.player.place(new g.player.body.pos.constructor(-7.6, 0, -6.2), Math.PI); g.cam.yaw = 0.1; g.cam.pitch = 0.25; g.cam.dist = 3.2;"],
  ['10-checkpoint', '?state=market&test=1&t=2', 3000, "g.player.place(new g.player.body.pos.constructor(-16.5, 20, 9.5), Math.PI); g.cam.yaw = 0.3; g.cam.pitch = 0.2; g.cam.dist = 6;"],
  ['11-heights', '?state=upper&test=1&t=3', 3000, 'g.cam.yaw = Math.PI * 0.85; g.cam.pitch = 0.25; g.cam.dist = 7;'],
  ['12-heights-view-down', '?state=upper&test=1&t=2', 3000, "g.player.place(new g.player.body.pos.constructor(-9, 42, 11.6), 0); g.cam.yaw = Math.PI - 0.5; g.cam.pitch = 0.75; g.cam.dist = 6;"],
];

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
for (const [name, q, wait, js] of views) {
  if (only && !name.includes(only)) continue;
  await page.goto(`http://127.0.0.1:5173/${q}${q.includes('?') ? '&' : '?'}fresh=1`);
  await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
  if (js) {
    await page.evaluate(`(() => { const g = window.__game; g.frozen = false; ${js}; g.cam.snap(g.focusPoint()); setTimeout(() => (g.frozen = true), 400); })()`);
  }
  await page.waitForTimeout(wait);
  const info = await page.evaluate(() => {
    const g = window.__game;
    return { fps: g.renderer.fps.toFixed(0), calls: g.renderer.gl.info.render.calls, tris: g.renderer.gl.info.render.triangles };
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, JSON.stringify(info));
}
await browser.close();
