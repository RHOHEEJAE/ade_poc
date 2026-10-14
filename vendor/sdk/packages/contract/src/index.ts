// @adestack/contract — 코드젠 선언(`data-ade-*`)을 읽고 판정하는 규칙과 값 안전 규칙.
//
// 코어(@adestack/sdk 의 클릭 경로)와 노출 확장(@adestack/extensions 의 impression)이 같은 규칙을
// 써야 해서 패키지로 뗐다. 이벤트를 만들지 않는 순수 함수 묶음이라 init 이 없다.
//
//   contract.ts   선언 읽기 · 등급 · 판정 — 코드젠이 배포할 정본 패키지로 교체될 임시 구현
//   safety.ts     민감 요소 · 민감 키 · 마스킹 · 값 길이 — SDK 소유. 교체 뒤에도 남는다
//   version.ts    규칙 버전 호환 판정

export * from './contract.js';
export * from './safety.js';
export * from './version.js';
