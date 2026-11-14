// End-to-end tests. They drive real gameplay: keyboard/mouse input, real UI buttons, the real simulation.
// Teleports are only used to SET UP a starting position; outcomes are always produced by gameplay systems.
import { test, expect, Page } from '@playwright/test';

async function boot(page: Page, query: string) {
  await page.goto(`/?fresh=1&test=1&${query}`);
  await page.waitForFunction(() => (window as any).__game && (window as any).__game.simTime > 0.5, null, { timeout: 60_000 });
  await page.locator('#view').focus();
}

const G = (page: Page, fn: string) => page.evaluate(`(() => { const g = window.__game; return ${fn}; })()`) as Promise<any>;

async function hold(page: Page, keys: string[], ms: number) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
}

/** wait until sim time advanced by `s` seconds */
async function simWait(page: Page, s: number) {
  const t0 = await G(page, 'g.simTime');
  await page.waitForFunction((t) => (window as any).__game.simTime >= t, t0 + s, { timeout: 120_000 });
}

/** Set up the player at a position with the camera facing a given yaw (forward = (-sin yaw, -cos yaw)). */
async function setup(page: Page, x: number, y: number, z: number, camYaw: number) {
  await page.evaluate(
    ([x, y, z, yaw]) => {
      const g = (window as any).__game;
      g.player.place(new g.player.body.pos.constructor(x, y, z), yaw + Math.PI);
      g.cam.yaw = yaw;
    },
    [x, y, z, camYaw],
  );
  await simWait(page, 0.3);
}

