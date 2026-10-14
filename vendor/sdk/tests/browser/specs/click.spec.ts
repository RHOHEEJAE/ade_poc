// click.spec.ts — 사람이 실제로 누른 클릭에 선언이 붙는가 (DA-182)
//
//   주의: 반드시 page.click() 으로 누른다. el.click() · dispatchEvent 로 만든 클릭으로는 이 결함이
//      드러나지 않는다 — 브라우저가 직접 디스패치하는(신뢰된) 이벤트는 리스너 하나가 끝날 때마다
//      마이크로태스크가 돌고, 스크립트가 만든 이벤트는 스택이 비지 않아 뒤로 밀린다.
//      SDK 가 「지금 처리 중인 DOM 이벤트」를 마이크로태스크로 비우던 시절, 신뢰된 클릭만
//      벤더 track() 전에 비워져 선언 · 등급 · 판정이 전부 빠졌다. 단위 시험과 합성 클릭은
//      다 통과했고 실제 사용자만 깨졌다.
//
//   Playwright 의 page.click() 은 CDP 로 넣는 신뢰된 입력이라 실제 마우스와 같은 길을 탄다.

import { test, expect } from '@playwright/test';
import { captureImpressions, assertVisible, flush } from './helpers';

const clicks = (cap: { events: Array<Record<string, any>> }) =>
  cap.events.filter((e) => e.event === '$ade_click');

test('신뢰된 클릭 — object 요소의 선언 · 등급 · 판정이 실린다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.click('[data-case="product-2"]');
  await flush(page, cap);

  const [ev] = clicks(cap);
  expect(ev, '$ade_click 이 한 건도 안 왔다').toBeTruthy();
  const p = ev.properties;
  expect(p.collection_source).toBe('codegen');
  expect(p.ade_declaration).toMatchObject({
    kind: 'object',
    role: 'product',
    name: 'ade_0000000000a1',
    identity: { item_id: '1002' },
  });
  expect(p.collection_grade).toBeTruthy();
  expect(p.verdict).toBeTruthy();
  // 화면 문구는 싣는다 — 2026-09-17 코드젠 합의(DA-218, capture_text_content: true). 가릴 요소는 FE 가 mask 로 표시한다(아래 시험)
  expect(p.$el_text, '$el_text 가 없다 — capture_text_content 가 꺼졌나').toBe('상품 1002');
});

test('data-ade-collect="mask" 서브트리 — 이벤트는 남고 $el_text 만 대상 · 조상에서 빠진다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.click('[data-case="mask-btn"]');
  await flush(page, cap);

  const [ev] = clicks(cap);
  expect(ev, '마스크 요소의 클릭이 안 왔다 — mask 는 이벤트를 없애지 않는다').toBeTruthy();
  const p = ev.properties;
  expect(p.ade_declaration).toMatchObject({ kind: 'control', name: 'ade_0000000000c2' });
  // 대상과 조상 배열 모두 — 대상만 지우면 조상(mask-wrap)의 「홍길동님 주문」이 남는다(개발명세 01 §11)
  expect('$el_text' in p, '마스크 대상에 $el_text 가 실렸다').toBe(false);
  for (const el of (p.$elements ?? []) as Array<Record<string, unknown>>) expect('$el_text' in el, '마스크 조상에 $el_text 가 실렸다').toBe(false);
  expect(JSON.stringify(p), '이벤트 어딘가에 사람 이름 문구가 남았다').not.toContain('홍길동');
});

test('신뢰된 클릭 — control 요소도 선언이 실린다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.click('[data-case="control-1"]');
  await flush(page, cap);

  const [ev] = clicks(cap);
  expect(ev).toBeTruthy();
  expect(ev.properties.collection_source).toBe('codegen');
  expect(ev.properties.ade_declaration).toMatchObject({ kind: 'control', name: 'ade_0000000000c1' });
});

test('control 안의 글자를 눌러도 그 control 의 선언이 실린다 — 자식은 미선언이 아니다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.click('[data-case="control-nested-text"]');
  await flush(page, cap);

  const [ev] = clicks(cap);
  expect(ev).toBeTruthy();
  const p = ev.properties;
  expect(p.collection_source, '버튼 안의 span 클릭이 미선언(auto)으로 갔다').toBe('codegen');
  expect(p.verdict).toBe('usable');
  expect(p.ade_declaration).toMatchObject({ kind: 'control', name: 'ade_0000000000c5' });
});

test('요소가 없는 이벤트에는 직전 클릭의 선언이 묻지 않는다 (§9.2)', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.click('[data-case="product-1"]');
  // 스크롤 이벤트를 만든다 — 요소가 없으니 선언이 있으면 안 된다
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(600);
  await flush(page, cap);

  expect(clicks(cap).length).toBeGreaterThan(0);
  for (const ev of cap.events) {
    if (ev.event === '$ade_click' || ev.event === '$ade_impression') continue;
    expect(ev.properties.ade_declaration, `${ev.event} 에 선언이 묻었다`).toBeUndefined();
  }
});

test('실행 중 업무ID 가 255자를 넘으면 identity 에서 그 값만 빠진다 — 자르지 않는다 (DA-216)', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await page.click('[data-case="id-255"]');
  await flush(page, cap);
  await page.click('[data-case="id-256"]');
  await flush(page, cap);

  const [ok, over] = clicks(cap);
  expect(ok?.properties.ade_declaration.name).toBe('ade_0000000000c3');
  expect(over?.properties.ade_declaration.name).toBe('ade_0000000000c4');
  // 255 는 벤더 한도 안 — 그대로 실린다
  expect(ok.properties.ade_declaration.identity.item_id).toBe('L'.repeat(255));
  // 256 은 빠진다. 잘린 값('M' × 255)이 오면 다른 항목과 겹쳐 잘못 센다 — 부재가 낫다
  expect('item_id' in over.properties.ade_declaration.identity, '256자 업무ID 가 실렸다(잘려서라도)').toBe(false);
  expect(over.properties.ade_declaration.kind, '선언의 나머지는 그대로').toBe('object');
  // 등급 · 판정도 「업무ID 없음」과 같아야 한다 — 판정 뒤에 지우면 identity 는 비었는데 guaranteed · 정상 판정인 모순이 난다(리뷰)
  expect(ok.properties.collection_grade, '255자는 업무ID 가 있는 것').toBe('guaranteed');
  expect(over.properties.collection_grade, '256자는 업무ID 없음으로 판정돼야 한다').toBe('observed');
  expect(over.properties.verdict).toBe('needs_classification');
  expect(over.properties.verdict_reason, 'identity 결손 사유').toContain('ADE-507');
});
