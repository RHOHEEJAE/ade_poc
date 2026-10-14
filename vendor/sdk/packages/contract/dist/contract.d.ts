export { readDeclaration, resolveIdentityMode, resolveCollect, resolveVerdict, applySafetyNet, CONTRACT_VERSION, DECLARED_SELECTOR, } from './core/contract/index.js';
export type { Declaration, IdentityMode, Verdict, VerdictResult, CollectMode as Collect, } from './core/contract/index.js';
export { startFallbackInjection, ensureSlots, injectSlots } from './core/inject/index.js';
export declare const KINDS: readonly ['object', 'control', 'input'];
export type Kind = (typeof KINDS)[number];
export declare const COLLECT_VALUES: readonly ['skip', 'deny', 'mask'];
/**
 * 이름이 고정된 data-ade-* 속성. 벤더 `capture_extra_attrs` 에 보조로 얹을 때만 쓴다.
 * 판정 입력은 언제나 readDeclaration 의 결과다. 빠져도 데이터는 잃지 않는다.
 */
export declare const FIXED_ATTRS: readonly ['data-ade-kind', 'data-ade-role', 'data-ade-name', 'data-ade-placement', 'data-ade-id-key', 'data-ade-impression', 'data-ade-collect', 'data-ade-identity-static', 'data-ade-ancestor-dropped', 'data-ade-role-req', 'data-ade-relation-error'];
