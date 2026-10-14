// identity.spec.ts — adesdk.identify · adesdk.reset 이 사용자 ID 를 싣고 지우며 순서를 지키는가(DA-279).
//
//   로그인 전 기록은 `$device:` 익명 ID, 로그인 뒤 기록은 사용자 ID 로 나간다. 로그인 · 로그아웃 기록은
//   즉시 전송하지 않고 대기열 끝에 넣은 뒤 대기열 전체를 보내므로, 앞서 쌓인 기록보다 먼저 닿지 않는다.
//   adesdk.reset() 은 벤더 reset() 을 부르지 않는다 — 이름만 같다. 기기 ID 와 유입 정보가 그대로여야 한다(결정 2026-09-03-02).

import { test, expect } from '@playwright/test';
import { captureImpressions, flush, probe, byTag, arrived, named } from './helpers';

test('adesdk.identify — 앞 기록은 익명, 뒤 기록은 사용자 ID. $ade_login 은 새 세션이고 앞서 쌓인 기록보다 늦게 닿는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await probe(page, 'before');
  await page.evaluate(() => (window as any).adesdk.identify('M-100234'));
  await flush(page, cap);
  await probe(page, 'after');
  await page.waitForTimeout(500);

  const before = byTag(cap, 'before');
  const after = byTag(cap, 'after');
  expect(String(before.distinct_id)).toMatch(/^\$device:/);
  expect('$user_id' in before, '로그인 전 기록에 사용자 ID').toBe(false);
  expect(after.distinct_id).toBe('M-100234');
  expect(after.$user_id).toBe('M-100234');
  expect(after.$device_id, '기기 ID 가 바뀌었다').toBe(before.$device_id);

  const logins = named(cap, '$ade_login');
  expect(logins).toHaveLength(1);
  const lp = logins[0].properties;
  expect(lp.distinct_id).toBe('M-100234');
  expect([lp.record_type, lp.collection_source, lp.collection_grade]).toEqual(['context', 'direct', 'guaranteed']);
  expect(lp.application_id).toBe('app_verify');
  expect(lp.session_id, '로그인은 새 세션이어야 한다').not.toBe(before.session_id);
  expect(after.session_id).toBe(lp.session_id);

  // 순서 — 로그인 전에 만들어진 대기열 기록(자동수집 · 확장)은 전부 $ade_login 보다 먼저 서버에 닿는다
  const loginAt = cap.events.indexOf(logins[0]);
  const anonQueued = cap.events.filter(
    (e) => String(e.properties?.distinct_id).startsWith('$device:') && e.event !== 'ade_00000000d279',
  );
  expect(anonQueued.length, '로그인 전 대기열 기록이 없다 — 시험이 순서를 못 본다').toBeGreaterThan(0);
  for (const e of anonQueued) expect(cap.events.indexOf(e), `${e.event} 가 $ade_login 뒤에 닿았다`).toBeLessThan(loginAt);

  expect(named(cap, '$identify'), '벤더 $identify 가 나갔다').toHaveLength(0);
  expect(named(cap, 'ade_00000000d279').some((e) => e.properties?.distinct_id === 'M-early'), 'init 전 identify 가 적용됐다').toBe(false);
  expect(await page.evaluate(() => (window as any).__verify.sameAdesdk), 'import 한 adesdk 와 window.adesdk 가 다르다').toBe(true);
  expect(await page.evaluate(() => typeof (window as any).tracking), 'window.tracking 이 남았다').toBe('undefined');
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});

