// session.spec.ts — @adestack/extensions 의 session 확장이 실브라우저에서 탭을 제대로 가르는가.
//
//   규칙(30분 · 로그인 · 복제 · 순번)은 packages/session/test 가 가짜 저장소로 고정한다. 여기서는
//   가짜로 못 보는 것만 본다 — 실제 sessionStorage 가 탭마다 따로인지, localStorage 가 탭을 잇는지,
//   그리고 복제된 탭(sessionStorage 를 베낀 채 뜨는 탭)이 새 tab_id 를 받는지.
//
//   Playwright 는 탭 복제 조작이 없다. 대신 새 페이지에 sessionStorage 를 **미리 심어서** 뜨게 한다 —
//   복제된 탭이 뜨는 순간과 저장소 상태가 같다(원본의 tab_id + 「열려 있다」 표시).

import { test, expect } from '@playwright/test';
import { captureImpressions, flush } from './helpers';

const K_TAB = 'ade.tab_id';
const K_OPEN = 'ade.tab_open';

test('같은 브라우저의 새 탭 — session_id 는 같고 tab_id 는 다르며 순번은 1 부터', async ({ context }) => {
  const a = await context.newPage();
  const capA = await captureImpressions(a);
  await a.goto('/');
  await flush(a, capA);

  const b = await context.newPage();
  const capB = await captureImpressions(b);
  await b.goto('/');
  await flush(b, capB);

  const evA = capA.events[0].properties;
  const evB = capB.events[0].properties;
  expect(evA.session_id, 'localStorage 를 공유하는 탭은 같은 세션').toBe(evB.session_id);
  expect(evA.tab_id, 'sessionStorage 는 탭마다 따로').not.toBe(evB.tab_id);
  expect(Math.min(...capB.events.map((e) => e.properties.sequence_no)), '새 탭은 순번 1 부터').toBe(1);
});

test('복제된 탭 — 원본의 sessionStorage 를 베낀 채 뜨면 새 tab_id 를 받는다', async ({ context }) => {
  // 주의: 원본은 flush 하지 않는다 — helpers.flush 가 pagehide 를 흉내 내서 「열려 있다」 표시를 지운다.
  //    복제는 원본이 열려 있는 채로 일어나야 하므로 저장소에서 직접 읽는다.
  const original = await context.newPage();
  await captureImpressions(original);
  await original.goto('/');
  await original.waitForFunction((k) => sessionStorage.getItem(k) === '1', K_OPEN);
  const originalTab = (await original.evaluate((k) => sessionStorage.getItem(k), K_TAB)) as string;
  const originalSession = await original.evaluate(() => localStorage.getItem('ade.session_id'));
  expect(originalTab).toMatch(/^t_/);

  // 복제: 원본이 아직 열려 있어 표시가 안 지워진 채로 sessionStorage 가 통째로 베껴진다
  const dup = await context.newPage();
  await dup.addInitScript(
    ([kTab, kOpen, tab]) => {
      sessionStorage.setItem(kTab, tab);
      sessionStorage.setItem(kOpen, '1');
    },
    [K_TAB, K_OPEN, originalTab] as const,
  );
  const capD = await captureImpressions(dup);
  await dup.goto('/');
  await flush(dup, capD);

  expect(capD.events[0].properties.tab_id, '복제된 탭이 원본 tab_id 를 그대로 받았다').not.toBe(originalTab);
  expect(capD.events[0].properties.session_id, '세션은 localStorage 라 복제 탭과 공유').toBe(originalSession);
});

test('새로고침 — 떠날 때 표시를 지우므로 같은 tab_id 를 잇는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await flush(page, cap);
  const before = cap.events[0].properties.tab_id;
  const seqBefore = Math.max(...cap.events.map((e) => e.properties.sequence_no as number));

  await page.reload();
  await flush(page, cap);
  const after = cap.events[cap.events.length - 1].properties;
  expect(after.tab_id, '새로고침은 같은 탭이다').toBe(before);
  expect(after.sequence_no, '순번은 새로고침 뒤에도 이어진다').toBeGreaterThan(seqBefore);
});
