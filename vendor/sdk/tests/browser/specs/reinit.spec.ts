// reinit.spec.ts — adesdk.init 을 두 번 불러도(SPA 재init) 클릭은 한 번만 기록된다
//
//   코어는 재init 을 따로 막지 않고 벤더에 기댄다 — npm 모듈의 `mixpanel.init(token, cfg, name)` 은 같은 이름이
//   이미 있으면 새로 만들지 않고 그 인스턴스를 돌려준다(override_mp_init_func). 벤더가 이 동작을 바꾸면
//   같은 인스턴스에 Autocapture 가 한 벌 더 붙어 클릭 · 입력 · submit 이 두 건씩 나간다. 이 시험이 그 가정을 고정한다.
//   확장(세션 · 노출 · 시스템)은 각자 재init 을 막는다(packages/extensions/test/reinit.test.mjs).

import { test, expect } from '@playwright/test';
import { captureImpressions, assertVisible, flush } from './helpers';

test('재init 뒤 신뢰된 클릭 — $ade_click 은 한 건이고 확장 필드도 그대로 붙는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.evaluate(() => (window as any).__verify.reinit());
  await page.click('[data-case="control-1"]');
  await flush(page, cap);

  const clicks = cap.events.filter((e) => e.event === '$ade_click');
  expect(clicks.length, `클릭 한 번에 $ade_click 이 ${clicks.length} 건 — 재init 이 자동수집을 두 벌 켰다`).toBe(1);
  expect(clicks[0].properties.ade_declaration).toMatchObject({ kind: 'control', name: 'ade_0000000000c1' });
  expect(clicks[0].properties.session_id, '재init 뒤에도 세션 확장이 붙는다').toBeTruthy();
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류가 있다').toEqual([]);
});
