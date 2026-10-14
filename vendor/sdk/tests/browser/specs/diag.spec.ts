// diag.spec.ts — 진단으로 서버에 나가는 것이 허용 3필드뿐인가(협의안 LC-006 6번 · DA-217).
//
//   fixture/app.js 가 일부러 진단을 여러 건 만든다 — init 전 outcome 호출, 민감 키(card_no), 객체 값(meta),
//   예약 키(event_name), 256자 값(len256), 형식 깨진 이름('Purchase Complete'). SDK 는 그 사유를 브라우저 안에서
//   중복 제거용으로만 쓰고, /diag 본문에는 종류 · 라이브러리 버전 · 앱 식별자만 싣는다(개발명세 01 §6.4 · 05 §6.4).
//   버린 키 이름 · 값 · 사유 문자열이 본문 어디에도 없어야 한다 — 진단으로 값이 새면 빼낸 의미가 없다.

import { test, expect } from '@playwright/test';
import { captureImpressions, flush } from './helpers';

const ALLOWED = ['application_id', 'kind', 'lib_version'];
const KINDS = ['transmission_failure', 'storage_blocked', 'internal_exception'];

test('/diag 본문은 kind · lib_version · application_id 세 키뿐이고 버린 키 · 값 · 사유가 새지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await flush(page, cap);

  // fixture 가 일으킨 사유가 여럿이니 최소 한 건은 나가야 한다 — 0건이면 시험이 아무것도 안 본 것
  expect(cap.diags.length, '진단이 한 건도 안 나갔다').toBeGreaterThan(0);

  for (const body of cap.diags) {
    expect(Object.keys(body).sort(), '허용 3필드 밖의 키가 있다').toEqual(ALLOWED);
    expect(KINDS, `kind 가 종류 이름이 아니다: ${body.kind}`).toContain(body.kind);
    expect(body.application_id).toBe('app_verify');
    expect(typeof body.lib_version).toBe('string');
  }

  // 사유 · 키 이름 · 값 — 본문 전체를 문자열로 펴서 없는지 본다
  const text = JSON.stringify(cap.diags);
  for (const leak of ['outcome_', 'card_no', 'meta', 'event_name', 'len256', 'Purchase Complete', '4111', 'xxxxxxxx']) {
    expect(text, `진단 본문에 「${leak}」 가 새어 나갔다`).not.toContain(leak);
  }

  const errors = await page.evaluate(() => (window as any).__verify.errors);
  expect(errors, '페이지 오류').toEqual([]);
});
