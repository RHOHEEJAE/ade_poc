// @adestack/extensions — Mixpanel SDK 에 없는 기능을 확장으로 붙인다.
//
// 서비스는 이 하나만 설치하고 필요한 것을 골라 붙인다:
//
//   import { adesdk } from '@adestack/sdk';
//   import { impression, session, system } from '@adestack/extensions';
//   adesdk.init({ apiHost, extensions: [impression(), session(), system()] });
//
// 셋은 같은 모양(init(ctx) 가 손잡이를 돌려준다)이고 파일럿은 항상 같이 붙이므로 한 패키지다.
// 안 쓰는 것은 번들러가 뺀다.
//
//   impression/   노출 $ade_impression — 자기 이벤트를 보낸다(ctx.track). 선언을 읽으므로 @adestack/contract 를 쓴다
//   session/      세션 · 탭 · 순번 — 모든 이벤트에 세 값을 더한다(stamp). 무활동 전환은 $ade_session_change
//   system/       통신 결과 $ade_network · 웹 성능 $ade_web_vital — PerformanceObserver 로 읽기만 한다
//
// 확장은 코어도 벤더도 모른다. 코어가 넘기는 ExtensionContext(context.ts) 만 쓴다.
export { impression, startImpressionObserver } from './impression/index.js';
export { session } from './session/index.js';
export { system, startSystemObserver, VITALS } from './system/index.js';
