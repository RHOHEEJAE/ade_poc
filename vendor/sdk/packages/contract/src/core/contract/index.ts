// @adestack/core/contract — 계약 패키지의 입구다(DA-103).
//
// 의존성 없는 순수 함수 넷이다.
// 어휘 서버와 파일 시스템에 접근하지 않고, 부작용이 없으며 이벤트를 만들지 않는다.
// 클릭, 노출, 제출 세 수집 경로가 모두 이 입구로만 선언을 읽는다.
// 관찰하는 방법은 달라도 읽는 규칙은 같아야 하기 때문이다(03 SDK 인계 계약 §1-1).
//
// 읽기 규칙을 산문이 아니라 코드로 넘기는 이유가 있다.
// 신뢰 등급과 코드젠 판정은 둘 다 런타임에 계산해야 하는 값이다.
// 업무ID 가 서버 응답으로 채워지는 이상 빌드 시점의 판정은 실제와 어긋난다.
// 규칙을 문서로만 넘기면 빌드 쪽 구현과 런타임 쪽 구현이 갈린다.

export { readDeclaration, DECLARED_SELECTOR } from './read.js';
export type { Declaration } from './read.js';
export { resolveIdentityMode } from './identity-mode.js';
export type { IdentityMode } from './identity-mode.js';
export { resolveCollect } from './collect.js';
export type { CollectMode } from './collect.js';
export { resolveVerdict, applySafetyNet } from './verdict.js';
export type { Verdict, VerdictResult } from './verdict.js';
export { CONTRACT_VERSION, checkContractVersion, isCompatibleVersion } from './version.js';
export type { ContractVersionCheck } from './version.js';
