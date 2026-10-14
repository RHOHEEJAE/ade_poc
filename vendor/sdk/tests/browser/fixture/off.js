// off.js — SDK 를 끈 환경(VITE_ADE_MIXPANEL=0)을 재현한다(DA-197).
//
//   build-fixture.mjs 가 이 파일만 import.meta.env 를 { VITE_ADE_MIXPANEL: '0' } 로 박아 묶는다.
//   서비스 코드는 SDK 가 켜졌는지 모른 채 adesdk.track() 을 부른다 — 그 줄이 터지면 안 된다.

import { adesdk } from '@adestack/sdk';

window.__verify = { heartbeat: 0, errors: [], outcomeCalled: false, identityCalled: false };
setInterval(() => { window.__verify.heartbeat += 1; }, 100);
window.addEventListener('error', (e) => window.__verify.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__verify.errors.push(String(e.reason)));

adesdk.init({ apiHost: '/ade-collect', token: 'verify-token' });

// 결제 완료 자리에 박혀 있을 호출. SDK 가 꺼져 있어도 여기서 멈추면 안 된다.
adesdk.track({ name: 'ade_3f2a91c4d5e6', properties: { order_id: 'o-1' } });
adesdk.track('Purchase', { amount: 1 }); // Mixpanel 모양도 터지지 않는다
window.__verify.outcomeCalled = true;
window.__verify.trackingGlobal = typeof window.tracking; // 끈 환경에도 예전 전역은 없다
// 로그인 · 로그아웃 자리에 박혀 있을 호출도 같다(DA-279)
adesdk.identify('M-100234');
adesdk.set_group('company', 'hecto');
adesdk.reset();
window.__verify.identityCalled = true;
// Mixpanel 호환 입구도 같다 — 받아서 버린다(DA-279 §10)
adesdk.register({ plan: 'pro' });
adesdk.register_once({ first: 'y' });
adesdk.unregister('plan');
adesdk.time_event('ade_3f2a91c4d5e6');
adesdk.track_pageview({ page: 'pricing' });
adesdk.add_group('company', 'hecto');
adesdk.remove_group('company', 'hecto');
adesdk.opt_out_tracking();
adesdk.opt_in_tracking();
window.__verify.optedOut = adesdk.has_opted_out_tracking();
window.__verify.compatCalled = true;