test('opening: title, Chapter Zero skipped by keyboard, then the name prompt', async ({ page }) => {
  await page.goto('/?fresh=1');
  await page.waitForFunction(() => (window as any).__game);
  expect(await page.title()).toBe('Shelf Life');
  await expect(page.locator('.m-title .title')).toHaveText('SHELF LIFE');
  await page.locator('[data-testid=begin]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'intro');
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape'); // skip the arrival
  await page.waitForFunction(() => (window as any).__game.mode === 'play', null, { timeout: 5000 });
  await expect(page.locator('.m-name')).toContainText('What should we call you?');
  expect(await G(page, 'g.state.debt')).toBe(40);
  expect(await G(page, 'g.onboarding.step')).toBe('name');
});

test('startup and rendering', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, 'state=lower');
  await simWait(page, 1);
  const info = await G(page, '({ calls: g.renderer.gl.info.render.calls, tris: g.renderer.gl.info.render.triangles, fps: g.renderer.fps, renderer: g.renderer.rendererInfo, npcs: g.pop.npcs.length, lamps: g.wd.lamps.length })');
  console.log('render info', JSON.stringify(info));
  expect(info.calls).toBeGreaterThan(50);
  expect(info.tris).toBeGreaterThan(100_000);
  expect(info.npcs).toBeGreaterThanOrEqual(40);
  // the canvas is not blank: pixel variance across the frame
  const variance = await page.evaluate(() => {
    const c = document.getElementById('view') as HTMLCanvasElement;
    const tmp = document.createElement('canvas');
    tmp.width = 64;
    tmp.height = 36;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(c, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let sum = 0, sum2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      sum += v;
      sum2 += v * v;
    }
    const n = d.length / 4;
    return sum2 / n - (sum / n) ** 2;
  });
  expect(variance).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('movement, sprint and jumping', async ({ page }) => {
  await boot(page, 'state=lower');
  await setup(page, 0, 0, 0, Math.PI / 2); // forward = -x along the lane
  const p0 = await G(page, 'g.player.body.pos.clone()');
  await hold(page, ['KeyW'], 1200);
  const p1 = await G(page, 'g.player.body.pos.clone()');
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(2.5);
  expect(p1.x).toBeLessThan(p0.x);
  // sprint covers more ground and drains stamina
  await hold(page, ['ShiftLeft', 'KeyW'], 1200);
  const p2 = await G(page, 'g.player.body.pos.clone()');
  expect(Math.abs(p2.x - p1.x)).toBeGreaterThan(Math.abs(p1.x - p0.x) * 1.2);
  expect(await G(page, 'g.player.stamina')).toBeLessThan(100);
  // jump: rises, then lands again
  await page.keyboard.down('Space');
  await simWait(page, 0.25);
  const yUp = await G(page, 'g.player.body.pos.y');
  await page.keyboard.up('Space');
  expect(yUp).toBeGreaterThan(0.5);
  await simWait(page, 1.0);
  expect(await G(page, 'g.player.body.grounded')).toBe(true);
  expect(await G(page, 'g.player.body.pos.y')).toBeLessThan(0.05);
});

test('camera works without pointer lock: drag and arrow keys', async ({ page }) => {
  await boot(page, 'state=lower');
  const y0 = await G(page, 'g.cam.yaw');
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(840, 360, { steps: 8 });
  await page.mouse.up();
  const y1 = await G(page, 'g.cam.yaw');
  expect(Math.abs(y1 - y0)).toBeGreaterThan(0.3);
  await hold(page, ['ArrowLeft'], 600);
  const y2 = await G(page, 'g.cam.yaw');
  expect(Math.abs(y2 - y1)).toBeGreaterThan(0.5);
  const d0 = await G(page, 'g.cam.dist');
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(200);
  expect(await G(page, 'g.cam.dist')).not.toBe(d0);
});

test('walls, corners and the enterable home', async ({ page }) => {
  await boot(page, 'state=lower');
  // walk straight into the player's matchbox through its doorway, then into the back wall
  await setup(page, -8.3, 0, -1.4, 0); // forward = -z
  await hold(page, ['KeyW'], 3500);
  const p = await G(page, 'g.player.body.pos.clone()');
  expect(p.z).toBeLessThan(-6); // inside the home
  expect(p.z).toBeGreaterThan(-10.45 + 0.2); // stopped by the back wall, not through it
  // corner: push diagonally into the back-left corner
  await hold(page, ['KeyW', 'KeyA'], 2500);
  const c = await G(page, 'g.player.body.pos.clone()');
  expect(c.x).toBeGreaterThan(-9.9 + 0.2);
  expect(c.z).toBeGreaterThan(-10.45 + 0.2);
  // the side wall also blocks: push right toward the window wall
  await hold(page, ['KeyD'], 2500);
  const r = await G(page, 'g.player.body.pos.clone()');
  expect(r.x).toBeLessThan(-5.7 - 0.2);
});

test('stairs and the paper-clip bridge', async ({ page }) => {
  await boot(page, 'state=lower');
  await setup(page, -21, 0, 0.3, 0); // foot of the Depths stairs, facing -z (up the stairs)
  await hold(page, ['KeyW'], 2600);
  const s = await G(page, 'g.player.body.pos.clone()');
  expect(s.y).toBeGreaterThan(2.7); // reached the roof gallery
  expect(s.z).toBeLessThan(-4.0);
  // Threadmarket boardwalk â†’ bridge â†’ spool tower
  await boot(page, 'state=market');
  await setup(page, 10.4, 24.5, -8.4, Math.PI); // forward = +z
  await hold(page, ['KeyW'], 4500);
  const b = await G(page, 'g.player.body.pos.clone()');
  expect(b.z).toBeGreaterThan(4.5); // crossed
  expect(b.y).toBeGreaterThan(24.2); // didn't fall off
});

test('NPCs are active', async ({ page }) => {
  await boot(page, 'state=market');
  const before = await G(page, 'g.pop.npcs.map(n => n.fig.pos.clone())');
  await simWait(page, 4);
  const after = await G(page, 'g.pop.npcs.map(n => n.fig.pos.clone())');
  let moved = 0;
  for (let i = 0; i < before.length; i++) if (Math.hypot(after[i].x - before[i].x, after[i].z - before[i].z) > 0.5) moved++;
  console.log('npcs moved', moved, 'of', before.length);
  expect(moved).toBeGreaterThanOrEqual(8);
  const states = await G(page, '[...new Set(g.pop.npcs.map(n => n.fig.state))]');
  expect(states.length).toBeGreaterThanOrEqual(4); // walking, serving, guarding, talking...
});

test('collection and inventory', async ({ page }) => {
  await boot(page, 'state=lower');
  await setup(page, -19.2, 0, 3.6, Math.PI); // just north of heap0, facing +z toward it
  await page.keyboard.press('KeyE');
  await simWait(page, 0.4);
  const inv = await G(page, '({...g.state.inv})');
  expect(Object.values(inv).reduce((a: number, b: any) => a + b, 0)).toBeGreaterThanOrEqual(2);
  // the heap is now picked clean
  await page.keyboard.press('KeyE');
  await simWait(page, 0.3);
  expect(await page.locator('.toast').last().textContent()).toContain('Nothing useful');
  await page.keyboard.press('KeyI');
  await expect(page.locator('.m-inv')).toBeVisible();
  await expect(page.locator('.m-inv')).toContainText('Scrap');
  await page.keyboard.press('Escape');
  await expect(page.locator('.m-inv')).toHaveCount(0);
});

test('purchases, sales and insufficient funds', async ({ page }) => {
  await boot(page, 'state=lower');
  await setup(page, 1.6, 0, 5.15, Math.PI); // at Pell's counter, facing +z toward Pell
  await page.keyboard.press('KeyE');
  await expect(page.locator('.m-dialogue')).toBeVisible();
  await page.keyboard.press('Digit1'); // "Show me what you have."
  await expect(page.locator('.m-trade')).toBeVisible();
  const t0 = await G(page, 'g.state.tokens');
  const price = await G(page, "g.state.priceBuy('pell', 'food')");
  await page.locator('[data-testid=buy-food]').click();
  expect(await G(page, 'g.state.tokens')).toBe(t0 - price);
  expect(await G(page, "g.state.count('food')")).toBe(1);
  // keep buying until broke, then the purchase must be refused
  while ((await G(page, 'g.state.tokens')) >= price) await page.locator('[data-testid=buy-food]').click();
  const broke = await G(page, 'g.state.tokens');
  const food = await G(page, "g.state.count('food')");
  await page.locator('[data-testid=buy-food]').click();
  await expect(page.locator('.toast.bad').last()).toContainText('Not enough tokens');
  expect(await G(page, 'g.state.tokens')).toBe(broke);
  expect(await G(page, "g.state.count('food')")).toBe(food);
  // sell one back
  const sellPrice = await G(page, "g.state.priceSell('pell', 'food')");
  await page.locator('[data-testid=sell-food]').click();
  expect(await G(page, 'g.state.tokens')).toBe(broke + sellPrice);
});

test('candy event: hand, impact, shards, crowd and economy', async ({ page }) => {
  await boot(page, 'state=market&event=candy');
  const price0 = await G(page, "g.state.priceBuy('odo', 'food')");
  const supply0 = await G(page, 'g.state.supply');
  await page.waitForFunction(() => (window as any).__game.candy.phase === 'reach', null, { timeout: 60_000 });
  expect(await G(page, 'g.candy.hand.root.visible')).toBe(true);
  await page.waitForFunction(() => (window as any).__game.candy.phase === 'rush', null, { timeout: 60_000 });
  const shards = await G(page, 'g.candy.shards.length');
  expect(shards).toBeGreaterThanOrEqual(10);
  expect(await G(page, 'g.state.supply')).toBeGreaterThan(supply0);
  expect(await G(page, "g.state.priceBuy('odo', 'food')")).toBeLessThanOrEqual(price0);
  // the crowd reacts
  expect(await G(page, "g.pop.npcs.filter(n => n.mode === 'rush' || n.mode === 'gather').length")).toBeGreaterThanOrEqual(6);
  // the player grabs a shard with the context action
  const s = await G(page, 'g.candy.shards.find(s => !s.taken).pos.clone()');
  await setup(page, s.x, 20, s.z + 0.6, 0);
  await page.keyboard.press('KeyF');
  await simWait(page, 0.3);
  expect(await G(page, "g.state.count('candy')")).toBe(1);
});

test('quest progression and choice consequences (authority path)', async ({ page }) => {
  await boot(page, 'state=market');
  // talk to Odo â†’ the giant arrives
  const odo = await G(page, "g.pop.byId.get('odo').fig.pos.clone()");
  await setup(page, odo.x, 20, odo.z + 1.7, 0);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.m-dialogue')).toContainText('Odo');
  await page.keyboard.press('Digit1');
  expect(await G(page, 'g.story.stage')).toBe(10); // Candy
  await page.waitForFunction(() => (window as any).__game.candy.phase === 'rush', null, { timeout: 60_000 });
  await simWait(page, 1.2);
  for (let k = 0; k < 3; k++) {
    const s = await G(page, "(() => { const f = g.candy.shards.filter(s => !s.taken); return f.length ? f[0].pos.clone() : null })()");
    if (!s) break;
    await setup(page, s.x, 20, s.z + 0.6, 0);
    await page.keyboard.press('KeyF');
    await simWait(page, 0.2);
  }
  const n = await G(page, "g.state.count('candy')");
  expect(n).toBeGreaterThanOrEqual(1);
  // the rush ends: porters claim the rest and the Warden walks back to the granary
  await page.waitForFunction(() => (window as any).__game.candy.phase === 'idle', null, { timeout: 90_000 });
  await simWait(page, 6);
  const tokens0 = await G(page, 'g.state.tokens');
  const cal = await G(page, "g.pop.byId.get('calloway').fig.pos.clone()");
  await setup(page, cal.x + 0.2, 20, cal.z + 1.6, 0);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.m-dialogue')).toContainText('Calloway');
  await page.keyboard.press('Digit1');
  expect(await G(page, 'g.story.choice')).toBe('authority');
  expect(await G(page, 'g.state.tokens')).toBe(tokens0 + n * 15);
  expect(await G(page, 'g.state.debt')).toBe(0); // selling clears the arrival levy
  expect(await G(page, 'g.state.rep.authority')).toBe(20);
  expect(await G(page, 'g.state.rep.table')).toBe(-15);
  expect(await G(page, "g.story.flags.has('dayPermit')")).toBe(true);
  await page.keyboard.press('Digit1');
  // consequence: Auntie Bel's dialogue changes
  await simWait(page, 8); // let the Warden settle back at his post
  const bel = await G(page, "g.pop.byId.get('bel').fig.pos.clone()");
  await setup(page, bel.x + 0.3, 20, bel.z + 1.2, 0);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.m-dialogue')).toContainText('bowls are empty');
  await page.keyboard.press('Digit1');
  // the checkpoint now opens with the permit
  await setup(page, -18.1, 20, 7.2, 0);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.m-dialogue')).toContainText('Day permit');
  await page.keyboard.press('Digit1');
  expect(await G(page, 'g.checkpointOpen')).toBe(true);
});

test('full chapter via autopilot (community path)', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/?fresh=1&auto=1');
  await page.waitForFunction(() => (window as any).__game?.auto?.done, null, { timeout: 400_000, polling: 2000 });
  const r = await G(page, '({ stage: g.story.stage, choice: g.story.choice, home: g.state.homeRepaired, lift: g.state.liftRepaired, rep: g.state.rep, debt: g.state.debt, log: g.auto.log })');
  expect(r.debt).toBe(55); // giving the candy away costs you: the levy plus a fine
  console.log(r.log.join('\n'));
  expect(r.stage).toBe(14); // Free: chapter complete
  expect(r.choice).toBe('community');
  expect(r.home).toBe(true);
  expect(r.lift).toBe(true);
  expect(r.rep.table).toBeGreaterThan(0);
});

