// outcome.spec.ts — 직접 결과 adesdk.track 이 벤더 track() 을 감싼 것으로 제대로 나가는가.
//
//   fixture/app.js 가 init 직후 adesdk.track() 을 한 번 부른다. 속성에 민감해 보이는 키(card_no)와
//   우리 스탬프 자리(application_id · record_type)를 일부러 넣는다. SDK 가 하는 일은 둘뿐이어야 한다 —
//   민감 키 · 객체 값은 빼고, 이름 형식이 깨지면 보내지 않고, 세 축 · 앱 식별은 우리 값으로 덮는다(DA-201 · DA-203).

import { test, expect } from '@playwright/test';
import { captureImpressions, flush } from './helpers';

test('adesdk.track() 은 민감 키를 빼고 세 축 · 앱 식별을 우리 값으로 덮어 즉시 보낸다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await flush(page, cap);

  const outcomes = cap.events.filter((e) => e.event === 'ade_3f2a91c4d5e6');
  expect(outcomes, '직접 결과가 한 건 와야 한다').toHaveLength(1);
  const p = outcomes[0].properties ?? {};

  // FE 가 넘긴 업무 값은 그대로
  expect(p.order_id).toBe('o-1');
  expect(p.amount).toBe(1200);
  expect(p.name, '속성 키 name 은 업무 값이다 — 예약이 아니다').toBe('운동화');
  // 민감해 보이는 키는 싣지 않는다 — 요소 판정과 같은 낱말 목록(contract.isSensitiveKey)
  expect('card_no' in p, 'card_no 가 실렸다').toBe(false);
  // init 전 호출은 터지지 않고 버려진다 — 페이지 오류 0 은 아래에서, 이벤트 0 건은 여기서(DA-205 · 협의안 7)
  expect(cap.events.filter((e) => e.event === 'ade_000000000000'), 'init 전 호출이 나갔다').toHaveLength(0);
  // 객체 값은 싣지 않는다 — 안이 뭔지 알 수 없다(개발명세 02 #8 속성 형식)
  expect('meta' in p, '객체 값 meta 가 실렸다').toBe(false);
  // 255자 경계 — 벤더가 자르는 길이(mixpanel-core.js:1056). 254 · 255 는 그대로 오고 256 은 속성째 빠진다.
  //   자른 값이 오면 안 된다 — 잘린 값이 멀쩡한 값처럼 남는 것을 막는 게 목적(협의안 5번 · DA-216)
  expect(p.len254, '254자가 변했다').toBe('x'.repeat(254));
  expect(p.len255, '255자가 변했다').toBe('x'.repeat(255));
  expect('len256' in p, '256자 속성이 실렸다(잘려서라도)').toBe(false);
  // FE 입력으로 받지 않는 키는 버린다 — 분석 이름은 기획자가 붙인다(F4 f4-r003 · ADR-020)
  expect('event_name' in p, 'event_name 이 실렸다').toBe(false);
  // 이름 형식이 깨진 호출('Purchase Complete')은 이벤트를 만들지 않는다(기능정의서 02 §3 · §5.5)
  expect(cap.events.filter((e) => e.event === 'Purchase Complete'), '형식 깨진 이름이 나갔다').toHaveLength(0);
  // 스탬프는 FE 값이 아니라 우리 값 — before_track 이 직접 결과에는 덮는다
  expect(p.application_id).toBe('app_verify');
  expect(p.record_type).toBe('behavior');
  expect(p.collection_source).toBe('direct');
  expect(p.collection_grade).toBe('guaranteed');
  expect(p.build_id).toBe('verify');

  const errors = await page.evaluate(() => (window as any).__verify.errors);
  expect(errors, '페이지 오류').toEqual([]);
});

test('init 전에 붙잡아 둔 window.adesdk · track 참조로 불러도 init 뒤에는 서버에 닿는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await flush(page, cap);

  const byObject = cap.events.filter((e) => e.event === 'ade_00000000ee01');
  const byFunction = cap.events.filter((e) => e.event === 'ade_00000000ee02');
  expect(byObject, 'init 전 window.adesdk 객체 참조로 부른 것이 안 왔다 — 객체를 통째로 바꿔 끼웠다').toHaveLength(1);
  expect(byFunction, 'init 전 track 함수 참조로 부른 것이 안 왔다').toHaveLength(1);
  expect(byObject[0].properties.via).toBe('early-object');
  expect(byFunction[0].properties.via).toBe('early-function');
});

test("adesdk.track('Purchase', {...}) 처럼 첫 인자가 문자열이면 보내지 않고 페이지도 멀쩡하다 (DA-279)", async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await flush(page, cap);

  // FE 는 이벤트 이름을 짓지 않는다 — 어느 이름으로도 나가면 안 된다(빌드 이름 모양을 흉내 낸 문자열 포함)
  expect(cap.events.filter((e) => e.event === 'Purchase'), 'Purchase 가 나갔다').toHaveLength(0);
  expect(cap.events.filter((e) => e.event === 'ade_3f2a91c4d5e8'), '문자열 첫 인자가 이름으로 받아들여졌다').toHaveLength(0);
  const errors = await page.evaluate(() => (window as any).__verify.errors);
  expect(errors, '페이지 오류').toEqual([]);
});

test('업무 결과 입구는 adesdk.track 하나뿐이다 — 예전 전역 window.tracking 은 없다 (DA-279)', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => typeof (window as any).adesdk.track), 'adesdk.track 이 없다').toBe('function');
  expect(await page.evaluate(() => typeof (window as any).tracking), 'window.tracking 이 남았다').toBe('undefined');
  expect(await page.evaluate(() => (window as any).__verify.trackingGlobal), 'init 전후 어느 때든 window.tracking 이 서면 안 된다').toBe('undefined');
});
