// api-host.spec.ts — apiHost 를 안 넘기면 어디로 나가는가 (DA-238)
//
//   서비스가 adesdk.init({ token }) 만 불러도 이벤트는 우리 수집 서버로 가야 한다.
//   수집 서버 주소는 SDK 가 알고 있고(DEFAULT_API_HOST), 쓰는 쪽은 필요할 때만 덮어쓴다.
//   우선순위: apiHost 옵션 > VITE_ADE_API_HOST > 기본값. 옵션은 app.js 의 모든 시험이 지나가므로
//   여기서는 기본값과 환경변수 두 칸만 본다.
//
//   실제 서버로는 한 건도 안 나간다 — Playwright 가 그 주소를 가로채 200 을 돌려준다.
//   CI 가 외부 서버 상태에 좌우되면 안 된다.

import { test, expect, type Page } from '@playwright/test';
import { captureImpressions } from './helpers';

const DEFAULT_API_HOST = 'https://ade-collector.vercel.app';

/** 기본 수집 서버로 가는 POST 를 가로채 경로만 모은다. CORS 헤더를 돌려줘야 XHR 이 성공으로 끝난다. */
async function captureDefaultHost(page: Page) {
  const paths: string[] = [];
  await page.route(`${DEFAULT_API_HOST}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') paths.push(new URL(req.url()).pathname);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Access-Control-Allow-Origin': req.headers()['origin'] ?? '*',
        'Access-Control-Allow-Credentials': 'true',
      },
      body: '{"status":1,"error":null}',
    });
  });
  return paths;
}

const clickAndFlush = async (page: Page) => {
  await page.click('button');
  await page.evaluate(() => (window as any).__verify.flush());
  await page.waitForTimeout(500);
};

test('apiHost 를 안 넘기면 기본 수집 서버 /track/ 으로 나간다', async ({ page }) => {
  const remote = await captureDefaultHost(page);
  const local = await captureImpressions(page);
  await page.goto('/default-host.html');
  await clickAndFlush(page);

  expect(remote.filter((p) => /^\/track\/?$/.test(p)), '기본 수집 서버로 track 이 안 갔다').not.toHaveLength(0);
  expect(local.batches, '상대 경로 /ade-collect 로 새어 나갔다').toBe(0);
});

test('VITE_ADE_API_HOST 가 있으면 기본값 대신 그리로 나간다', async ({ page }) => {
  const remote = await captureDefaultHost(page);
  const local = await captureImpressions(page);
  await page.goto('/env-host.html');
  await clickAndFlush(page);

  expect(local.batches, '환경변수 주소로 track 이 안 갔다').toBeGreaterThan(0);
  expect(remote, '환경변수가 있는데 기본 수집 서버로 갔다').toHaveLength(0);
});
