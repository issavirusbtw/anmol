// Regression check: a candy drop pending at save time still lands on the Commons after reload + Continue.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://127.0.0.1:5173/?state=market&test=1&fresh=1');
await page.waitForFunction(() => window.__game && window.__game.simTime > 0.5);
// talk to Odo through the real interaction, choose the option that summons the giant
await page.evaluate(() => {
  const g = window.__game;
  const o = g.pop.byId.get('odo').fig.pos;
  g.player.place(new o.constructor(o.x, 20, o.z + 1.7), Math.PI);
  g.cam.yaw = 0;
});
await page.waitForTimeout(500);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
await page.keyboard.press('Digit1');
await page.waitForTimeout(300);
const before = await page.evaluate(() => { const g = window.__game; return { stage: g.story.stage, phase: g.candy.phase, saved: g.save() }; });
console.log('before reload', JSON.stringify(before));
await page.goto('http://127.0.0.1:5173/');
await page.waitForFunction(() => window.__game);
await page.locator('[data-testid=continue]').click();
await page.waitForFunction(() => window.__game.mode === 'play');
const after = await page.evaluate(() => { const g = window.__game; return { stage: g.story.stage, nextIn: g.candy.nextAt - g.simTime, landing: g.candy.landing.toArray(), district: g.candy.district }; });
console.log('after load', JSON.stringify(after));
await page.waitForFunction(() => window.__game.candy.phase === 'rush', null, { timeout: 60000 });
const rush = await page.evaluate(() => { const g = window.__game; return { core: g.candy.candy.position.toArray().map((v) => +v.toFixed(1)), shards: g.candy.shards.length, rushing: g.pop.npcs.filter((n) => n.mode === 'rush' || n.mode === 'gather').length }; });
console.log('rush', JSON.stringify(rush));
await browser.close();
