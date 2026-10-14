// ade_poc 전용 — SDK 의 임시 판정 계약을 코드젠 코어(@adestack/core/contract)로 바꾼 파일이다.
//
// 선언 읽기 · 판정 · 등급 · 수집 제한은 core/ 의 코드젠 코어를 그대로 쓴다(커밋은 core/CODEGEN_COMMIT).
// core/ 는 코드젠 packages/core/src 의 contract · inject 와 그 의존 파일을 복사하고,
// import 경로에 .js 만 붙였다(이 패키지가 NodeNext 라서). 코드 내용은 바꾸지 않았다.
// 원래 SDK 임시 구현은 contract.sdk-stub.ts.txt 에 남겨 두었다.
//
// 아래 상수 셋은 코어에 없는 SDK 쪽 값이라 임시 구현에서 그대로 옮겼다.
export { readDeclaration, resolveIdentityMode, resolveCollect, resolveVerdict, applySafetyNet, CONTRACT_VERSION, DECLARED_SELECTOR, } from './core/contract/index.js';
// 순수 HTML 화면의 조상 정보 폴백(미리 붙이기 · 누를 때 채우기). GEN-M3 의 코어 기능이다.
export { startFallbackInjection, ensureSlots, injectSlots } from './core/inject/index.js';
export const KINDS = ['object', 'control', 'input'];
export const COLLECT_VALUES = ['skip', 'deny', 'mask'];
/**
 * 이름이 고정된 data-ade-* 속성. 벤더 `capture_extra_attrs` 에 보조로 얹을 때만 쓴다.
 * 판정 입력은 언제나 readDeclaration 의 결과다. 빠져도 데이터는 잃지 않는다.
 */
export const FIXED_ATTRS = [
    'data-ade-kind',
    'data-ade-role',
    'data-ade-name',
    'data-ade-placement',
    'data-ade-id-key',
    'data-ade-impression',
    'data-ade-collect',
    'data-ade-identity-static',
    'data-ade-ancestor-dropped',
    'data-ade-role-req',
    'data-ade-relation-error',
];
