// Phone controls: synthetic touch pointer events drive the stick, the look drag and the buttons.
import { test, expect, Page } from '@playwright/test';

const G = (page: Page, fn: string) => page.evaluate(`(() => { const g = window.__game; return ${fn}; })()`) as Promise<any>;

// a touch pointer gesture on the canvas from (x0,y0) to (x1,y1)
async function swipe(page: Page, id: number, x0: number, y0: number, x1: number, y1: number, holdMs: number) {
  await page.evaluate(([id, x0, y0, x1, y1]) => {
    const c = document.getElementById('view')!;
    const ev = (type: string, x: number, y: number) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
    ev('pointerdown', x0, y0);
    for (let i = 1; i <= 5; i++) ev('pointermove', x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5);
  }, [id, x0, y0, x1, y1]);
  await page.waitForTimeout(holdMs);
  await page.evaluate(([id, x, y]) => {
    document.getElementById('view')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
  }, [id, x1, y1]);
}

test('touch controls move, look and jump; they stay off on desktop', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fresh=1&test=1&state=market&touch=1');
  await page.waitForFunction(() => (window as any).__game?.simTime > 2, null, { timeout: 60_000 });
  await expect(page.getByTestId('touch-jump')).toBeVisible();

  // stick: push up on the left half -> the player walks
  const p0 = await G(page, '({ x: g.player.body.pos.x, z: g.player.body.pos.z })');
  await swipe(page, 1, 150, 500, 150, 420, 900);
  const p1 = await G(page, '({ x: g.player.body.pos.x, z: g.player.body.pos.z })');
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(1);
  expect(await G(page, 'g.input.virtual.moveZ')).toBe(0); // released

  // look: drag on the right half turns the camera
  const yaw0 = await G(page, 'g.cam.yaw');
  await swipe(page, 1, 900, 300, 1100, 300, 100); // id 1: setPointerCapture needs a pointer the browser knows
  expect(Math.abs((await G(page, 'g.cam.yaw')) - yaw0)).toBeGreaterThan(0.05);

  // Jump button leaves the ground
  const y0 = await G(page, 'g.player.body.pos.y');
  const jump = page.getByTestId('touch-jump');
  await jump.dispatchEvent('pointerdown');
  await page.waitForTimeout(250);
  await jump.dispatchEvent('pointerup');
  expect(await G(page, 'g.player.body.pos.y')).toBeGreaterThan(y0 + 0.2);
  expect(errors).toEqual([]);

  // desktop (fine pointer, no ?touch) gets no on-screen controls
  await page.goto('/?fresh=1&test=1&state=market');
  await page.waitForFunction(() => (window as any).__game?.simTime > 1, null, { timeout: 60_000 });
  await expect(page.getByTestId('touch-jump')).toHaveCount(0);
});
