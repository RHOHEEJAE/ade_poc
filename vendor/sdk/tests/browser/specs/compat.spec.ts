// compat.spec.ts — Mixpanel 문서의 입구를 `adesdk.*` 로 같은 모양으로 여는가(DA-279 스펙 §10).
//
//   입구마다 정상 한 사례와 기준 밖 한 사례를 본다. 기준 밖 입력은 기록을 바꾸지 않고 진단만 남긴다.
//   탐침(직접 결과)은 즉시 전송이라 그 순간의 공통 속성 · 그룹이 실린다 — 읽는 탐침은 모두 도착을 확인한다(arrived).
//   `track_links` · `track_forms` · `people` · `get_group` 은 만들지 않는다. `track` 은 업무 결과 입구다(2026-09-29 결정 — outcome.spec). Mixpanel 모양 문자열 호출은 보내지 않는다(결정 2026-09-04-02).

import { test, expect, type Page } from '@playwright/test';
import { captureImpressions, flush, probe, byTag, arrived, named, type Capture } from './helpers';

/** 벤더 보관소(localStorage `mp_app_verify`)를 읽는다. 시간 재기(`__timers`)처럼 기록에 안 실리는 상태를 본다 */
const vendorStore = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('mp_app_verify') ?? '{}') as Record<string, any>);
const errors = (page: Page) => page.evaluate(() => (window as any).__verify.errors);

/** 탐침 여럿이 모두 닿을 때까지 기다린다 — flush 한 번에 모아 본다(최대 5초). 하나라도 안 닿으면 던진다 */
async function arrivedAll(page: Page, cap: Capture, ...tags: string[]) {
  await flush(page, cap);
  const t0 = Date.now();
  for (;;) {
    const missing = tags.filter((t) => !cap.events.some((e) => e.event === 'ade_00000000d279' && e.properties?.tag === t));
    if (missing.length === 0) return;
    if (Date.now() - t0 > 5000) throw new Error(`probe ${missing.join(', ')} 가 닿지 않았다`);
    await page.waitForTimeout(100);
  }
}

/** 그 이름의 기록이 n 건 닿을 때까지 기다린다(최대 5초). 모자라면 던진다 */
async function arrivedCount(page: Page, cap: Capture, name: string, n: number) {
  await flush(page, cap);
  const t0 = Date.now();
  while (named(cap, name).length < n) {
    if (Date.now() - t0 > 5000) throw new Error(`${name} 가 ${n} 건 닿지 않았다(${named(cap, name).length})`);
    await page.waitForTimeout(100);
  }
}

