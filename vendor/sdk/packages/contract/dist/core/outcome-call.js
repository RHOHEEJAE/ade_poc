// 직접 결과 호출의 객체 이름과 메서드 이름이다(01 §6-2).
//
// 호출을 찾는 스캐너, 호출문을 삽입하는 자동완성, 진단 문구가 이 값을 함께 쓴다.
// 이 파일은 아무것도 불러오지 않는다.
// 이름 검사(name.ts)가 런타임 계약 번들에 들어간다.
// 스캐너처럼 Babel 을 불러오는 파일을 거치면 그 번들에 Babel 이 함께 들어간다.
/** 수집 SDK 가 런타임에 제공하는 전역 객체의 이름이다(ADR-019). */
export const OUTCOME_OBJECT = 'adesdk';
/** 직접 결과를 보내는 메서드의 이름이다. */
export const OUTCOME_METHOD = 'track';
/** 문서와 진단 문구에 적는 호출 이름이다. */
export const OUTCOME_CALL = `${OUTCOME_OBJECT}.${OUTCOME_METHOD}`;
