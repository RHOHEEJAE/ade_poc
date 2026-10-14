// 진단 자료구조와 차단 판정 (DA-92).
//
// 검증 CLI, 언어 서버, 계약 패키지 세 입구가 하나의 규칙 코드를 공유한다(ADR-006).
// 그래서 진단의 모양도 한 곳에서 정의한다.
// 이 파일에는 자료구조와 차단 판정만 두고, 출력 형식은 검증 CLI 의 render.ts 가 정한다.
// 규칙별 ADE 코드 판정은 다른 모듈이 맡는다. 그 모듈이 이 자료구조를 결과로 낸다.
//
// 값 길이의 상한과 축약 함수도 여기 둔다(DA-251).
// declaration.ts 가 진단 메시지에 값을 인용할 때 이 함수를 쓴다.
// declaration.ts 는 계약 패키지의 읽기 진입점이 끌어오는 파일이다.
// 그 파일이 새로 끌어오는 모듈은 계약 패키지의 의존 범위에도 들어간다(dependencies.test.ts).
// length.ts 에 두면 계약 패키지가 그 파일까지 끌어오므로, 이미 끌어오는 이 파일에 둔다.
/**
 * 값 길이의 상한. JS 문자열 length 기준이고 UTF-16 코드 유닛을 센다.
 * 수집 단계가 값을 자르는 기준이고, `ADE-111` 과 `ADE-704` 가 진단을 낼지 정하는 기준이다(DA-251).
 */
export const VALUE_LENGTH_LIMIT = 255;
/**
 * {@link abbreviate} 가 남기는 앞자리 길이이자, 축약할지 판정하는 기준이다.
 * 진단 메시지와 인용 줄의 출력 폭을 줄이는 값이라 수집 단계의 절단 기준과는 다르다(DA-251).
 */
export const ABBREVIATE_PREFIX_LENGTH = 40;
/** 코드 유닛이 서로게이트 쌍의 앞쪽(상위)인가. */
function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
}
/** 코드 유닛이 서로게이트 쌍의 뒤쪽(하위)인가. */
function isLowSurrogate(code) {
    return code >= 0xdc00 && code <= 0xdfff;
}
/**
 * 진단 메시지에 인용할 값을 축약한다.
 *
 * `value` 칸과 달리 메시지 문장은 값을 아예 빼면 무엇을 가리키는지 알 수 없다.
 * 그래서 앞 {@link ABBREVIATE_PREFIX_LENGTH} 자만 남기고 뒤는 총 길이로 대신한다.
 * {@link ABBREVIATE_PREFIX_LENGTH} 이하 값은 그대로 돌려준다.
 *
 * 앞자리 경계가 서로게이트 쌍의 가운데를 가르면 그 쌍을 통째로 뺀다.
 * 반으로 자르면 짝을 잃은 상위 서로게이트 하나만 남는다.
 */
export function abbreviate(value) {
    if (value.length <= ABBREVIATE_PREFIX_LENGTH) {
        return value;
    }
    let end = ABBREVIATE_PREFIX_LENGTH;
    if (isHighSurrogate(value.charCodeAt(end - 1)) && isLowSurrogate(value.charCodeAt(end))) {
        end -= 1;
    }
    return `${value.slice(0, end)}…(총 ${value.length}자)`;
}
/**
 * 빌드를 막아야 하는 진단이 있는가.
 * error 심각도가 하나라도 있으면 참이다.
 * 런타임 폴백으로 내려간 요소가 있다는 것만으로는 빌드를 막지 않는다(DA-92 수용 기준 ①).
 */
export function hasBlockingError(diagnostics) {
    return diagnostics.some((d) => d.severity === 'error');
}
