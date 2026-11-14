// Chapter Zero: the arrival, naming, starting pockets, the collectors, Patch and the five tutorial missions.
// Every Playwright test gets its own browser context, so localStorage here is isolated from real player saves.
import { test, expect, Page } from '@playwright/test';

const G = (page: Page, fn: string) => page.evaluate(`(() => { const g = window.__game; return ${fn}; })()`) as Promise<any>;

async function simWait(page: Page, s: number) {
  const t0 = await G(page, 'g.simTime');
  await page.waitForFunction((t) => (window as any).__game.simTime >= t, t0 + s, { timeout: 120_000 });
}

/** Start a brand-new game from the title and skip the cinematic. */
async function newGame(page: Page, query = '') {
  await page.goto(`/?fresh=1${query}`);
  await page.waitForFunction(() => (window as any).__game);
  await page.locator('[data-testid=begin]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'intro');
}

async function skipAndName(page: Page, name: string) {
  await page.locator('[data-testid=skip-intro]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'play');
  await expect(page.locator('[data-testid=name-input]')).toBeVisible();
  await page.locator('[data-testid=name-input]').fill(name);
  await page.locator('[data-testid=name-ok]').click();
  await expect(page.locator('[data-testid=name-input]')).toHaveCount(0);
}

/** Put the player beside a hotspot and press a key (set-up teleport; the outcome comes from the real interaction). */
async function useHotspot(page: Page, id: string, key = 'KeyE') {
  await page.evaluate((id) => {
    const g = (window as any).__game;
    const h = g.wd.hotspots.get(id);
    g.player.place(h.pos.clone().setY(h.pos.y), g.player.fig.yaw);
  }, id);
  await simWait(page, 0.3);
  await page.keyboard.press(key);
  await simWait(page, 0.3);
}

async function closeModals(page: Page) {
  while (await page.locator('.modal.open').count()) await page.keyboard.press('Escape');
}

const pocketsFor = (page: Page, seed: number) =>
  page.evaluate(async (seed) => (await import('/src/systems/state.ts' as any)).rollPossessions(seed), seed) as Promise<string[]>;

test('arrival: the cinematic plays, skips cleanly, and the name is stored safely', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newGame(page, '&pockets=7');
  // the cinematic actually runs on its own: scene A, the palm, the fall
  await page.waitForFunction(() => (window as any).__game.arrival?.t > 1.5, null, { timeout: 30_000 });
  expect(await G(page, 'g.state.health')).toBeGreaterThan(0);
  const hunger0 = await G(page, 'g.state.hunger');
  await page.waitForTimeout(1500);
  expect(await G(page, 'g.state.hunger')).toBe(hunger0); // survival is paused during the scene
  await skipAndName(page, '<img src=x onerror=alert(1)> Ada');
  const name = await G(page, 'g.onboarding.name');
  expect(name).not.toMatch(/[<>=()]/);
  expect(name.length).toBeLessThanOrEqual(16);
  expect(await G(page, 'g.onboarding.step')).toBe('explore');
  // skip cleaned up the set: no room, no giant hand, no fade, normal fov, the player is in the basin
  expect(await page.locator('.arrival-fade, .arrival-skip').count()).toBe(0);
  expect(await G(page, 'g.renderer.camera.fov')).toBe(58); // PLAY_FOV
  const p = await G(page, 'g.player.body.pos.clone()');
  expect(Math.hypot(p.x + 30.4, p.z - 8.2)).toBeLessThan(1.5);
  // the pockets match the seed exactly
  const expected = await pocketsFor(page, 7);
  for (const it of expected) expect(await G(page, `g.state.count('${it}')`)).toBe(1);
  // the objective panel shows the onboarding objective
  await expect(page.locator('.objective')).toContainText('Get your bearings');
  expect(errors).toEqual([]);
});

test('arrival: an empty name becomes the default', async ({ page }) => {
  await newGame(page);
  await skipAndName(page, '   ');
  expect(await G(page, 'g.onboarding.name')).toBe('Newcomer');
});

test('pockets: deterministic, small, no duplicates, empty hands possible, phone rare', async ({ page }) => {
  await page.goto('/?fresh=1');
  await page.waitForFunction(() => (window as any).__game);
  const r = await page.evaluate(async () => {
    const { rollPossessions } = await import('/src/systems/state.ts' as any);
    let empty = 0, phone = 0, maxN = 0, dupes = 0, unstable = 0;
    for (let s = 0; s < 4000; s++) {
      const a = rollPossessions(s), b = rollPossessions(s);
      if (JSON.stringify(a) !== JSON.stringify(b)) unstable++;
      if (new Set(a).size !== a.length) dupes++;
      if (!a.length) empty++;
      if (a.includes('phone')) phone++;
      maxN = Math.max(maxN, a.length);
    }
    return { empty, phone, maxN, dupes, unstable };
  });
  expect(r.unstable).toBe(0);
  expect(r.dupes).toBe(0);
  expect(r.maxN).toBeLessThanOrEqual(3);
  expect(r.empty).toBeGreaterThan(300); // about 15%
  expect(r.phone).toBeLessThan(160); // very rare
});

test('tutorial: an empty-handed newcomer is chased, rescued by Patch and finishes all five missions', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?fresh=1');
  await page.waitForFunction(() => (window as any).__game);
  const seed = await page.evaluate(async () => {
    const { rollPossessions } = await import('/src/systems/state.ts' as any);
    for (let s = 0; ; s++) if (!rollPossessions(s).length) return s;
  });
  await newGame(page, `&pockets=${seed}`);
  await skipAndName(page, 'Wren');
  expect(await G(page, 'Object.values(g.state.inv).reduce((a, b) => a + b, 0)')).toBe(0);
  // the collectors come after active play; menus pause the clock
  await page.keyboard.press('KeyI');
  const t0 = await G(page, 'g.onboarding.t');
  await page.waitForTimeout(1500);
  expect(await G(page, 'g.onboarding.t')).toBe(t0);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'chase', null, { timeout: 60_000 });
  await expect(page.locator('.objective')).toContainText('The collectors are closing in');
  const tallymenHidden = await G(page, 'g.underfall.tallymen.every(t => !t.fig.visible)');
  expect(tallymenHidden).toBe(true); // no other enemy interferes
  // run for the gate (the readable escape): Patch steps in
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'rescue', null, { timeout: 40_000 });
  expect(await G(page, "g.pop.byId.get('patch').fig.visible")).toBe(true);
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'follow', null, { timeout: 30_000 });
  expect(await G(page, 'g.state.health')).toBeGreaterThan(50); // nobody hurt the newcomer
  expect(await G(page, 'Object.values(g.state.inv).reduce((a, b) => a + b, 0)')).toBe(0); // nothing confiscated
  // Mission 1-2: keep up with Patch (set-up: stand near him each leg, he does the walking and waiting)
  for (let i = 0; i < 80; i++) {
    const s = await G(page, 'g.onboarding.step');
    if (s !== 'follow') break;
    await page.evaluate(() => {
      const g = (window as any).__game;
      const p = g.pop.byId.get('patch').fig.pos;
      g.player.place(p.clone().add(new p.constructor(0.8, 0, 0.8)), g.player.fig.yaw);
    });
    await simWait(page, 1.5);
  }
  expect(await G(page, 'g.onboarding.step')).toBe('meal');
  expect(await G(page, "g.onboarding.done.has('gateShut')")).toBe(true);
  // Mission 3: a free meal at the Common Table and a cap of water
  await expect(page.locator('.objective')).toContainText('Mission 3/5');
  await useHotspot(page, 'kitchen-depths');
  await useHotspot(page, 'water-depths');
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'home', null, { timeout: 10_000 });
  // Mission 4: find the matchbox, dig for scrap and fabric, repair, sleep
  await page.evaluate(() => { const g = (window as any).__game; g.player.place(g.wd.hotspots.get('bed-player').pos.clone(), 0); });
  await simWait(page, 0.8);
  for (let i = 0; i < 12 && !(await G(page, "g.state.count('scrap') >= 3 && g.state.count('fabric') >= 1")); i++) {
    const heap = await G(page, `[...g.wd.hotspots.values()].filter(h => h.kind === 'scavenge' && h.enabled && !(g.state.heapReady[h.id] > g.simTime))[0]?.id`);
    if (!heap) break;
    await useHotspot(page, heap);
  }
  await useHotspot(page, 'bed-player'); // repair
  expect(await G(page, 'g.state.homeRepaired')).toBe(true);
  await closeModals(page);
  await useHotspot(page, 'bed-player'); // sleep
  await closeModals(page);
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'first', null, { timeout: 15_000 });
  // Mission 5: dig, then make something at the bench
  if (!(await G(page, "g.state.count('scrap') > 0"))) {
    const heap = await G(page, `[...g.wd.hotspots.values()].filter(h => h.kind === 'scavenge' && h.enabled && !(g.state.heapReady[h.id] > g.simTime))[0]?.id`);
    await useHotspot(page, heap);
  }
  await useHotspot(page, 'craft-depths');
  await page.locator('[data-testid=craft-grit]').click();
  expect(await G(page, "g.onboarding.done.has('crafted')")).toBe(true);
  // missions only advance with no panel open (menus pause the tutorial clock)
  await closeModals(page);
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'done', null, { timeout: 10_000 });
  // afterwards: the normal chapter objective returns, and Patch is still someone to talk to
  expect(await G(page, 'g.onboarding.active')).toBe(false);
  expect(await G(page, "g.pop.byId.get('duke').fig.visible")).toBe(true);
  const node = await G(page, 'g.onboarding.talk().text');
  expect(node).toContain('Wren');
});

