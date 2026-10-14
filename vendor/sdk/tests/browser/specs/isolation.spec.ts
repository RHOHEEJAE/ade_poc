// isolation.spec.ts — 장애 격리 시험.
//
//   「SDK 오류가 서비스 장애가 되지 않는가」에 답한다.
//   SDK 가 기대는 브라우저 기능을 하나씩 망가뜨린 채 페이지를 띄우고 세 가지를 본다.
//
//     1. 페이지의 다른 스크립트가 계속 도는가        (heartbeat 가 계속 오른다)
//     2. 잡히지 않은 오류가 페이지에 새지 않는가      (window.onerror · pageerror 0건)
//     3. 망가진 부분만 빠지고 나머지는 동작하는가     (경우에 따라 다름)
//
//   SDK 는 수집을 포기할 수는 있어도 페이지를 멈춰서는 안 된다.

import { test, expect, type Page } from '@playwright/test';
import { captureImpressions, assertVisible, sweep, flush } from './helpers';

async function loadBroken(page: Page, mode: string) {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  const cap = await captureImpressions(page);
  await page.goto(`/?break=${mode}`);
  await assertVisible(page);
  await sweep(page, 300);
  await flush(page, cap, 3000);
  const inPage: { heartbeat: number; errors: string[] } = await page.evaluate(() => (window as any).__verify);
  return { cap, pageErrors, inPage };
}

test('페이지가 살아 있는지 재는 심장박동이 정상 페이지에서 올라간다', async ({ page }) => {
  // 아래 시험들의 전제. 이게 안 오르면 뒤의 통과는 의미가 없다.
  await page.goto('/');
  const a = await page.evaluate(() => (window as any).__verify.heartbeat);
  await page.waitForTimeout(500);
  const b = await page.evaluate(() => (window as any).__verify.heartbeat);
  expect(b).toBeGreaterThan(a);
});

test('localStorage 가 막혀도 페이지는 멀쩡하다', async ({ page }) => {
  const { pageErrors, inPage } = await loadBroken(page, 'storage');
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
  expect(inPage.errors, inPage.errors.join('\n')).toHaveLength(0);
  expect(inPage.heartbeat).toBeGreaterThan(5);
  // 저장소가 없으면 배치 큐를 못 만든다. 수집이 안 되는 건 허용, 터지는 건 불허.
});

test('IntersectionObserver 가 없어도 페이지는 멀쩡하고 노출만 조용히 빠진다', async ({ page }) => {
  const { cap, pageErrors, inPage } = await loadBroken(page, 'observer');
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
  expect(inPage.errors, inPage.errors.join('\n')).toHaveLength(0);
  expect(inPage.heartbeat).toBeGreaterThan(5);
  expect(cap.list, '관찰자가 없는데 노출이 잡혔다').toHaveLength(0);
});

test('요소 하나를 읽다 터져도 페이지는 멀쩡하고 나머지 요소는 센다', async ({ page }) => {
  const { cap, pageErrors, inPage } = await loadBroken(page, 'dom');
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
  expect(inPage.errors, inPage.errors.join('\n')).toHaveLength(0);
  expect(inPage.heartbeat).toBeGreaterThan(5);

  // product-2 는 읽을 때마다 던지게 했다. 그 하나만 빠지고 나머지 5건은 잡혀야 한다.
  const keys = cap.list.map((i) => i.key);
  expect(keys).not.toContain('ade_0000000000a1#item_id=1002');
  expect(keys).toContain('ade_0000000000a1#item_id=1001');
  expect(keys).toContain('ade_0000000000a1#item_id=1003');
  expect(keys).toContain('ade_0000000000b1#banner_id=summer');
  expect(cap.list.filter((i) => i.name === 'ade_0000000000e1')).toHaveLength(2);
});

test('SDK 를 끄면(VITE_ADE_MIXPANEL=0) 수집은 0건이고 adesdk.track() 호출은 터지지 않는다 (DA-197)', async ({ page }) => {
  // off.js 는 env 를 0 으로 묶은 같은 SDK 다. 서비스 코드는 SDK 유무를 모른 채 adesdk.track() 을 부른다.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message)));
  const cap = await captureImpressions(page);
  await page.goto('/off.html');
  await page.click('button');
  await page.waitForTimeout(1500);
  const inPage: { heartbeat: number; errors: string[]; outcomeCalled: boolean } =
    await page.evaluate(() => (window as any).__verify);

  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
  expect(inPage.errors, inPage.errors.join('\n')).toHaveLength(0);
  expect(inPage.outcomeCalled, 'adesdk.track() 줄을 지나지 못했다 — 입구가 없다').toBe(true);
  expect(await page.evaluate(() => (window as any).__verify.trackingGlobal), '끈 환경에 window.tracking 이 남았다').toBe('undefined');
  expect(await page.evaluate(() => (window as any).__verify.identityCalled), '끈 환경의 adesdk.identify · reset 이 터졌다').toBe(true);
  expect(await page.evaluate(() => (window as any).__verify.compatCalled), '끈 환경의 adesdk.* 호환 입구가 터졌다').toBe(true);
  expect(await page.evaluate(() => (window as any).__verify.optedOut), '끈 환경의 has_opted_out_tracking 은 false').toBe(false);
  expect(inPage.heartbeat).toBeGreaterThan(5);
  expect(cap.events, '꺼진 SDK 가 보냈다').toHaveLength(0);
});
