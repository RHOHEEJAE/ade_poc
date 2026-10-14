// app.js — 시험 페이지에서 도는 코드. esbuild 가 dist/app.js 로 묶는다.
//
//   두 판정기를 같은 DOM 에 나란히 세운다.
//
//     우리        @adestack/extensions 의 노출 관찰자(@adestack/sdk 에 붙인다). 결과는 네트워크로 나가고,
//                 Playwright 가 /ade-collect/track/ 을 가로채 읽는다.
//     Amplitude   @amplitude/plugin-autocapture-browser 의 노출 판정.
//                 결과는 window.__verify.amp 에 쌓인다. 네트워크로 나가지 않는다.
//
//   같은 요소를 두 판정기가 각자 보므로, 스크롤 한 번에 (우리 결과, Amplitude 결과)
//   한 쌍이 나온다. 사람 조작이 변수에서 빠진다 — 랩 compare 하네스와 같은 원리다.

import mixpanel from 'mixpanel-browser';
import { initAdeMixpanel, adesdk } from '@adestack/sdk'; // 옛 이름은 compat 시험 한 곳만
import { impression, session, system } from '@adestack/extensions';
import { trackExposure } from '@amplitude/plugin-autocapture-browser/lib/esm/autocapture/track-exposure.js';
import { createExposureObservable } from '@amplitude/plugin-autocapture-browser/lib/esm/observables.js';

// ── 빌드 식별자 ──────────────────────────────────────────────────────────
//   코드젠 빌드 플러그인이 변환하는 파일마다 맨 앞에 심는 것을 그대로 흉내 낸다(DA-136).
//   ESM 이라 위의 import(SDK 모듈)가 이 줄보다 **먼저** 평가된다 — SDK 가 모듈 최상위에서 이 값을
//   읽어 두면 비어 있다. SDK 는 이벤트를 만드는 시점에 읽는다(인계 계약 R6). init 호출은 이 줄 뒤다 —
//   플러그인이 변환한 파일 안에서 부르는 실제 순서와 같다(DA-201). common-fields 시험이 세 값과 보관소 이름을 본다.
globalThis.__ADE_BUILD__ = { applicationId: 'app_verify', buildId: 'verify', ruleVersion: '0.1.0' };

// ── 시험이 읽는 자리 ─────────────────────────────────────────────────────
window.__verify = {
  /** Amplitude 판정으로 노출된 요소의 data-case 목록. 순서대로 쌓인다 */
  amp: [],
  /** 페이지 자신이 살아 있음을 증명하는 값. 장애 격리 시험이 본다 */
  heartbeat: 0,
  /** 페이지에서 잡힌 오류. 비어 있어야 정상이다 */
  errors: [],
};
setInterval(() => { window.__verify.heartbeat += 1; }, 100);
window.addEventListener('error', (e) => window.__verify.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__verify.errors.push(String(e.reason)));

// ── 관찰 대상 — 두 판정기에 같은 선택자를 준다 ────────────────────────────
//
//   주의: @adestack/extensions 의 impression/core.js 가 만드는 선택자와 같아야 한다.
//      패키지가 그 함수를 내보내지 않아 여기 옮겨 적었다. SDK 쪽이 바뀌면 여기도 바꾼다.
//      같은 대상을 주지 않으면 「판정이 다르다」와 「대상이 다르다」가 섞여 비교가 안 된다.
const TARGET_SELECTOR = '[data-ade-kind="object"]:not([data-ade-impression="off"])';

// ── 장애 주입 — ?break=... 로 켠다 ─────────────────────────────────────────
//
//   SDK 가 기대는 브라우저 기능을 일부러 망가뜨린다. 그래도 페이지가 멀쩡해야 한다.
const brk = new URLSearchParams(location.search).get('break');
if (brk === 'storage') {
  // localStorage 가 막힌 브라우저(프라이빗 모드 등)
  Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });
} else if (brk === 'observer') {
  // IntersectionObserver 가 없는 환경
  delete window.IntersectionObserver;
} else if (brk === 'dom') {
  // 요소 하나가 읽을 때마다 던진다. SDK 가 선언을 읽는 자리에서 터진다.
  // 그 요소는 못 세더라도 나머지는 세야 하고, 페이지는 멀쩡해야 한다.
  const real = Element.prototype.getAttribute;
  Element.prototype.getAttribute = function (name) {
    if (real.call(this, 'data-case') === 'product-2' && name.startsWith('data-ade-')) {
      throw new Error('injected: getAttribute');
    }
    return real.call(this, name);
  };
}