test('save and load restore real progress', async ({ page }) => {
  await boot(page, 'state=lower');
  await setup(page, -6.0, 0, 4.2, Math.PI); // at the drip, facing the thimble
  await page.keyboard.press('KeyE');
  await simWait(page, 0.3);
  expect(await G(page, "g.state.count('water')")).toBe(2);
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=save]').click();
  await page.locator('[data-testid=resume]').click();
  // change things after saving
  await hold(page, ['KeyD'], 1200);
  await page.keyboard.press('KeyI');
  await page.locator('[data-testid=use-water]').click();
  await page.keyboard.press('Escape');
  expect(await G(page, "g.state.count('water')")).toBe(1);
  // load restores inventory and position
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=load]').click();
  expect(await G(page, "g.state.count('water')")).toBe(2);
  const p = await G(page, 'g.player.body.pos.clone()');
  expect(Math.hypot(p.x + 6.0, p.z - 4.2)).toBeLessThan(0.8);
  // and survives a page reload through the title screen's Continue
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__game);
  await page.locator('[data-testid=continue]').click();
  await page.waitForFunction(() => (window as any).__game.mode === 'play');
  expect(await G(page, "g.state.count('water')")).toBe(2);
});

test('restart clears progress', async ({ page }) => {
  await boot(page, 'state=lower');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=save]').click();
  page.once('dialog', (d) => d.accept());
  await Promise.all([page.waitForNavigation(), page.locator('[data-testid=restart]').click()]);
  await page.waitForFunction(() => (window as any).__game);
  expect(await page.evaluate(() => localStorage.getItem('shelflife.save'))).toBeNull();
  await expect(page.locator('[data-testid=begin]')).toBeVisible();
  await expect(page.locator('[data-testid=continue]')).toHaveCount(0);
});

