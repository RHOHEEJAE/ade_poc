/** 수집 제한 값. 부재하면 정상 수집이라 null 이다. */
export type CollectMode = 'skip' | 'deny' | 'mask';
/**
 * 서브트리 수집 제한을 판정한다. 조상까지 훑어 가장 강한 값을 돌려준다.
 * 인정하지 않는 값은 없는 것으로 읽는다. 강한 쪽으로 올리면 정상 수집이 오류 없이 중단된다.
 * 셋 밖의 값은 빌드가 ADE-109 플래그 값 오류로 막는다.
 */
export declare function resolveCollect(el: Element): CollectMode | null;
/**
 * 조상까지 훑은 결과와 끝까지 훑었는지를 함께 돌려준다.
 *
 * 판정 트리가 이 둘을 구분해야 한다.
 * 훑지 못한 요소를 제한이 없다고 읽으면 안전하지 않은 기록이 정상처럼 연결된다(규칙 R4).
 * `resolveCollect` 를 쓰는 수집 SDK 는 값만 필요하므로 그쪽에는 이 구분을 내보내지 않는다.
 */
export declare function scanCollect(el: Element): {
    mode: CollectMode | null;
    complete: boolean;
};