// ── init 전 직접 결과 ── 서비스 코드가 순서를 잘못 잡은 상황. 터지지 않아야 하고, 호출은 버려진다(DA-205 · 협의안 7).
adesdk.track({ name: 'ade_000000000000', properties: { early: true } });
// init 전에 붙잡아 둔 참조 — 유틸 모듈이 최상위에서 `const { track } = window.adesdk` 를 해 두는 상황.
// init 뒤에 이 참조로 부른 것도 서버에 닿아야 한다(outcome.spec). 객체를 통째로 바꿔 끼우면 영원히 빈 함수만 부른다.
const earlyAdesdk = window.adesdk;
const { track: earlyTrack } = window.adesdk;
// init 전 로그인 — 순서를 잘못 잡은 서비스. 터지지 않고 버려져야 한다(identity.spec, DA-279)
adesdk.identify('M-early');
// init 전 Mixpanel 호환 입구 — 공통 속성은 버려지고 거부 여부는 false(compat.spec, DA-279 §10)
adesdk.register({ early_super: 1 });
window.__verify.optedOutBeforeInit = adesdk.has_opted_out_tracking();

// ── 우리 SDK ── 장애 주입(위) 뒤에 켠다. init 이 동기라 첫 페이지뷰가 이 줄 안에서 나간다.
//   노출 · 세션 · 시스템은 코어에 없다. 서비스가 붙이는 확장이다 — 실제 서비스가 쓰는 모양 그대로 붙인다.
// ?impression_ms=1500 — 노출 판정 시간을 늘린다. 「들어왔다가 150ms 안에 나간다」 같은 시험은 러너 속도에 따라
//   150ms 를 넘겨 버리므로, 그런 시험은 시간을 넉넉히 잡고 순서만 본다(impression-lifecycle.spec).
const impressionMs = Number(new URLSearchParams(location.search).get('impression_ms')) || 0;
const adeOpts = {
  // applicationId · buildId 는 넘기지 않는다 — 번들 전역 __ADE_BUILD__ 가 정본이다 (위)
  apiHost: '/ade-collect',
  token: 'verify-token',
  extensions: [impression(impressionMs ? { durationMs: impressionMs } : undefined), session(), system()],
};
// ?compat=1 — init 옵션 셋(DA-279 §10). 보호 필드(session_id · distinct_id · $insert_id · 자동수집 판별자 $mp_autocapture)는 목록에 있어도 지워지지 않아야 하고
//   tag2 만 지워진다. 거부 기본값이면 opt_in 전까지 한 건도 안 나간다(compat.spec)
if (new URLSearchParams(location.search).get('compat') === '1') {
  Object.assign(adeOpts, {
    debug: true,
    optOutTrackingByDefault: true,
    propertyBlacklist: ['session_id', 'distinct_id', '$insert_id', '$mp_autocapture', 'tag2'],
  });
}
// ?init=mixpanel · mixpanel-both — Mixpanel 모양 adesdk.init(token, config) 으로 켠다(compat.spec). 벤더는 같은 이름의 인스턴스를
//   다시 init 해도 처음 설정을 그대로 두므로(mixpanel.cjs.js:31189) 이 모양은 페이지의 첫 init 이어야 시험이 된다.
//   mixpanel       Mixpanel 이름(api_host · debug)은 읽고 벤더 설정(autocapture)은 무시한다
//   object-snake   객체 모양 + Mixpanel 이름
//   blank-token    빈 토큰 — 기본 토큰으로 떨어진다
//   mixpanel-both  우리 이름과 Mixpanel 이름을 다 주면 우리 이름이 이긴다 — 틀린 쪽이 이기면 /ade-collect 에 안 닿는다
const initMode = new URLSearchParams(location.search).get('init');
if (initMode === 'mixpanel') {
  adesdk.init('verify-token', { api_host: '/ade-collect', debug: true, autocapture: false });
} else if (initMode === 'object-snake') {
  // 객체 모양에 Mixpanel 이름을 섞어 쓴 흔한 실수 — Mixpanel 이름 넷은 읽고 나머지 벤더 설정은 무시한다
  adesdk.init({ token: 'verify-token', api_host: '/ade-collect', debug: true, autocapture: false });
} else if (initMode === 'blank-token') {
  // 빈 토큰은 토큰이 없는 것과 같다 — 토큰을 안 준 것처럼 기본 토큰으로 떨어져야 한다
  adesdk.init('  ', { apiHost: '/ade-collect' });
} else if (initMode === 'mixpanel-both') {
  adesdk.init('verify-token', {
    api_host: 'https://wrong.example', apiHost: '/ade-collect',
    property_blacklist: ['tag2'], propertyBlacklist: ['tag3'],
  });
} else {
  adesdk.init(adeOpts);
}
// 모듈 내보내기 adesdk 와 전역 window.adesdk 는 같은 객체다(identity.spec)
window.__verify.sameAdesdk = adesdk === window.adesdk;
// SPA 재init — 라우트 전환에서 같은 옵션으로 한 번 더 부르는 상황. 확장 객체도 같은 것을 다시 넘긴다.
// reinit 시험이 부른다 — 클릭 하나가 두 번 기록되면 안 된다.
window.__verify.reinit = () => adesdk.init(adeOpts);
// 옛 이름 initAdeMixpanel 은 adesdk.init 과 같은 함수다 — 이미 import 한 앱이 깨지지 않는지(compat.spec)
window.__verify.reinitViaLegacy = () => initAdeMixpanel(adeOpts);
// 벤더 설정값을 읽는다 — init 옵션이 벤더에 어떻게 넘어갔는지 보는 시험 전용
window.__verify.vendorConfig = (k) => mixpanel.ade?.get_config(k);
// 벤더 배치 큐를 지금 비운다. 시험의 flush() 가 부른다 — 5초 주기를 기다리면 마지막 요소의 노출이 다음 배치로
// 밀려 시험이 못 본다(CI 에서 실제로 났다). 벤더 내부(request_batchers)지만 시험 전용이고 SDK 코드는 안 쓴다.
window.__verify.flush = () => {
  try {
    return mixpanel.ade?.request_batchers?.events?.flush();
  } catch {
    return undefined;
  }
};

