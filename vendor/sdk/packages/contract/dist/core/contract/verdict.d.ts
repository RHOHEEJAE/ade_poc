import type { Declaration } from './read.js';
/**
 * 요소 하나를 읽어 내는 판정 3종. 값은 영어 식별자이고, 한국어 이름은 문서와 진단의 표기다.
 *
 * 적재 컬럼 값, 집계 키, 로그 검색어로 그대로 쓰이는 저장 값이라 좁은 문자 집합으로 둔다.
 * 제품 용어가 바뀌어도 저장 값은 그대로여서 용어 개정이 데이터 마이그레이션이 되지 않는다.
 */
export type Verdict = 'usable' | 'needs_classification' | 'collection_failed';
export type VerdictResult = {
    verdict: Verdict;
    /**
     * 판정 근거. 담기는 값은 네 갈래다.
     *
     * ADE 코드 하나이거나 공백으로 이은 ADE 코드 목록이다.
     * 안전 검사와 수집 제한과 읽기 실패에서는 코드 대신 사유 문자열을 담는다.
     * 조상 체인을 읽지 못한 경우와 선언을 읽지 못한 경우의 사유는 둘 다 unreadable 이다.
     * 안전망이 판정을 바꿨으면 unclassified 다.
     * 근거가 없으면 null 이다. 그런 경우가 둘이다.
     * 사용 가능이 하나다. data-ade-kind 속성이 없어 분류 필요가 된 경우가 둘이다.
     */
    reason: string | null;
};
/**
 * 트리 밖 안전망. 사용 가능도 분류 필요도 아닌 값은 수집 실패로 바꾼다.
 * walkTree 가 Verdict 를 돌려주므로 타입을 지키는 호출에서는 이 분기가 돌지 않는다.
 * 트리에 갈래를 더하다 셋 밖의 값을 내보내는 것을 막는다(docs/설계/계약-판정과-버전.md).
 */
export declare function applySafetyNet(verdict: string | undefined | null): Verdict;
/**
 * 판정 3종을 결정한다. 트리를 돌리고 안전망을 씌운다.
 *
 * 미정 상태를 남기지 않는다.
 * 수집 실패로 판정한 요소에서 원시 행동을 만들지 않는 것은 이 함수를 쓰는 수집 SDK 의 몫이다.
 */
export declare function resolveVerdict(el: Element, decl: Declaration | null, elementUnsafe: boolean): VerdictResult;
