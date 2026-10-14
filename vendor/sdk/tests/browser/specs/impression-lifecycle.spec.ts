// impression-lifecycle.spec.ts — 노출 관찰자가 「들어온 순간」 뒤에 바뀐 DOM 을 어떻게 다루는가
//
//   gate.spec 은 정적인 페이지를 한 번 훑는다. 여기서는 요소가 화면을 나갔다 들어오는 사이에
//   선언이 바뀌거나(목록 노드 재사용), 탭이 숨은 사이에 요소가 사라지는(SPA 재렌더) 경우를 본다.
//   둘 다 IntersectionObserver 콜백 순서에 달린 것이라 실브라우저에서만 드러난다.
//
//   판정 시간을 1500ms 로 늘려 띄운다(?impression_ms). 기본 150ms 로는 「들어왔다가 발화 전에 나간다」를
//   러너 속도와 무관하게 만들 수 없다 — CI 의 webkit 에서 프레임 대기조차 150ms 를 넘겼다.
//   순서(들어옴 → 나감 → 바뀜 → 다시 들어옴)만 보고, 시간은 넉넉히 준다.

import { test, expect } from '@playwright/test';
import { captureImpressions, assertVisible, flush } from './helpers';

const DURATION_MS = 1500;
/** IntersectionObserver 알림이 확실히 전달될 시간. 판정 시간보다 훨씬 짧아야 한다 */
const SETTLE_MS = 300;

const keysOf = (cap: { list: Array<{ key: string }> }) => cap.list.map((i) => i.key);

test('화면을 나갔다 들어온 요소는 선언을 다시 읽는다 — 재사용된 노드가 옛 업무ID 로 세어지지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto(`/?impression_ms=${DURATION_MS}`);
  await assertVisible(page);

  // 들어왔다가 판정 시간 전에 나간다 — 스냅샷은 떴지만 발화는 안 됐다
  await page.locator('[data-case="product-1"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(SETTLE_MS);

  // 목록이 노드를 다른 항목에 재사용했다 — 같은 노드, 다른 업무ID
  await page.evaluate(() => document.querySelector('[data-case="product-1"]')!.setAttribute('data-ade-item-id', '1001-b'));
  await page.locator('[data-case="product-1"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(DURATION_MS + SETTLE_MS * 2);
  await flush(page, cap);

  const keys = keysOf(cap);
  expect(keys, '옛 스냅샷(1001)으로 발화했다').not.toContain('ade_0000000000a1#item_id=1001');
  expect(keys).toContain('ade_0000000000a1#item_id=1001-b');
});

test('탭이 숨은 사이에 사라진 요소는 돌아와도 세지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto(`/?impression_ms=${DURATION_MS}`);
  await assertVisible(page);

  /** visibilityState 를 흉내 낸다 — Playwright 는 탭을 실제로 숨기지 못한다. */
  const setVisibility = (state: 'hidden' | 'visible') =>
    page.evaluate((s) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);

  // 들어와서 재는 중에 탭이 숨는다
  await page.locator('[data-case="product-2"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SETTLE_MS);
  await setVisibility('hidden');
  await page.waitForTimeout(SETTLE_MS);

  // 숨은 사이에 SPA 가 요소를 지운다 — 관찰자는 「나갔다」 콜백을 숨은 상태에서 받는다
  await page.evaluate(() => document.querySelector('[data-case="product-2"]')!.remove());
  await page.waitForTimeout(SETTLE_MS);

  await setVisibility('visible');
  await page.waitForTimeout(DURATION_MS + SETTLE_MS * 2);
  await flush(page, cap);

  expect(keysOf(cap), '화면에 없는 요소가 노출로 세어졌다').not.toContain('ade_0000000000a1#item_id=1002');
});
