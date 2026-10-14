// equivalence.spec.ts — Amplitude 동등성 시험.
//
//   「우리 노출 판정이 Amplitude 와 같은가」에 답한다.
//   같은 DOM · 같은 관찰 대상 · 같은 스크롤에서 두 판정기가 각자 낸 결과를 대조한다.
//   Amplitude 쪽은 @amplitude/plugin-autocapture-browser 의 판정 코드 그대로다(fixture/app.js).
//
//   동등 = 노출로 판정한 요소 집합이 같다. 단, 문서에 적힌 의도적 차이는 예외로 등록하고
//   **그 차이가 실제로 나는지도 확인한다.** Amplitude 가 나중에 고치면 여기서 드러난다.

import { test, expect } from '@playwright/test';
import { captureImpressions, assertVisible, sweep, flush } from './helpers';

/**
 * 의도적 차이. 02-상세 05 문서와 sdk 의 impression/core.js 가 정한 것.
 *   화면보다 큰 요소는 Amplitude 의 threshold 1.0 에 닿을 수 없어 콜백이 오지 않는다.
 *   우리는 화면의 절반을 덮으면 인정한다.
 */
const KNOWN_DEVIATIONS: Record<string, { ours: 'exposed' | 'not'; amplitude: 'exposed' | 'not'; why: string }> = {
  'banner-big': { ours: 'exposed', amplitude: 'not', why: '화면보다 큰 요소는 100% 가 될 수 없어 Amplitude 는 잡지 못한다' },
};

test('같은 대상에 대해 Amplitude 와 같은 요소를 노출로 판정한다 — 등록된 차이만 빼고', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await assertVisible(page);

  await sweep(page);
  await flush(page, cap);

  // 요소마다 (data-case → 우리 열쇠) 대응표를 DOM 에서 만든다
  const table = await page.$$eval('[data-case]', (els) =>
    els.map((el) => {
      const name = el.getAttribute('data-ade-name') ?? '';
      const idKey = el.getAttribute('data-ade-id-key');
      const idVal = idKey ? el.getAttribute(`data-ade-${idKey.replace(/_/g, '-')}`) ?? '' : null;
      return { c: el.getAttribute('data-case')!, key: idVal === null ? name : `${name}#${idKey}=${idVal}` };
    }),
  );
  const keyOf = Object.fromEntries(table.map((r) => [r.c, r.key]));

  const ampExposed: string[] = await page.evaluate(() => (window as any).__verify.amp);
  const oursByKey = new Map<string, number>();
  for (const i of cap.list) oursByKey.set(i.key, (oursByKey.get(i.key) ?? 0) + 1);

  const report: string[] = [];
  const failures: string[] = [];

  for (const { c, key } of table) {
    const amp = ampExposed.includes(c) ? 'exposed' : 'not';
    const oursN = oursByKey.get(key) ?? 0;
    // 빈 업무ID 는 같은 열쇠를 여러 요소가 나눠 쓴다. 건수가 요소 수 이상이면 잡힌 것이다
    const sharers = table.filter((r) => r.key === key).length;
    const ours = oursN >= sharers ? 'exposed' : 'not';

    const dev = KNOWN_DEVIATIONS[c];
    if (dev) {
      report.push(`${c.padEnd(12)} 우리=${ours.padEnd(7)} Amplitude=${amp.padEnd(7)}  [등록된 차이] ${dev.why}`);
      if (ours !== dev.ours || amp !== dev.amplitude) {
        failures.push(`${c}: 등록된 차이와 다르다. 기대 우리=${dev.ours} Amplitude=${dev.amplitude}, 실제 우리=${ours} Amplitude=${amp}`);
      }
      continue;
    }
    report.push(`${c.padEnd(12)} 우리=${ours.padEnd(7)} Amplitude=${amp.padEnd(7)}  ${ours === amp ? '같음' : '다름'}`);
    if (ours !== amp) failures.push(`${c}: 우리=${ours} Amplitude=${amp}`);
  }

  console.log('\n' + report.join('\n') + '\n');
  expect(failures, failures.join('\n')).toHaveLength(0);
});
