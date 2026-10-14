// helpers.ts — 시험 셋이 함께 쓰는 손잡이.
import { test, type Page, type Request } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

export type Impression = {
  name: string;
  identity: Record<string, string>;
  /** name#k=v 형식. 우리 SDK 의 재발화 열쇠와 같은 모양이다 */
  key: string;
  raw: Record<string, unknown>;
};

/**
 * mixpanel-browser 가 보내는 본문(`data=<JSON>`)에서 이벤트 배열을 꺼낸다.
 * @param req Playwright 가 가로챈 요청.
 * @returns 이벤트 객체 배열. 본문이 없거나 풀 수 없으면 빈 배열.
 */
function decodeBatch(req: Request): Array<Record<string, any>> {
  const body = req.postData() ?? '';
  const data = new URLSearchParams(body).get('data');
  if (!data) return [];
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // api_payload_format 이 json 이 아니면 base64 로 온다
    const parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    return Array.isArray(parsed) ? parsed : [parsed];
  }
}

/**
 * SDK 가 수집 서버로 보내는 요청을 가로채 노출 이벤트만 모은다.
 *
 *   주의: 반드시 200 을 돌려준다. 다른 코드를 주면 SDK 가 그 배치를 버리거나 재시도해서
 *      시험 결과가 SDK 동작이 아니라 응답 코드에 좌우된다.
 *
 * @param page 시험 페이지. `page.goto` 전에 부른다.
 * @returns 모은 노출 `impressions`, 이벤트 전부 `events`, 배치 수 `batches`, 보고서 첨부 `attach`.
 */
export async function captureImpressions(page: Page) {
  const seen: Impression[] = [];
  /** SDK 가 보낸 이벤트 전부, 온 순서대로. 보고서에 그대로 첨부한다 */
  const events: Array<Record<string, any>> = [];
  /** `/diag` 로 나간 진단 본문 전부. 허용 3필드 밖이 새는지 보는 데 쓴다(DA-217) */
  const diags: Array<Record<string, any>> = [];
  let batches = 0;
  await page.route('**/ade-collect/**', async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    if (req.method() === 'POST' && /\/diag\/?$/.test(pathname)) {
      try {
        diags.push(JSON.parse(req.postData() ?? '{}'));
      } catch {
        diags.push({ __unparsable: req.postData() });
      }
    } else if (req.method() === 'POST' && /\/track\/?/.test(pathname)) {
      batches += 1;
      for (const ev of decodeBatch(req)) {
        events.push(ev);
        if (ev.event !== '$ade_impression') continue;
        const decl = ev.properties?.ade_declaration ?? {};
        const identity: Record<string, string> = decl.identity ?? {};
        const keys = Object.keys(identity).sort();
        const key = keys.length ? `${decl.name}#${keys.map((k) => `${k}=${identity[k]}`).join(',')}` : decl.name;
        seen.push({ name: decl.name, identity, key, raw: ev.properties });
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1,"error":null}' });
  });
  return {
    get list() { return seen; },
    get events() { return events; },
    get diags() { return diags; },
    get batches() { return batches; },
  };
}

export type Capture = Awaited<ReturnType<typeof captureImpressions>>;

/**
 * 렌더링이 실제로 돌고 있는지 확인한다. 아니면 IntersectionObserver 가 계산을 안 한다.
 * @param page 시험 페이지.
 * @throws 페이지가 `visible` 이 아니면.
 */
export async function assertVisible(page: Page) {
  const state = await page.evaluate(() => document.visibilityState);
  if (state !== 'visible') throw new Error(`페이지가 ${state} 상태다 — 관찰자가 돌지 않아 결과가 0건으로 나온다`);
}

/**
 * 모든 케이스 요소를 차례로 화면에 들인다.
 *
 *   요소마다 150ms(판정 시간) 보다 넉넉히 머문다. 큰 배너는 한가운데까지 내려가
 *   화면의 절반 이상을 덮게 한다.
 *
 * @param page 시험 페이지.
 * @param dwellMs 요소마다 머무는 시간(ms). 판정 시간 150ms 보다 커야 한다.
 */
export async function sweep(page: Page, dwellMs = 400) {
  const cases = await page.$$eval('[data-case]', (els) => els.map((e) => e.getAttribute('data-case')!));
  for (const c of cases) {
    await page.locator(`[data-case="${c}"]`).scrollIntoViewIfNeeded();
    if (c === 'banner-big') {
      // 배너 상단이 화면 상단에 오면 화면 전체가 배너다 — 절반 덮음 조건을 확실히 넘긴다
      await page.evaluate((sel) => {
        const el = document.querySelector(sel)!;
        window.scrollBy(0, el.getBoundingClientRect().top + 10);
      }, `[data-case="${c}"]`);
    }
    await page.waitForTimeout(dwellMs);
  }
  // 마지막 요소도 판정 시간을 채워야 한다. 느린 러너에서는 IntersectionObserver 알림이 수십 ms 늦게 와서,
  // 바로 flush 하면 마지막 요소의 노출이 배치에 못 들어가고 다음 5초 주기로 밀린다 — CI 에서 실제로 났다.
  await page.waitForTimeout(dwellMs);
  return cases;
}

