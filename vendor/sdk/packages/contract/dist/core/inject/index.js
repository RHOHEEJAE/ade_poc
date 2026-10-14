// @adestack/core/inject — Babel 을 쓸 수 없는 스택의 런타임 폴백 진입점.
//
// Vue, 순수 HTML, JSP 에서는 빌드타임 주입을 쓸 수 없다(02 빌드 주입 §7-1).
// 선언은 스택과 무관하게 FE 가 `data-ade-*` 속성으로 적으므로 입력은 같다.
// 조상 목록을 소스 트리가 아니라 DOM 트리에서 만드는 것만 다르다(DA-104).
// 접는 규칙은 빌드 경로와 같은 `foldSlots` 정본을 쓴다.
//
// 계약 패키지(`@adestack/core/contract`)는 부작용이 없는 순수 함수 넷이다.
// 이 진입점은 DOM 을 고치고 `MutationObserver` 를 등록한다.
// 둘을 나눈 이유는 docs/설계/주입-시점과-폴백.md 에 있다(03 SDK 인계 계약 §1-4, 04 검증 전략 §7).
//
// 지원 스택에서는 이 진입점의 함수를 부르지 않는다.
// 부를지 말지는 수집 SDK 가 `globalThis.__ADE_BUILD__` 의 부재로 판단한다(03 §1-4).
export { collectCtx } from './collect.js';
export { injectSlots, ensureSlots } from './slots.js';
export { startFallbackInjection } from './observe.js';