test('audio: enable sound and play effects', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, 'state=lower');
  expect(await G(page, 'g.audio.enabled')).toBe(false);
  await page.locator('[data-testid=sound]').click();
  expect(await G(page, 'g.audio.enabled')).toBe(true);
  await expect.poll(() => G(page, 'g.audio.ctx.state')).toBe('running');
  await expect(page.locator('[data-testid=sound]')).toContainText('Sound on');
  await page.locator('#view').focus();
  await page.keyboard.press('Space');
  await hold(page, ['KeyW'], 800);
  await setup(page, -6.0, 0, 4.2, Math.PI);
  await page.keyboard.press('KeyE');
  await simWait(page, 0.5);
  expect(await G(page, "g.state.count('water')")).toBe(2);
  await page.locator('[data-testid=sound]').click();
  expect(await G(page, 'g.audio.enabled')).toBe(false);
  expect(errors).toEqual([]);
});


test('Sump: the Pick kills a Dust Hopper for silk', async ({ page }) => {
  await boot(page, 'state=sump&kit=1');
  for (let i = 0; i < 12; i++) {
    if (!(await G(page, 'g.underfall.spiders[0].alive'))) break;
    const s = await G(page, 'g.underfall.spiders[0].body.pos.clone()');
    const p = await G(page, 'g.player.body.pos.clone()');
    const yaw = Math.atan2(-(s.x - p.x), -(s.z - p.z));
    // stand 1.3 units from the spider along the line to the player, facing it
    const d = Math.hypot(p.x - s.x, p.z - s.z) || 1;
    await setup(page, s.x + ((p.x - s.x) / d) * 1.3, 0, s.z + ((p.z - s.z) / d) * 1.3, yaw);
    await page.keyboard.press('KeyF');
    await simWait(page, 0.35);
  }
  expect(await G(page, 'g.underfall.spiders[0].alive')).toBe(false);
  expect(await G(page, "g.state.count('silk')")).toBeGreaterThanOrEqual(1);
});

