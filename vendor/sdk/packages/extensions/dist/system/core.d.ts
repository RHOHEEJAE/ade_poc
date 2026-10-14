/** 관찰할 통신 종류. 이미지 · 스크립트 · 폰트는 앱의 통신 결과가 아니다. */
export declare const TRACKED_INITIATORS: string[];
/** 이번 페이지뷰에서 한 번씩만 보내는 지표. */
export declare const VITALS: string[];
/**
 * 주소에서 쿼리와 해시를 뗀다. `origin` + `pathname` 만 남는다.
 *
 * 쿼리에는 토큰 · 개인정보가 실려 있을 수 있다. 잘라내는 것이 아니라 아예 만들지 않는다 —
 * 뒤에서 지우는 방식은 한 군데만 빠뜨려도 샌다.
 *
 * @param {string} url 관찰된 요청 주소. 절대 주소여야 한다.
 * @return {string|null} `origin + pathname`. 해석할 수 없으면 null — 그런 항목은 싣지 않는다.
 */
export declare function sanitizeUrl(url: string): string | null;
/**
 * 우리 수집 서버로 나간 요청인지 본다.
 *
 * 제외하지 않으면 순환한다. 통신 결과를 보내는 요청이 다시 통신 결과로 관찰되고, 그것을 보내는
 * 요청이 또 관찰된다.
 *
 * @param {string} url 관찰된 주소.
 * @param {string} apiHost init 에 넘긴 수집 서버 주소. 상대 경로일 수 있다.
 * @param {string} [base] 상대 경로를 풀 기준. 브라우저에서는 location.href.
 * @return {boolean} 수집 서버(및 그 하위 경로)로 나간 요청이면 true. 판정할 수 없으면 true(제외).
 */
export declare function isOwnEndpoint(url: string, apiHost: string, base?: string): boolean;
/**
 * `PerformanceResourceTiming` 하나를 기록으로 옮긴다.
 *
 * @param {{ name?: string, initiatorType?: string, duration?: number,
 *           transferSize?: number, responseStatus?: number }} entry
 * @param {{ apiHost?: string, base?: string }} [opt] 자기 서버 주소와 상대 경로 기준.
 * @return {object|null} `network_path` 와 있는 값만 담은 `network_duration_ms` · `network_transfer_size` · `network_status`.
 *   fetch · XHR 이 아니거나, 주소를 못 풀거나, 자기 서버로 나간 것이면 null.
 */
export declare function toNetworkRecord(entry: {
    name?: string;
    initiatorType?: string;
    duration?: number;
    transferSize?: number;
    responseStatus?: number;
}, opt?: {
    apiHost?: string;
    base?: string;
}): object | null;
/**
 * 레이아웃 이동 값을 누적한다. 사용자 입력 직후의 이동은 세지 않는다 —
 * 클릭으로 열린 메뉴가 화면을 미는 것은 불안정이 아니다.
 *
 * @param {number} sum 지금까지의 합.
 * @param {{ value?: number, hadRecentInput?: boolean }} entry `layout-shift` 항목.
 * @return {number} 더한 합. 입력 직후이거나 값이 없으면 그대로.
 */
export declare function accumulateCls(sum: number, entry: {
    value?: number;
    hadRecentInput?: boolean;
}): number;
/**
 * 지표 값을 싣기 좋은 정밀도로 줄인다. CLS 만 소수가 의미 있다.
 * @param {string} name 지표 이름. `CLS` 면 소수 셋째 자리, 나머지는 정수.
 * @param {number} value 원값.
 * @return {number|null} 반올림한 값. 숫자가 아니면 null.
 */
export declare function roundVital(name: string, value: number): number | null;