/**
 * 배치 큐를 비우게 한다.
 *
 *   SDK 는 50건 또는 5초마다 보낸다. pagehide 를 흉내 내 떠날 때 지표(LCP · CLS)를 만들게 한 뒤,
 *   fixture 가 노출한 `__verify.flush()` 로 벤더 배치 큐를 그 자리에서 비운다. 벤더는 합성 pagehide
 *   (`persisted` 없음)로는 비우지 않아서, 예전처럼 5초 주기에 기대면 마지막 요소의 노출이 다음 배치로
 *   밀려 시험이 못 봤다. 한 번 더 비워 pagehide 로 들어온 지표까지 모은다.
 *
 * @param page 시험 페이지.
 * @param cap `captureImpressions` 가 돌려준 것. 배치 수가 늘 때까지 기다린다.
 * @param timeoutMs 최대 대기(ms). 넘기면 그냥 돌아온다 — 단언은 부른 쪽이 한다.
 */
export async function flush(page: Page, cap: Capture, timeoutMs = 7000) {
  const forceFlush = () => page.evaluate(() => (window as any).__verify?.flush?.());
  const waitBatch = async (from: number, maxMs: number) => {
    const t0 = Date.now();
    while (cap.batches === from && Date.now() - t0 < maxMs) await page.waitForTimeout(100);
  };
  const before = cap.batches;
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await forceFlush();
  await waitBatch(before, timeoutMs);
  // pagehide 로 방금 들어온 지표와 그 사이 발화한 노출을 한 번 더. 큐가 비어 있으면 요청이 안 오므로 짧게만 기다린다
  await page.waitForTimeout(300);
  const mid = cap.batches;
  await forceFlush();
  await waitBatch(mid, 1500);
  await page.waitForTimeout(200);
  await attachSdkOutput(cap);
}

/**
 * SDK 가 실제로 내보낸 것을 시험 결과에 첨부한다.
 *
 *   시험은 건수만 판정하지만, 사람은 본문을 보고 싶다 — 노출 이벤트의 속성이
 *   무엇이고 어떤 값이 실렸는지. HTML 보고서의 Attachments 에서 파일로 열리고,
 *   JUnit 에도 첨부 경로가 남는다. 손으로 옮겨 적는 문서 대신 도구가 남기는 것이다.
 */
async function attachSdkOutput(cap: Capture) {
  const info = test.info();
  // 파일로 써서 붙인다 — 그래야 test-results/ 에 남고 JUnit 에 경로가 찍힌다.
  // 메모리로 붙이면 HTML 보고서 안에만 들어간다.
  const files: Array<[string, unknown]> = [
    ['sdk-impressions.json', cap.list.map((i) => ({ key: i.key, properties: i.raw }))],
    ['sdk-all-events.json', cap.events],
  ];
  for (const [name, data] of files) {
    const file = info.outputPath(name);
    await writeFile(file, JSON.stringify(data, null, 2), 'utf8');
    await info.attach(name, { path: file, contentType: 'application/json' });
  }
}

/**
 * 열쇠별 건수를 센다. 같은 열쇠가 두 번이면 재발화다.
 * @param list 모은 노출.
 * @returns 열쇠 → 건수.
 */
export function countByKey(list: Impression[]) {
  const m = new Map<string, number>();
  for (const i of list) m.set(i.key, (m.get(i.key) ?? 0) + 1);
  return m;
}

// ── 직접 결과 탐침 ── 식별 · 호환 입구 시험이 같이 쓴다(DA-279). 탐침은 즉시 전송이라 그 순간의 사용자 · 세션 · 공통 속성이 실린다

/** 직접 결과 한 건을 지금 보낸다. 즉시 전송이라 그 순간의 사용자 · 세션이 실린다 */
export const probe = (page: Page, tag: string, extra: Record<string, unknown> = {}) =>
  page.evaluate(([t, x]) => (window as any).adesdk.track({ name: 'ade_00000000d279', properties: { ...x, tag: t } }), [tag, extra] as const);
export const byTag = (cap: Capture, tag: string) =>
  cap.events.find((e) => e.event === 'ade_00000000d279' && e.properties?.tag === tag)?.properties ?? {};
/** 그 tag 의 기록이 서버에 닿을 때까지 기다린다(전송 뒤 flush, 최대 5초). 안 닿으면 던진다 — 빈 값으로 조용히 통과하지 않게 */
export async function arrived(page: Page, cap: Capture, tag: string) {
  await flush(page, cap);
  const t0 = Date.now();
  while (!cap.events.some((e) => e.event === 'ade_00000000d279' && e.properties?.tag === tag)) {
    if (Date.now() - t0 > 5000) throw new Error(`probe ${tag} 가 닿지 않았다`);
    await page.waitForTimeout(100);
  }
}
/** 그 이름의 기록 전부, 닿은 순서대로 */
export const named = (cap: Capture, name: string) => cap.events.filter((e) => e.event === name);
