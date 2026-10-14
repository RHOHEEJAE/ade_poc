import type { Declaration } from './read.js';
/** 수집 증거 등급. 승격 여부와 무관한 품질 표시다. */
export type IdentityMode = 'guaranteed' | 'observed';
/**
 * 신뢰 등급을 판정한다. 두 조항의 전문은 docs/설계/계약-판정과-버전.md 에 있다.
 *
 * 두 조항은 요구가 없으면 위반도 없다는 기준을 따른다.
 * role 없는 `object` 와 조상 키가 아예 없는 `control` 은 가릴 인스턴스가 없다는 점에서 같다.
 * 그래서 둘 다 `guaranteed` 다.
 */
export declare function resolveIdentityMode(decl: Declaration): IdentityMode;