test('기준 밖 사용자 ID 는 아무것도 바꾸지 않는다. 같은 ID 로 다시 identify 하면 기록 0, 다른 ID 는 한 건 더', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await probe(page, 'base');
  await page.evaluate(() => {
    const t = (window as any).adesdk;
    for (const bad of ['a@b.com', '   ', 'x'.repeat(256), '$device:abc', 123, null]) t.identify(bad);
  });
  await probe(page, 'bad');
  await page.evaluate(() => {
    const t = (window as any).adesdk;
    t.identify('M-1');
    t.identify('M-1');
  });
  // 새로고침 전에 대기열을 비운다 — 벤더 대기열은 보관소에 남아 다음 로드 때 다시 나가므로 $ade_login 이 두 번 셀 수 있다
  await flush(page, cap);
  await page.reload();
  await page.evaluate(() => (window as any).adesdk.identify('M-1')); // 새로고침 뒤에도 로그인 상태 — 기록 0
  await probe(page, 'reloaded');
  await page.evaluate(() => (window as any).adesdk.identify('M-2'));
  await flush(page, cap);

  expect(String(byTag(cap, 'bad').distinct_id)).toMatch(/^\$device:/);
  expect(byTag(cap, 'bad').session_id, '기준 밖 ID 가 세션을 바꿨다').toBe(byTag(cap, 'base').session_id);
  expect(byTag(cap, 'reloaded').distinct_id, '새로고침 뒤 로그인 상태가 풀렸다').toBe('M-1');
  const logins = named(cap, '$ade_login').map((e) => e.properties.distinct_id);
  expect(logins).toEqual(['M-1', 'M-2']);
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});

test('adesdk.reset — $ade_logout 은 기존 사용자 · 세션, 그 뒤는 같은 기기 ID 의 익명. 유입 정보는 그대로', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/?utm_source=da279', { referer: 'https://ref.example/landing' });
  await probe(page, 'anon');
  await page.evaluate(() => (window as any).adesdk.identify('M-100234'));
  await probe(page, 'in');
  await page.evaluate(() => (window as any).adesdk.reset());
  await flush(page, cap);
  await probe(page, 'out');
  await page.waitForTimeout(500);

  const anon = byTag(cap, 'anon');
  const inn = byTag(cap, 'in');
  const out = byTag(cap, 'out');
  const logouts = named(cap, '$ade_logout');
  expect(logouts).toHaveLength(1);
  const lo = logouts[0].properties;
  expect(lo.distinct_id, '로그아웃 기록은 기존 사용자').toBe('M-100234');
  expect(lo.session_id, '로그아웃 기록은 기존 세션').toBe(inn.session_id);
  expect([lo.record_type, lo.collection_source, lo.collection_grade]).toEqual(['context', 'direct', 'guaranteed']);

  expect(out.distinct_id, '로그아웃 뒤는 같은 기기의 익명 ID').toBe(anon.distinct_id);
  expect('$user_id' in out, '로그아웃 뒤에 사용자 ID 가 남았다').toBe(false);
  expect(out.$device_id).toBe(anon.$device_id);
  expect(out.session_id, '로그아웃 뒤는 새 세션').not.toBe(lo.session_id);
  // 벤더 reset() 을 불렀다면 여기서 지워진다
  expect(out.$initial_referrer).toBe('https://ref.example/landing');
  expect(out.$initial_referrer).toBe(anon.$initial_referrer);
  expect(out.utm_source).toBe('da279');
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});

test('로그인하지 않은 상태의 adesdk.reset 은 기록 0 · 기기 ID 그대로', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await probe(page, 'a');
  await page.evaluate(() => (window as any).adesdk.reset());
  await probe(page, 'b');
  await flush(page, cap);
  expect(named(cap, '$ade_logout')).toHaveLength(0);
  expect(byTag(cap, 'b').distinct_id).toBe(byTag(cap, 'a').distinct_id);
  expect(byTag(cap, 'b').session_id, '로그인하지 않았으면 세션도 그대로').toBe(byTag(cap, 'a').session_id);
});