test('Sump: the Snapband fires grit', async ({ page }) => {
  await boot(page, 'state=sump&kit=1');
  expect(await G(page, "g.state.count('grit')")).toBe(24);
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyQ');
  await simWait(page, 0.1);
  expect(await G(page, "g.state.count('grit')")).toBe(23);
});

test('Sump: a Fall drops pickups the player and the Tallymen compete for', async ({ page }) => {
  await boot(page, 'state=sump&kit=1&event=fall');
  await expect
    .poll(() => G(page, 'g.underfall.pickups.length >= 6 && g.underfall.pickups.every((k) => k.pos.y < 0.4)'), { timeout: 60_000 })
    .toBe(true);
  const p = await G(page, 'g.player.body.pos.clone()');
  const target = await G(
    page,
    `(() => { const p = g.player.body.pos; const l = g.underfall.pickups.filter((k) => !k.taken).sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z)); const k = l[0]; return { id: k.id, item: k.item, qty: k.qty, x: k.pos.x, z: k.pos.z }; })()`,
  );
  const before = await G(page, `g.state.count('${target.item}')`);
  await setup(page, target.x + 0.5, 0, target.z, Math.PI / 2); // forward = -x, towards the pickup
  await page.keyboard.press('KeyE');
  await simWait(page, 0.3);
  expect(await G(page, `g.state.count('${target.item}')`)).toBeGreaterThan(before);
  expect(p).toBeTruthy();
  await expect
    .poll(
      () => G(page, "g.underfall.tallymen.some((t) => t.state === 'race' || t.state === 'haul') || Object.values(g.underfall.cart).some((n) => n >= 1)"),
      { timeout: 90_000 },
    )
    .toBe(true);
});

