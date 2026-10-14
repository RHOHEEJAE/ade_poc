// common-fields.spec.ts — 모든 이벤트에 공통 필드가 실리는가.
//
//   세션 · 탭 · 순번은 코어가 아니라 확장 @adestack/extensions 의 session 이 붙인다(DA-202). fixture 가 session() 을 붙였으므로
//   여기서도 모든 이벤트에 요구한다 — 첫 페이지뷰를 포함해서. 확장 init 이 벤더 init 뒤로 밀리면 첫 건만 빠진다.
//
//   「어느 앱에서 온 기록인가」를 파이프라인이 붙이려면 이벤트마다 앱 식별자가 있어야 한다.
//   한 건이라도 빠지면 그 기록은 앱을 모른다. 특히 세션의 **첫** 이벤트(페이지뷰)는
//   벤더가 init 안에서 동기로 보내서, 붙이는 순서가 틀리면 그 한 건만 빠진다(DA-180).
//   단위 시험은 이 순서를 못 본다 — 벤더 init 을 실제로 돌려야 드러난다.
//
//   앱 · 빌드 식별자는 fixture 가 코드젠 플러그인처럼 globalThis.__ADE_BUILD__ 에 박는다. SDK 모듈이
//   그 줄보다 먼저 평가되므로, SDK 가 모듈 최상위에서 읽으면 세 값이 전부 빈다(인계 계약 R6).
//   이 시험이 통과하면 SDK 는 이벤트를 만드는 시점에 읽고 있는 것이다.
//
//   벤더 보관소 이름은 init 때 한 번 읽는다. init 은 동기이므로(DA-201) 스탬프 뒤에서 불러야 하고,
//   fixture 는 플러그인이 변환한 파일의 실제 순서대로 그렇게 한다. 'ade' 로 떨어지면 같은 출처의 앱끼리
//   localStorage 를 공유한다(DA-196) — 보관소 키도 함께 본다.

import { test, expect } from '@playwright/test';
import { captureImpressions, assertVisible, sweep, flush } from './helpers';

/** 모든 이벤트에 있어야 하는 필드와 기대값. fixture/app.js 의 __ADE_BUILD__ 와 같다 */
const REQUIRED = {
  application_id: 'app_verify',
  build_id: 'verify',
  rule_version: '0.1.0',           // DOM 을 찍은 플러그인의 규칙 버전. 번들에서 온다(DA-136)
  contract_version: /^\S+$/,      // DOM 을 읽은 계약 패키지 버전. 값은 SDK 가 정한다
  record_type: /^(behavior|system|context)$/, // 시스템 · 문맥 기록은 @adestack/extensions 의 system · session 확장이 낸다(DA-206)
  session_id: /^s_/,               // 이 셋은 @adestack/extensions 의 session 확장이 붙인다(DA-202)
  tab_id: /^t_/,
} as const;

test('SDK 가 보낸 모든 이벤트에 앱 식별자와 세션 · 탭 · 순번이 있다 — 첫 페이지뷰도', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);
  await sweep(page);
  await flush(page, cap);

  expect(cap.events.length, '이벤트가 한 건도 안 왔다').toBeGreaterThan(0);
  // 도착 순서는 생성 순서가 아니다 — 직접 결과는 즉시 전송이라 배치에 묶인 페이지뷰보다 먼저 온다(DA-201).
  // 페이지뷰가 있기만 하면 된다. 아래 루프가 그 건에도 필드를 요구한다.
  expect(cap.events.map((e) => e.event), '페이지뷰가 안 왔다').toContain('$ade_web_page_view');

  const missing: string[] = [];
  cap.events.forEach((ev, i) => {
    for (const [field, want] of Object.entries(REQUIRED)) {
      const got = ev.properties?.[field];
      const ok = want instanceof RegExp ? typeof got === 'string' && want.test(got) : got === want;
      if (!ok) missing.push(`#${i + 1} ${ev.event}: ${field} = ${JSON.stringify(got)}`);
    }
  });
  expect(missing, '\n' + missing.join('\n')).toHaveLength(0);

  // 순번은 한 탭 안에서 1 부터 빈틈없이 — 도착 순서는 생성 순서가 아니므로 정렬해서 본다
  const seq = cap.events.map((e) => e.properties?.sequence_no as number).sort((a, b) => a - b);
  expect(seq, '순번에 빈틈이 있다: ' + seq.join(',')).toEqual(seq.map((_, i) => i + 1));
  expect(new Set(cap.events.map((e) => e.properties?.tab_id)).size, '한 탭인데 tab_id 가 여럿').toBe(1);

  // 벤더 보관소 이름이 앱 식별자를 쓴다 — 'mp_' + persistence_name (DA-196).
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys, '보관소 키에 앱 식별자가 없다: ' + keys.join(', ')).toContain('mp_app_verify');
  expect(keys, "대체값 'ade' 로 떨어졌다").not.toContain('mp_ade');
});
