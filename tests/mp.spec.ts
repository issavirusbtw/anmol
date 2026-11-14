// Multiplayer: two isolated browser contexts join the same private room on the dev server's /mp endpoint.
// Each context has its own storage, so no real save is touched.
import { test, expect, Page, Browser } from '@playwright/test';

const G = (page: Page, fn: string) => page.evaluate(`(() => { const g = window.__game; return ${fn}; })()`) as Promise<any>;

async function join(browser: Browser, room: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?fresh=1&test=1&state=sump&mp=1&room=${room}`);
  await page.waitForFunction(() => (window as any).__game?.simTime > 1, null, { timeout: 60_000 });
  return { ctx, page, errors };
}

test('two players share a room, fight, and the knocked-down pack can be looted once', async ({ browser }) => {
  test.setTimeout(120_000);
  const room = `t${Date.now()}`;
  const a = await join(browser, room);
  const b = await join(browser, room);
  // each sees the other, positioned and tagged
  await a.page.waitForFunction(() => [...(window as any).__game.net.remotes.values()].some((r: any) => r.fig.visible), null, { timeout: 15_000 });
  await b.page.waitForFunction(() => [...(window as any).__game.net.remotes.values()].some((r: any) => r.fig.visible), null, { timeout: 15_000 });
  expect(await G(a.page, 'g.net.remotes.size')).toBe(1);

  // stand B a step in front of A; A faces B
  const pa = await G(a.page, '({ x: g.player.body.pos.x, y: g.player.body.pos.y, z: g.player.body.pos.z })');
  await G(b.page, `(g.player.place(new g.player.body.pos.constructor(${pa.x}, ${pa.y + 0.2}, ${pa.z + 1.2}), 0), g.state.health = 100, g.state.add('scrap', 4), g.state.count('scrap'))`);
  await a.page.waitForFunction(() => {
    const g = (window as any).__game;
    const r = [...g.net.remotes.values()][0];
    // both spawn on the same spot, so wait for B to have actually arrived a step ahead
    const d = r && r.fig.pos.distanceTo(g.player.body.pos);
    return d > 1.0 && d < 1.5;
  }, null, { timeout: 10_000 });
  const scrapBefore = await G(b.page, "g.state.count('scrap')");

  // an unarmed shove lands and the server forwards it: B loses health
  await G(a.page, '(g.state.weapons.pick = false, g.player.fig.yaw = 0, g.underfall.jab())');
  await b.page.waitForFunction(() => (window as any).__game.state.health < 100, null, { timeout: 5_000 });
  const hpAfter = await G(b.page, 'g.state.health');
  expect(hpAfter).toBeGreaterThanOrEqual(90); // unarmed: 6 damage, not the pick's 12

  // knock B down: half of each stack spills as a synced bag that both players see
  await G(b.page, 'g.state.health = 3');
  await a.page.waitForTimeout(400); // jab cooldown
  await G(a.page, '(g.player.fig.yaw = 0, g.underfall.jab())');
  await b.page.waitForFunction(() => (window as any).__game.state.health <= 0 || (window as any).__game.state.deaths > 0, null, { timeout: 5_000 });
  expect(await G(b.page, "g.state.count('scrap')")).toBe(scrapBefore - Math.ceil(scrapBefore / 2));
  await a.page.waitForFunction(() => (window as any).__game.underfall.pickups.some((p: any) => p.netBag !== undefined && !p.taken), null, { timeout: 5_000 });
  await b.page.waitForFunction(() => (window as any).__game.underfall.pickups.some((p: any) => p.netBag !== undefined && !p.taken), null, { timeout: 5_000 });

  // B is protected for a few seconds after going down: another hit is ignored
  const hpDown = await G(b.page, 'g.state.health');
  await a.page.waitForTimeout(400);
  await G(a.page, '(g.player.fig.yaw = 0, g.underfall.jab())');
  await b.page.waitForTimeout(600);
  expect(await G(b.page, 'g.state.health')).toBeGreaterThanOrEqual(hpDown);

  // A claims the bag: A gains the scrap, the bag disappears for B too, and a second claim gets nothing
  const aScrap = await G(a.page, "g.state.count('scrap')");
  const id = await G(a.page, "g.underfall.pickups.find((p) => p.netBag !== undefined && !p.taken).id");
  await G(a.page, `(g.player.place(g.underfall.pickups.find((p) => p.id === ${id}).pos.clone(), 0), g.underfall.pickUp(${id}))`);
  await a.page.waitForFunction((n) => (window as any).__game.state.count('scrap') > n, aScrap, { timeout: 5_000 });
  await b.page.waitForFunction(() => !(window as any).__game.underfall.pickups.some((p: any) => p.netBag !== undefined && !p.taken), null, { timeout: 5_000 });

  // leaving removes the remote figure and its name tag
  await b.ctx.close();
  await a.page.waitForFunction(() => (window as any).__game.net.remotes.size === 0, null, { timeout: 5_000 });
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
  await a.ctx.close();
});

test('without a multiplayer server the game stays single-player with no errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // test mode without mp=1 never connects; the game must not depend on the socket
  await page.goto('/?fresh=1&test=1&state=sump');
  await page.waitForFunction(() => (window as any).__game?.simTime > 2);
  expect(await G(page, 'g.net.remotes.size')).toBe(0);
  expect(await G(page, 'g.net.active')).toBe(false);
  expect(errors).toEqual([]);
});