test('save/load mid-onboarding resumes safely and never grants pockets twice', async ({ page }) => {
  await newGame(page, '&pockets=11');
  await skipAndName(page, 'Ash');
  const inv0 = await G(page, 'JSON.stringify(g.state.inv)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shelflife.save')!).onboard.step)).toBe('explore');
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game);
  await page.locator('[data-testid=continue]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'play');
  expect(await G(page, 'g.onboarding.step')).toBe('explore');
  expect(await G(page, 'g.onboarding.name')).toBe('Ash');
  expect(await G(page, 'JSON.stringify(g.state.inv)')).toBe(inv0);
  expect(await G(page, 'g.mode')).toBe('play'); // no replay of the intro
  // a save taken during the chase resumes just before it, with the collectors gone
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.onboarding.t = 100;
  });
  await page.waitForFunction(() => (window as any).__game.onboarding.step === 'chase', null, { timeout: 20_000 });
  await page.evaluate(() => (window as any).__game.save());
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game);
  await page.locator('[data-testid=continue]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'play');
  expect(await G(page, 'g.onboarding.step')).toBe('explore');
  expect(await G(page, 'JSON.stringify(g.state.inv)')).toBe(inv0);
});

test('an old save without onboarding loads straight into play with no intro and no new items', async ({ page }) => {
  // make a save the pre-update way (test mode never starts onboarding), then strip the new field
  await page.goto('/?fresh=1&test=1&state=lower');
  await page.waitForFunction(() => (window as any).__game?.simTime > 0.5);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.state.add('scrap', 2, true);
    const d = g.serialize();
    delete d.onboard;
    localStorage.setItem('shelflife.save', JSON.stringify(d));
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game);
  await page.locator('[data-testid=continue]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'play');
  expect(await G(page, 'g.onboarding.step')).toBe('done');
  expect(await G(page, "g.state.count('scrap')")).toBe(2);
  expect(await G(page, "['key','coin','lighter','bandage','button','clip','watch','phone'].every(i => g.state.count(i) === 0)")).toBe(true);
  expect(await page.locator('[data-testid=name-input]').count()).toBe(0);
  expect(await G(page, "g.pop.byId.get('duke').fig.visible")).toBe(true);
});

test('a malformed save does not crash and is kept, not silently deleted', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh=1');
  await page.waitForFunction(() => (window as any).__game);
  const bad = JSON.stringify({ version: 1, time: 3, player: { x: 'oops' }, stats: null });
  await page.evaluate((bad) => localStorage.setItem('shelflife.save', bad), bad);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game);
  await page.locator('[data-testid=continue]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'intro'); // falls back to a new arrival
  expect(await page.evaluate(() => localStorage.getItem('shelflife.save.bak'))).toBe(bad);
  await expect(page.locator('.toast.bad').last()).toContainText('could not be read', { timeout: 5000 });
  expect(errors).toEqual([]);
});