test('register · register_once · unregister — 걸린 속성만 빼고 싣는다. 예약 키 unregister 는 무시, init 전 호출은 버린다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/?utm_source=da279');
  await probe(page, 'base');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.register({
      plan: 'pro',
      card_no: '4111', // 민감 키
      session_id: 'spoof', // 우리 필드
      utm_source: 'spoof', // 벤더 유입 키
      $os: 'spoof', // 벤더 예약
      ade_x: 1, // 접두어
      meta: { a: 1 }, // 값 형식
      long: 'x'.repeat(256), // 255자 넘음
    });
    a.register_once({ plan: 'free', first: 'y' }); // plan 은 이미 있어 그대로
    a.register('not-an-object');
  });
  await probe(page, 's1');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.unregister('plan');
    a.unregister('session_id'); // 예약 키 — 무시
    a.unregister('utm_source');
  });
  await probe(page, 's2');
  await arrivedAll(page, cap, 'base', 's1', 's2');

  const base = byTag(cap, 'base');
  const s1 = byTag(cap, 's1');
  const s2 = byTag(cap, 's2');
  expect(s1.plan).toBe('pro');
  expect(s1.first).toBe('y');
  for (const k of ['card_no', 'ade_x', 'meta', 'long']) expect(k in s1, `${k} 가 실렸다`).toBe(false);
  expect(s1.session_id, '공통 속성이 세션을 덮었다').toBe(base.session_id);
  expect(s1.utm_source, '공통 속성이 유입 키를 덮었다').toBe('da279');
  expect(s1.$os, '공통 속성이 벤더 예약 속성을 덮었다').toBe(base.$os);
  expect('early_super' in base, 'init 전 register 가 적용됐다').toBe(false);
  expect('plan' in s2, 'unregister 가 안 지웠다').toBe(false);
  expect(s2.first).toBe('y');
  expect(s2.session_id, '예약 키 unregister 가 세션을 지웠다').toBe(base.session_id);
  expect(s2.utm_source, '예약 키 unregister 가 유입 키를 지웠다').toBe('da279');
  // unregister 는 목록에서 빼지 않는다 — 벤더는 한 벌만 지우므로 reset 이 남은 벌을 지울 수 있어야 한다. 목록 이름은 앱별(보관소 이름과 같은 앱 식별자)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ade.super_keys:app_verify') ?? '[]'))).toEqual(['plan', 'first']);
  expect(await page.evaluate(() => localStorage.getItem('ade.super_keys')), '앱 구분 없는 목록 이름을 썼다').toBeNull();
  expect(await page.evaluate(() => (window as any).__verify.optedOutBeforeInit), 'init 전 has_opted_out_tracking').toBe(false);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('adesdk.reset 이 공통 속성 · 그룹을 지운다 — 로그인 상태는 $ade_logout 에 기존 문맥, 새로고침 뒤에도', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.identify('M-1');
    a.register({ plan: 'pro' });
    a.register({ tmp: 'mem' }, { persistent: false }); // 보관소에 안 적는 공통 속성도 지운다
    a.add_group('company', 'hecto');
  });
  await probe(page, 'r1');
  await page.evaluate(() => (window as any).adesdk.reset());
  await flush(page, cap);
  await probe(page, 'r2');
  // 로그인하지 않은 상태 — 새로고침 뒤에 세운 공통 속성도 지운다
  await page.evaluate(() => (window as any).adesdk.register({ plan: 'basic' }));
  await flush(page, cap);
  await page.reload();
  await probe(page, 'r3');
  await page.evaluate(() => (window as any).adesdk.reset());
  await probe(page, 'r4');
  await arrivedAll(page, cap, 'r1', 'r2', 'r3', 'r4');

  const r1 = byTag(cap, 'r1');
  expect([r1.plan, r1.tmp, r1.company]).toEqual(['pro', 'mem', ['hecto']]);
  const logouts = named(cap, '$ade_logout');
  expect(logouts).toHaveLength(1);
  expect([logouts[0].properties.plan, logouts[0].properties.company], '로그아웃 기록은 기존 문맥').toEqual(['pro', ['hecto']]);
  const r2 = byTag(cap, 'r2');
  for (const k of ['plan', 'tmp', 'company']) expect(k in r2, `로그아웃 뒤에 ${k} 가 남았다`).toBe(false);
  expect(byTag(cap, 'r3').plan, '새로고침 뒤 공통 속성이 사라졌다').toBe('basic');
  expect('plan' in byTag(cap, 'r4'), '로그인하지 않은 reset 이 공통 속성을 안 지웠다').toBe(false);
  expect(named(cap, '$ade_logout'), '로그인하지 않은 reset 이 기록을 냈다').toHaveLength(1);
  expect(await page.evaluate(() => [localStorage.getItem('ade.super_keys:app_verify'), localStorage.getItem('ade.group_keys:app_verify')])).toEqual([null, null]);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('time_event — 다음 같은 이름 기록에 $duration. 기준 밖 이름은 시간을 재지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    for (const bad of ['', '   ', 'x'.repeat(256), 123, null]) a.time_event(bad);
  });
  expect(Object.keys((await vendorStore(page)).__timers ?? {}), '기준 밖 이름이 시간 재기를 시작했다').toEqual([]);
  await page.evaluate(() => (window as any).adesdk.time_event('ade_00000000d279'));
  expect(Object.keys((await vendorStore(page)).__timers ?? {})).toEqual(['ade_00000000d279']);
  await page.waitForTimeout(300);
  await probe(page, 't1');
  await probe(page, 't2');
  await arrivedAll(page, cap, 't1', 't2');
  expect(byTag(cap, 't1').$duration).toBeGreaterThanOrEqual(0.25);
  expect('$duration' in byTag(cap, 't2'), '시간 재기는 한 번만').toBe(false);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('track_pageview — 자동수집 페이지뷰와 같은 필드(collection_source: auto, 등급 없음). 걸린 속성만 빠진다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await arrivedCount(page, cap, '$ade_web_page_view', 1);
  await page.evaluate(() =>
    (window as any).adesdk.track_pageview({ page: 'pricing', card_no: '4111', collection_source: 'direct', meta: { a: 1 } }),
  );
  await page.evaluate(() => (window as any).adesdk.track_pageview('not-an-object'));
  await arrivedCount(page, cap, '$ade_web_page_view', 3);

  const [auto, manual, bare] = named(cap, '$ade_web_page_view').map((e) => e.properties);
  expect(manual.page).toBe('pricing');
  for (const k of ['card_no', 'meta']) expect(k in manual, `${k} 가 실렸다`).toBe(false);
  expect([manual.record_type, manual.collection_source, 'collection_grade' in manual]).toEqual(['behavior', 'auto', false]);
  expect(Object.keys(manual).filter((k) => k !== 'page').sort(), '수동 페이지뷰 필드가 자동수집과 다르다').toEqual(Object.keys(auto).sort());
  expect(Object.keys(bare).sort()).toEqual(Object.keys(auto).sort());
  expect(manual.session_id).toBe(auto.session_id);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('add_group · remove_group — 값 하나씩 더하고 뺀다. 기준 밖 키 · 값은 아무것도 바꾸지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.add_group('team', 'a');
    a.add_group('team', 2);
    a.add_group('team', 'a'); // 이미 있다
    for (const [k, v] of [['email', 'x'], ['$x', 'x'], ['session_id', 'x'], ['team', 'a@b.com'], ['team', ['c']], ['team', '']]) a.add_group(k, v);
  });
  await probe(page, 'g1');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.remove_group('team', 'a');
    a.remove_group('ade_team', 'a'); // 기준 밖 키
    a.remove_group('team', 'zzz'); // 없는 값
  });
  await probe(page, 'g2');
  await page.evaluate(() => (window as any).adesdk.remove_group('team', 2));
  await probe(page, 'g3');
  await arrivedAll(page, cap, 'g1', 'g2', 'g3');

  const g1 = byTag(cap, 'g1');
  expect(g1.team).toEqual(['a', 2]);
  for (const k of ['email', '$x']) expect(k in g1, `${k} 가 실렸다`).toBe(false);
  const g2 = byTag(cap, 'g2');
  expect(g2.team).toEqual([2]);
  // 벤더 remove_group 은 남은 목록을 `{group_key: …}` 로 register 하고 원래 키는 그대로 둔다(`mixpanel.cjs.js:29994`) — 둘 다 막는다
  expect('group_key' in g2, '벤더 remove_group 의 group_key 속성이 실렸다').toBe(false);
  expect('team' in byTag(cap, 'g3'), '마지막 값을 빼면 키가 사라진다').toBe(false);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ade.group_keys:app_verify') ?? '[]'))).toEqual(['team']);
  expect(await page.evaluate(() => localStorage.getItem('ade.group_keys')), '앱 구분 없는 목록 이름을 썼다').toBeNull();
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('opt_out_tracking 뒤 /track 0건, opt_in_tracking 뒤 다시 나간다. has_opted_out_tracking 이 상태를 돌려준다', async ({ page }) => {
  // 거부 구간은 요청이 없어 flush 가 최대 대기를 쓰고, 도착 확인을 여러 번 한다 — 기본 30초로는 느린 러너에서 모자란다
  test.setTimeout(60_000);
  const cap = await captureImpressions(page);
  await page.goto('/');
  await probe(page, 'before');
  await arrived(page, cap, 'before');
  await page.evaluate(() => (window as any).adesdk.opt_out_tracking());
  expect(await page.evaluate(() => (window as any).adesdk.has_opted_out_tracking())).toBe(true);
  const batches = cap.batches;
  const count = cap.events.length;
  await probe(page, 'out');
  await page.evaluate(() => (window as any).adesdk.track_pageview({ page: 'x' }));
  await page.locator('[data-case]').first().click();
  await flush(page, cap, 2000); // 거부 중이라 요청이 안 온다 — 최대 대기를 짧게
  await page.waitForTimeout(500);
  expect(cap.batches, '거부 뒤에 /track 요청이 나갔다').toBe(batches);
  expect(cap.events.length).toBe(count);

  await page.evaluate(() => (window as any).adesdk.opt_in_tracking());
  expect(await page.evaluate(() => (window as any).adesdk.has_opted_out_tracking())).toBe(false);
  await probe(page, 'in');
  await arrived(page, cap, 'in');
  expect(cap.events.some((e) => e.properties?.tag === 'out'), '거부 중 기록이 나중에 나갔다').toBe(false);
  // 같은 페이지 안에서는 기기 ID 가 그대로다 — 벤더는 거부 때 보관소를 지우지만 메모리 값을 다시 저장한다. 새로 생기는 것은 거부 중 새로고침했을 때다
  expect(byTag(cap, 'in').$device_id).toBe(byTag(cap, 'before').$device_id);
  // 해제 때 벤더가 보내는 $opt_in 은 문맥 전환 — $ade_login · $ade_logout 과 같은 분류
  await arrivedCount(page, cap, '$opt_in', 1); // 탐침과 다른 요청으로 올 수 있다 — 닿을 때까지 기다린다
  const optIns = named(cap, '$opt_in');
  expect(optIns).toHaveLength(1);
  const oi = optIns[0].properties;
  expect([oi.record_type, oi.collection_source, oi.collection_grade]).toEqual(['context', 'direct', 'guaranteed']);
  expect(oi.application_id).toBe('app_verify');
  // 이름 · 속성을 바꾸는 벤더 옵션은 받지 않는다 — FE 가 이름을 정하는 track() 이 되지 않게
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.opt_out_tracking();
    a.opt_in_tracking({ track_event_name: 'Signed Up', track_properties: { plan: 'pro' } });
  });
  await arrivedCount(page, cap, '$opt_in', 2);
  expect(named(cap, 'Signed Up'), '벤더 옵션으로 이름을 정했다').toHaveLength(0);
  expect('plan' in named(cap, '$opt_in')[1].properties).toBe(false);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('init 옵션 — optOutTrackingByDefault 면 opt_in 전까지 0건, propertyBlacklist 는 보호 필드를 빼고 넘긴다, debug 는 벤더로', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/?compat=1');
  await page.waitForTimeout(500);
  await flush(page, cap, 2000); // 거부 기본값이라 요청이 안 온다 — 최대 대기를 짧게
  expect(cap.batches, '거부 기본값인데 /track 이 나갔다').toBe(0);
  const cfg = (k: string) => page.evaluate((key) => (window as any).__verify.vendorConfig(key), k);
  expect(await cfg('property_blacklist'), '보호 필드가 벤더 목록에 남았다').toEqual(['tag2']);
  expect(await cfg('debug')).toBe(true);
  expect(await cfg('opt_out_tracking_by_default')).toBe(true);
  expect(await page.evaluate(() => (window as any).adesdk.has_opted_out_tracking())).toBe(true);

  await page.evaluate(() => (window as any).adesdk.opt_in_tracking());
  await probe(page, 'c1', { tag2: 'secret' });
  await arrived(page, cap, 'c1');
  const c1 = byTag(cap, 'c1');
  expect('tag2' in c1, '목록의 속성이 안 지워졌다').toBe(false);
  expect(c1.session_id, '보호 필드 session_id 가 지워졌다').toBeTruthy();
  expect(c1.distinct_id, '보호 필드 distinct_id 가 지워졌다').toBeTruthy();
  expect(c1.$insert_id, '보호 필드 $insert_id 가 지워졌다').toBeTruthy();
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('옛 이름 initAdeMixpanel 도 adesdk.init 과 같다 — 다시 불러도 기록은 한 벌', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__verify.reinitViaLegacy());
  await probe(page, 'i1');
  await arrived(page, cap, 'i1');
  expect(cap.events.filter((e) => e.properties?.tag === 'i1')).toHaveLength(1);
  expect(byTag(cap, 'i1').application_id).toBe('app_verify');
  expect(await page.evaluate(() => typeof (window as any).adesdk.track), 'adesdk.track 이 없다(DA-279 · 2026-09-29 결정)').toBe('function');
  for (const k of ['track_links', 'track_forms', 'people', 'get_group']) {
    expect(await page.evaluate((m) => typeof (window as any).adesdk[m], k), `만들지 않는 입구 ${k} 가 있다`).toBe('undefined');
  }
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('adesdk.init(token, config) — Mixpanel 모양도 받는다. Mixpanel 이름(api_host · debug)은 읽고 나머지 벤더 설정은 무시한다', async ({ page }) => {
  const cap = await captureImpressions(page);
  const cfg = (k: string) => page.evaluate((key) => (window as any).__verify.vendorConfig(key), k);
  await page.goto('/?init=mixpanel');
  expect(await cfg('api_host')).toBe('/ade-collect');
  expect(await cfg('token')).toBe('verify-token');
  expect(await cfg('debug'), 'Mixpanel 이름 debug 를 안 읽었다').toBe(true);
  expect((await cfg('autocapture'))?.click, '무시해야 할 autocapture: false 가 벤더로 갔다').toBe(true);
  await probe(page, 'm1');
  await arrived(page, cap, 'm1');
  await arrivedCount(page, cap, '$ade_web_page_view', 1); // 자동수집이 켜져 있다
  const clicks = named(cap, '$ade_click').length;
  await page.locator('[data-case]').first().click();
  await arrivedCount(page, cap, '$ade_click', clicks + 1);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('adesdk.init(token, config) — 우리 이름과 Mixpanel 이름을 다 주면 우리 이름이 이긴다', async ({ page }) => {
  const cap = await captureImpressions(page);
  const cfg = (k: string) => page.evaluate((key) => (window as any).__verify.vendorConfig(key), k);
  await page.goto('/?init=mixpanel-both');
  expect(await cfg('api_host')).toBe('/ade-collect');
  expect(await cfg('property_blacklist')).toEqual(['tag3']);
  await probe(page, 'm2', { tag2: 'a', tag3: 'b' });
  await arrived(page, cap, 'm2');
  expect([byTag(cap, 'm2').tag2, 'tag3' in byTag(cap, 'm2')]).toEqual(['a', false]);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('벤더가 주소에서 싣는 페이지 · 클릭 ID 키는 register · track_pageview · 그룹이 덮지 못한다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/?gclid=g1');
  await arrivedCount(page, cap, '$ade_web_page_view', 1);
  await probe(page, 'k0');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.register({ gclid: 'x', current_url_path: '/x', fbclid: 'x', ok_key: 1 });
    a.register_once({ current_domain: 'evil.example' });
    a.set_group('gclid', 'x');
    a.add_group('current_page_title', 'x');
    a.track_pageview({ current_url_path: '/x', gclid: 'y', current_url_search: '?z', page: 'p' });
  });
  await probe(page, 'k1');
  await arrivedCount(page, cap, '$ade_web_page_view', 2);
  await arrivedAll(page, cap, 'k0', 'k1');

  const [auto, manual] = named(cap, '$ade_web_page_view').map((e) => e.properties);
  expect(auto.gclid, '시험 전제 — 주소의 gclid 가 자동수집 페이지뷰에 없다').toBe('g1');
  expect([manual.current_url_path, manual.gclid, manual.current_url_search, manual.page]).toEqual(['/', 'g1', '?gclid=g1', 'p']);
  const k0 = byTag(cap, 'k0');
  const k1 = byTag(cap, 'k1');
  expect(k1.ok_key).toBe(1);
  for (const k of ['gclid', 'current_url_path', 'fbclid', 'current_domain', 'current_page_title']) {
    expect(k1[k], `${k} 가 바뀌었다`).toEqual(k0[k]);
  }
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('수집 거부 입구의 저장소 · 쿠키 옵션은 받지 않는다 — 거부 상태는 localStorage 에만', async ({ page }) => {
  await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() =>
    (window as any).adesdk.opt_out_tracking({ persistence_type: 'cookie', cookie_prefix: 'zz_', cookie_expiration: 1, cross_subdomain_cookie: true, secure_cookie: true }),
  );
  const st = await page.evaluate(() => ({
    cookie: document.cookie,
    ls: Object.keys(localStorage).filter((k) => k.includes('opt_in_out')),
    out: (window as any).adesdk.has_opted_out_tracking({ persistence_type: 'cookie', cookie_prefix: 'zz_' }),
  }));
  expect(st.cookie, '거부 상태가 쿠키로 갔다').not.toContain('opt_in_out');
  expect(st.ls).toEqual(['__mp_opt_in_out_verify-token']);
  expect(st.out, 'has_opted_out_tracking 이 쿠키를 봤다').toBe(true);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('adesdk.init 의 빈 토큰은 토큰이 없는 것과 같다 — 기본 토큰으로 떨어진다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/?init=blank-token');
  expect(await page.evaluate(() => (window as any).__verify.vendorConfig('token'))).toBe('ade-demo-token');
  await probe(page, 'b1');
  await arrived(page, cap, 'b1');
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('unregister 가 한 벌만 지워도 reset 이 남은 공통 속성을 지운다 — 보관소 · 페이지 두 벌', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => {
    const a = (window as any).adesdk;
    a.register({ tmp: 1 }, { persistent: false }); // 페이지 안에만
    a.unregister('tmp'); // 벤더 기본값은 보관소 쪽만 지운다 — 페이지 쪽 tmp 는 남는다(벤더 그대로)
  });
  await probe(page, 'u1');
  await page.evaluate(() => (window as any).adesdk.reset());
  await probe(page, 'u2');
  await arrivedAll(page, cap, 'u1', 'u2');
  expect(byTag(cap, 'u1').tmp, '시험 전제 — 벤더 unregister 가 페이지 쪽도 지웠다').toBe(1);
  expect('tmp' in byTag(cap, 'u2'), 'reset 이 unregister 뒤 남은 공통 속성을 안 지웠다').toBe(false);
  expect(await errors(page), '페이지 오류').toEqual([]);
});

test('adesdk.init({ ... }) 객체 모양도 Mixpanel 이름을 읽고 나머지 벤더 설정은 무시한다', async ({ page }) => {
  const cap = await captureImpressions(page);
  const cfg = (k: string) => page.evaluate((key) => (window as any).__verify.vendorConfig(key), k);
  await page.goto('/?init=object-snake');
  expect(await cfg('api_host'), '객체 모양의 api_host 를 안 읽었다').toBe('/ade-collect');
  expect(await cfg('debug')).toBe(true);
  expect((await cfg('autocapture'))?.click, '무시해야 할 autocapture: false 가 벤더로 갔다').toBe(true);
  await probe(page, 'o1');
  await arrived(page, cap, 'o1');
  expect(await errors(page), '페이지 오류').toEqual([]);
});