// ── 앱의 통신 ── 서비스 코드가 하는 fetch 하나. system 확장이 PerformanceObserver 로 읽어 $ade_network 를 낸다.
//   쿼리에 토큰을 일부러 넣는다 — 기록에는 경로만 남아야 한다(DA-206). 자기 수집 서버(/ade-collect) 요청은 안 잡힌다.
if (!brk) fetch('/api/products?token=secret-1').catch(() => {});

// ── 직접 결과 ── 서비스 코드가 부르는 모양 그대로. 이름은 빌드 변환이 심은 리터럴이다.
//   민감해 보이는 키(card_no)와 우리 스탬프 자리(application_id · record_type)를 일부러 넣는다 —
//   outcome 시험이 「민감 키는 빠지고 스탬프는 우리 값으로 덮인다」를 본다(DA-201).
//   객체 값(meta)은 빠지고, 이름 형식이 깨진 두 번째 호출은 아예 나가지 않는다(DA-203 · 기능정의서 02 §3).
if (!brk) {
  adesdk.track({
    name: 'ade_3f2a91c4d5e6',
    properties: {
      order_id: 'o-1', amount: 1200, card_no: '4111', application_id: 'spoof', record_type: 'system', meta: { a: 1 }, event_name: '결제완료', name: '운동화',
      // 255자 경계 — 벤더가 자르는 길이. 254 · 255 는 그대로, 256 은 속성째 빠져야 한다(DA-216). 서버 응답처럼 실행 중 값이라 코드젠이 못 본다
      len254: 'x'.repeat(254), len255: 'x'.repeat(255), len256: 'x'.repeat(256),
    },
  });
  adesdk.track({ name: 'Purchase Complete', properties: { order_id: 'o-2' } });
  // init 전에 붙잡아 둔 참조로 — 둘 다 서버에 닿아야 한다
  earlyAdesdk.track({ name: 'ade_00000000ee01', properties: { via: 'early-object' } });
  earlyTrack({ name: 'ade_00000000ee02', properties: { via: 'early-function' } });
  // Mixpanel 모양(첫 인자가 문자열) — FE 는 이벤트 이름을 짓지 않는다. 보내지 않고 진단만(결정 2026-09-04-02)
  adesdk.track('Purchase', { amount: 1 });
  adesdk.track('ade_3f2a91c4d5e8', { amount: 1 });
  window.__verify.trackingGlobal = typeof window.tracking; // 예전 전역은 없다(outcome.spec)
}

// ── Amplitude 판정 ────────────────────────────────────────────────────────
//
//   createExposureObservable 은 DOM 변경 알림용 observable 을 받는다.
//   시험 페이지는 DOM 이 바뀌지 않으므로 아무것도 내보내지 않는 것을 준다.
if (!brk) {
  const never = { subscribe: () => ({ unsubscribe() {} }) };
  const exposureObservable = createExposureObservable(never, [TARGET_SELECTOR]);
  trackExposure({
    allObservables: { exposureObservable },
    // Amplitude 는 CSS 경로를 넘기지만, 비교하기 쉽게 data-case 를 넘긴다.
    // 판정 로직에는 영향이 없다 — 이 값은 판정 뒤에 보고에만 쓰인다.
    dataExtractor: { getElementPath: (el) => el.getAttribute('data-case') ?? '(no-case)' },
    onExposure: (key) => window.__verify.amp.push(key),
    // 기본값 150ms 와 같다. 명시해 두면 무엇과 비교하는지 읽힌다.
    exposureDuration: 150,
  });
}
