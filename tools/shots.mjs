// Screenshot + render-cost helper: node tools/shots.mjs <outDir> [name=query ...]
// Each shot boots the game in test mode (a throwaway browser profile, never real saves) and captures after the sim settles.
// "render ms" = 30 back-to-back renders of the full post chain, forced to finish with readPixels: real GPU cost, no vsync cap.
// Env: WALK=<ms> hold W before the shot; CAM='yaw,pitch,dist' to frame a hero shot.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const out = process.argv[2] ?? 'shots/now';
const shots = process.argv.slice(3).length
  ? process.argv.slice(3).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)])
  : [
      ['depths', 'state=lower'],
      ['market', 'state=market'],
      ['sump', 'state=sump'],
    ];
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, q] of shots) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  // BEGIN needs the real title screen, which test mode skips (fresh=1 still throws away this profile's save)
  await page.goto(`http://127.0.0.1:5173/?fresh=1${process.env.BEGIN ? '' : '&test=1'}&${q}`);
  // the title screen doesn't advance simTime, so there just wait for the game to exist and draw a few frames
  await page.waitForFunction((title) => window.__game && (title || window.__game.simTime > 2.5), !!process.env.BEGIN, { timeout: 60000 });
  if (process.env.BEGIN) await page.waitForTimeout(3000);
  await page.locator('#view').focus();
  // BEGIN=<ms>: press Begin on the title screen and shoot Chapter Zero that long in
  if (process.env.BEGIN && process.env.BEGIN !== '0') {
    await page.locator('[data-testid=begin]').click();
    await page.waitForTimeout(Number(process.env.BEGIN));
  }
  if (process.env.CAM) {
    await page.evaluate((c) => {
      const [yaw, pitch, dist] = c.split(',').map(Number);
      const g = window.__game;
      Object.assign(g.cam, { yaw, pitch, dist });
    }, process.env.CAM);
  }
  if (process.env.WALK) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(Number(process.env.WALK));
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png` });
  const stats = await page.evaluate(() => {
    const g = window.__game;
    const gl = g.renderer.gl.getContext();
    const px = new Uint8Array(4);
    g.renderer.composer.render(0.016);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) g.renderer.composer.render(0.016);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / 30;
    return `render ${ms.toFixed(1)} ms · ${g.renderer.gl.info.render.calls} calls · ${(g.renderer.gl.info.render.triangles / 1000).toFixed(0)}k tris (accumulated)`;
  });
  console.log(name, stats);
  await page.close();
}
await browser.close();
