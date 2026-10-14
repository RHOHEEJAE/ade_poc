// system.spec.ts — @adestack/extensions 의 system 확장이 실브라우저에서 통신 결과 · 웹 성능을 내는가.
//
//   규칙(주소 정리 · 자기 서버 제외 · 반올림)은 packages/system/test 가 고정한다. 여기서는 PerformanceObserver 가
//   실제로 항목을 주는지, 자기 수집 서버 요청이 빠지는지, 쿼리가 안 실리는지를 본다.
//   fixture/app.js 가 init 뒤 `fetch('/api/products?token=secret-1')` 을 한 번 한다.

import { test, expect } from '@playwright/test';
import { captureImpressions, flush } from './helpers';

test('앱의 fetch 는 $ade_network 로 잡히고, 쿼리는 빠지며, 자기 수집 서버 요청은 안 잡힌다', async ({ page }) => {
  // /api/products 에 응답을 준다 — 실제 서버가 없다. system 은 응답 내용을 보지 않는다
  await page.route('**/api/products**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.waitForTimeout(500); // PerformanceObserver('resource') 는 요청이 끝난 뒤 비동기로 항목을 준다
  await flush(page, cap);

  const net = cap.events.filter((e) => e.event === '$ade_network');
  expect(net.length, '$ade_network 가 한 건도 안 왔다').toBeGreaterThan(0);
  const paths = net.map((e) => e.properties.network_path as string);
  expect(paths.some((p) => p.endsWith('/api/products')), '앱의 fetch 가 안 잡혔다: ' + paths.join(', ')).toBe(true);
  expect(paths.every((p) => !p.includes('?') && !p.includes('secret')), '쿼리가 실렸다: ' + paths.join(', ')).toBe(true);
  expect(paths.some((p) => p.includes('/ade-collect')), '자기 수집 서버 요청이 잡혔다 — 순환').toBe(false);
  for (const e of net) {
    expect(e.properties.record_type).toBe('system');
    expect(e.properties.collection_grade).toBe('observed');
    expect(e.properties.collection_source).toBe('auto');
    expect(e.properties.application_id, '시스템 기록에도 앱 식별자').toBe('app_verify');
  }
});

test('웹 성능 — FCP · TTFB 는 페이지가 뜨면, LCP · CLS 는 떠날 때(pagehide) 한 번씩 온다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.waitForTimeout(500);
  await flush(page, cap); // flush 가 pagehide 를 흉내 내므로 LCP · CLS 가 여기서 확정된다

  const vitals = cap.events.filter((e) => e.event === '$ade_web_vital');
  const names = vitals.map((e) => e.properties.vital_name as string);
  for (const want of ['FCP', 'TTFB', 'CLS']) expect(names, want + ' 가 안 왔다: ' + names.join(',')).toContain(want);
  expect(new Set(names).size, '같은 지표가 두 번 왔다').toBe(names.length);
  for (const e of vitals) expect(typeof e.properties.vital_value).toBe('number');
});
