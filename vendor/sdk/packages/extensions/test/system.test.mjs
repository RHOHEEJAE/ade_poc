// node --test packages/system/test/system.test.mjs
//
//   DA-151 자동 시스템·문맥 기록의 판정 규칙을 고정한다. 구현 파일을 그대로 읽는다.
//   PerformanceObserver 배선(index.ts)은 실브라우저 관문(tests/browser)이 본다. DA-205 에서 확장 패키지로 되살렸다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACKED_INITIATORS,
  accumulateCls,
  isOwnEndpoint,
  roundVital,
  sanitizeUrl,
  toNetworkRecord,
} from '../src/system/core.js';

const BASE = 'https://shop.example.com/cart';

// ── 주소에서 쿼리·해시를 뗀다 ───────────────────────────────────────────────

test('쿼리와 해시를 싣지 않는다', () => {
  // 쿼리에 토큰·개인정보가 실려 있을 수 있다(DA-152 완료 조건).
  assert.equal(
    sanitizeUrl('https://api.example.com/v1/orders?token=SECRET&email=a@b.c#frag'),
    'https://api.example.com/v1/orders',
  );
});

test('주소에 박힌 자격증명도 빠진다', () => {
  assert.equal(sanitizeUrl('https://user:pw@api.example.com/v1/me'), 'https://api.example.com/v1/me');
});

test('해석할 수 없는 주소는 싣지 않는다', () => {
  assert.equal(sanitizeUrl('not a url'), null);
  assert.equal(sanitizeUrl(''), null);
  assert.equal(sanitizeUrl(undefined), null);
});

// ── 자기 수집 서버 제외 ─────────────────────────────────────────────────────

test('수집 서버로 나간 요청은 관찰하지 않는다 — 안 하면 순환한다', () => {
  const api = 'https://collect.example.com/ade-collect';
  assert.equal(isOwnEndpoint('https://collect.example.com/ade-collect/track/', api, BASE), true);
  assert.equal(isOwnEndpoint('https://collect.example.com/ade-collect', api, BASE), true);
});

test('경로 경계에서 끊는다 — ade-collect2 는 남의 것이다', () => {
  const api = 'https://collect.example.com/ade-collect';
  assert.equal(isOwnEndpoint('https://collect.example.com/ade-collect2/x', api, BASE), false);
});

test('상대 경로 api_host 도 같은 출처로 푼다', () => {
  assert.equal(isOwnEndpoint('https://shop.example.com/ade-collect/track/', '/ade-collect', BASE), true);
  assert.equal(isOwnEndpoint('https://shop.example.com/api/cart', '/ade-collect', BASE), false);
});

test('판정할 수 없으면 제외하는 쪽이다', () => {
  // api_host 설정이 깨진 경우다. 순환은 관측을 통째로 망가뜨리므로
  // 「모르면 관찰하지 않는다」로 간다 — 한 건 덜 세는 쪽이 낫다.
  assert.equal(isOwnEndpoint('https://api.example.com/v1', 'http://[', BASE), true);
});

test('api_host 가 없으면 아무것도 제외하지 않는다', () => {
  // 설정을 안 준 것과 깨진 것은 다르다. 안 준 것은 제외할 대상이 없다는 뜻이다.
  assert.equal(isOwnEndpoint('https://api.example.com/v1', '', BASE), false);
  assert.equal(isOwnEndpoint('https://api.example.com/v1', undefined, BASE), false);
});

// ── 통신 결과 기록 ──────────────────────────────────────────────────────────

const entry = (o) => ({ name: 'https://api.example.com/v1/cart?t=1', initiatorType: 'fetch', ...o });

test('fetch·xmlhttprequest 만 관찰한다', () => {
  assert.deepEqual(TRACKED_INITIATORS, ['fetch', 'xmlhttprequest']);
  assert.ok(toNetworkRecord(entry({ initiatorType: 'fetch' })));
  assert.ok(toNetworkRecord(entry({ initiatorType: 'xmlhttprequest' })));
  // 이미지·스크립트·폰트는 앱의 통신 결과가 아니다
  assert.equal(toNetworkRecord(entry({ initiatorType: 'img' })), null);
  assert.equal(toNetworkRecord(entry({ initiatorType: 'script' })), null);
});

test('남기는 필드는 넷뿐이다 — 본문·헤더는 없다', () => {
  const rec = toNetworkRecord(
    entry({ duration: 123.7, transferSize: 4096, responseStatus: 200 }),
    { apiHost: '/ade-collect', base: BASE },
  );
  assert.deepEqual(Object.keys(rec).sort(), [
    'network_duration_ms',
    'network_path',
    'network_status',
    'network_transfer_size',
  ]);
  assert.equal(rec.network_path, 'https://api.example.com/v1/cart', '쿼리가 떨어졌다');
  assert.equal(rec.network_duration_ms, 124);
});

test('responseStatus 를 모르면 필드를 만들지 않는다', () => {
  // 0 으로 채우면 「상태를 모른다」와 「0 을 받았다」가 구분되지 않는다(R1 과 같은 원칙).
  const noStatus = toNetworkRecord(entry({ duration: 10 }));
  assert.ok(!('network_status' in noStatus));

  const zero = toNetworkRecord(entry({ duration: 10, responseStatus: 0 }));
  assert.ok(!('network_status' in zero));
});

test('수집 서버로 간 요청은 기록을 만들지 않는다', () => {
  const own = toNetworkRecord(
    entry({ name: 'https://shop.example.com/ade-collect/track/?verbose=1' }),
    { apiHost: '/ade-collect', base: BASE },
  );
  assert.equal(own, null);
});

// ── 웹 성능 ─────────────────────────────────────────────────────────────────

test('CLS 는 사용자 입력 직후의 이동을 세지 않는다', () => {
  // 클릭으로 열린 메뉴가 화면을 미는 것은 불안정이 아니다.
  let cls = 0;
  cls = accumulateCls(cls, { value: 0.05 });
  cls = accumulateCls(cls, { value: 0.9, hadRecentInput: true }); // 무시
  cls = accumulateCls(cls, { value: 0.02 });
  assert.equal(Math.round(cls * 1000) / 1000, 0.07);
});

test('CLS 는 이상한 값에 흔들리지 않는다', () => {
  assert.equal(accumulateCls(1, { value: NaN }), 1);
  assert.equal(accumulateCls(1, { value: -5 }), 1);
  assert.equal(accumulateCls(1, null), 1);
});

test('CLS 만 소수를 남기고 나머지는 정수다', () => {
  assert.equal(roundVital('CLS', 0.123456), 0.123);
  assert.equal(roundVital('LCP', 2345.67), 2346);
  assert.equal(roundVital('TTFB', 88.2), 88);
  assert.equal(roundVital('LCP', NaN), null);
});
