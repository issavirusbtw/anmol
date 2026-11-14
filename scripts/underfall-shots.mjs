// Screenshots of the Underfall content: a hopper encounter, a Fall with Tallymen, the upgraded home.
import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
const go = async (q) => {
  await page.goto(`http://127.0.0.1:5173/?fresh=1&test=1&${q}`);
  await page.waitForFunction(() => window.__game && window.__game.simTime > 1);
};
// 1. a Dust Hopper rearing to lunge
await go('state=sump&kit=1');
await page.evaluate(() => {
  const g = window.__game;
  const s = g.underfall.spiders[0].body.pos;
  g.player.place(new s.constructor(s.x + 5, 0, s.z + 1.5), -Math.PI / 2);
  g.cam.yaw = Math.PI / 2 - 0.25;
  g.cam.pitch = 0.18;
  g.cam.dist = 4.5;
});
await page.waitForTimeout(2200);
await page.screenshot({ path: 'shots/final/20-hopper.png' });
// 2. a Fall: Tallymen racing for the pickups
await go('state=sump&kit=1&event=fall');
await page.evaluate(() => {
  const g = window.__game;
  g.player.place(new g.player.body.pos.constructor(-31, 0, 9), -Math.PI / 2);
  g.cam.yaw = Math.PI / 2 + 0.35;
  g.cam.pitch = 0.3;
  g.cam.dist = 6;
});
await page.waitForTimeout(7000);
await page.screenshot({ path: 'shots/final/21-fall-tallymen.png' });
// 3. the matchbox with all four upgrades
await go('state=market');
await page.evaluate(() => {
  const g = window.__game;
  g.state.homeTier = 4;
  g.applyHomeVisuals();
  g.place('depths');
  g.player.place(new g.player.body.pos.constructor(-7.2, 0, -5.6), Math.PI);
  g.cam.yaw = 0.15;
  g.cam.pitch = 0.3;
  g.cam.dist = 3.6;
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/final/22-home-upgraded.png' });
await browser.close();
console.log('saved');