test('adesdk.set_group — 이후 기록에 실리고 adesdk.reset 이 지운다. $ade_logout 은 기존 문맥', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).adesdk.identify('M-1'));
  await page.evaluate(() => (window as any).adesdk.set_group('company', 'hecto'));
  await probe(page, 'g1');
  await page.evaluate(() => (window as any).adesdk.reset());
  await flush(page, cap);
  await probe(page, 'g2');
  await arrived(page, cap, 'g1');
  await arrived(page, cap, 'g2');

  const g1 = byTag(cap, 'g1');
  const g2 = byTag(cap, 'g2');
  expect(g1.tag).toBe('g1');
  expect(g2.tag, 'g2 기록이 닿지 않았다').toBe('g2');
  expect(g1.company).toEqual(['hecto']);
  expect('company' in g2, '로그아웃 뒤에 그룹이 남았다').toBe(false);
  const logouts = named(cap, '$ade_logout');
  expect(logouts).toHaveLength(1);
  expect(logouts[0].properties.company, '로그아웃 기록은 기존 문맥').toEqual(['hecto']);
  expect(g2.session_id).not.toBe(g1.session_id);
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});

test('adesdk.set_group — 기준 밖 키 · 값은 아무것도 바꾸지 않는다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await probe(page, 'base');
  await page.evaluate(() => {
    const t = (window as any).adesdk;
    t.set_group('email', 'x');
    t.set_group('$x', 'x');
    t.set_group('session_id', 'x');
    t.set_group('ade_team', 'x');
    t.set_group('team', 'a@b.com');
    t.set_group('team', []);
    t.set_group('team', '');
  });
  await probe(page, 'after');
  await arrived(page, cap, 'base');
  await arrived(page, cap, 'after');

  const after = byTag(cap, 'after');
  expect(after.tag, 'after 기록이 닿지 않았다').toBe('after');
  for (const k of ['email', '$x', 'ade_team', 'team']) expect(k in after, `${k} 가 실렸다`).toBe(false);
  expect(after.session_id, '기준 밖 호출이 세션을 바꿨다').toBe(byTag(cap, 'base').session_id);
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});

test('adesdk.set_group — 새로고침 뒤에도 남고, 로그인하지 않은 상태의 adesdk.reset 도 그룹을 지운다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).adesdk.set_group('team', ['a', 2]));
  await flush(page, cap);
  await page.reload();
  await probe(page, 'r1');
  await page.evaluate(() => (window as any).adesdk.reset());
  await probe(page, 'r2');
  await arrived(page, cap, 'r1');
  await arrived(page, cap, 'r2');

  const r1 = byTag(cap, 'r1');
  const r2 = byTag(cap, 'r2');
  expect(r1.tag, 'r1 기록이 닿지 않았다').toBe('r1');
  expect(r2.tag, 'r2 기록이 닿지 않았다').toBe('r2');
  expect(r1.team).toEqual(['a', 2]);
  expect('team' in r2, '로그인하지 않은 reset 이 그룹을 안 지웠다').toBe(false);
  expect(named(cap, '$ade_logout')).toHaveLength(0);
  expect(r2.session_id).toBe(r1.session_id);
  expect(r2.distinct_id).toBe(r1.distinct_id);
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});

test('adesdk.set_group — 벤더가 저장하는 유입 · 내부 키는 덮지도 지우지도 못한다', async ({ page }) => {
  const cap = await captureImpressions(page);
  await page.goto('/?utm_source=da279');
  await page.evaluate(() => {
    const t = (window as any).adesdk;
    t.set_group('utm_source', 'x');
    t.set_group(' utm_source', 'x');
    t.set_group('search_engine', 'x');
    t.set_group('__mps', 'x');
  });
  await probe(page, 's1');
  await arrived(page, cap, 's1');
  expect(byTag(cap, 's1').tag).toBe('s1');
  expect(byTag(cap, 's1').utm_source, '그룹이 유입 키를 덮었다').toBe('da279');
  expect('search_engine' in byTag(cap, 's1')).toBe(false);
  await page.evaluate(() => (window as any).adesdk.reset());
  await probe(page, 's2');
  await arrived(page, cap, 's2');
  expect(byTag(cap, 's2').tag).toBe('s2');
  expect(byTag(cap, 's2').utm_source, 'reset 이 유입 키를 지웠다').toBe('da279');
  expect(await page.evaluate(() => (window as any).__verify.errors), '페이지 오류').toEqual([]);
});
