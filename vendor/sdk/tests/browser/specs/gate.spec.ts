// gate.spec.ts — 실브라우저 관문 (개발명세 §8 관문 3).
//
//   단위 시험은 판정 규칙만 고정한다. IntersectionObserver 가 실제로 콜백을 주는지,
//   화면보다 큰 요소가 정말 잡히는지는 브라우저에서만 드러난다.
//   랩 「노출」 탭에서 사람이 눈으로 확인하던 것을 여기서 기계가 확인한다.

import { test, expect } from '@playwright/test';
import { captureImpressions, assertVisible, sweep, flush, countByKey } from './helpers';

test('케이스 6개가 기대한 건수로 잡힌다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await sweep(page);
  await flush(page, cap);

  const byKey = countByKey(cap.list);
  const names = new Set(cap.list.map((i) => i.name));


  // ① 상품 카드 3개 — 이름은 같고 업무ID 로 갈린다
  expect(byKey.get('ade_0000000000a1#item_id=1001')).toBe(1);
  expect(byKey.get('ade_0000000000a1#item_id=1002')).toBe(1);
  expect(byKey.get('ade_0000000000a1#item_id=1003')).toBe(1);

  // ② 화면보다 큰 배너 — 100% 는 될 수 없지만 화면의 절반을 덮어 인정된다
  expect(byKey.get('ade_0000000000b1#banner_id=summer')).toBe(1);

  // ③ 노출 끔 · ④ control — 관찰 대상에서 빠진다
  expect(names.has('ade_0000000000b2')).toBe(false);
  expect(names.has('ade_0000000000c1')).toBe(false);

  // ⑤ 빈 업무ID 2개 — 한 열쇠로 뭉치지 않고 요소 단위로 센다 (분모가 붕괴하지 않는다)
  const empty = cap.list.filter((i) => i.name === 'ade_0000000000e1');
  expect(empty).toHaveLength(2);

  // 전체 — 정확히 6건
  expect(cap.list).toHaveLength(6);

  // 업무ID 가 있는 열쇠는 1번씩만 — 재발화가 없다.
  // 빈 업무ID 는 열쇠를 만들 수 없어 요소 단위로 세므로 여기서 뺀다(위 ⑤).
  for (const [key, n] of byKey) {
    if (key.endsWith('=')) continue;
    expect(n, `${key} 가 ${n}번 발화했다`).toBe(1);
  }
});

test('한 번 센 요소는 다시 화면에 들어와도 다시 세지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await sweep(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await sweep(page); // 두 번째 훑기
  await flush(page, cap);

  expect(cap.list).toHaveLength(6);
});