test('Home progression: build the Stash Tin and keep the stash through save/load', async ({ page }) => {
  await boot(page, 'state=market');
  await page.evaluate(() => (window as any).__game.place('depths'));
  await simWait(page, 0.3);
  const bed = await G(page, "g.wd.hotspots.get('bed-player').pos.clone()");
  await setup(page, bed.x, 0, bed.z, 0);
  await G(page, "(g.state.add('scrap', 4), g.state.add('metal', 2), true)");
  await page.keyboard.press('KeyF');
  await expect(page.locator('.m-inv')).toContainText('Your matchbox');
  await page.locator('[data-testid=home-build]').click();
  await expect.poll(() => G(page, 'g.state.homeTier')).toBe(1);
  expect(await G(page, "g.wd.groups.get('homeTier1').visible")).toBe(true);
  // stash 3 scrap (given as setup)
  await page.keyboard.press('Escape'); // close the panel; it only redraws when reopened
  await expect(page.locator('.m-inv')).toHaveCount(0);
  await G(page, "(g.state.add('scrap', 3), true)");
  await page.keyboard.press('KeyF');
  await expect(page.locator('.m-inv')).toContainText('Your matchbox');
  const packBefore = await G(page, "g.state.count('scrap')");
  await page.locator('[data-testid=stash-scrap]').click();
  expect(await G(page, 'g.state.stash.scrap')).toBe(packBefore);
  expect(await G(page, "g.state.count('scrap')")).toBe(0);
  const stashed = packBefore;
  // save (first Escape closes the panel, second opens the pause menu)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=save]').click();
  await page.locator('[data-testid=resume]').click();
  // take it back out through the panel
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await expect(page.locator('.m-inv')).toContainText('Your matchbox');
  await page.locator('[data-testid=take-scrap]').click();
  expect(await G(page, "g.state.count('scrap')")).toBe(stashed);
  // load restores the saved stash
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('[data-testid=load]').click();
  expect(await G(page, 'g.state.stash.scrap')).toBe(stashed);
});


