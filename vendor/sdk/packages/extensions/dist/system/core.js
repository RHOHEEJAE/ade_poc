// system/core.js — 통신 결과 · 웹 성능 기록의 순수 규칙. 브라우저 API 접근이 없다.
//
// 주소 정리 · 자기 서버 제외 · 기록 변환 · CLS 누적 · 반올림이 여기 있고, PerformanceObserver 배선은
// index.ts 가 한다.
//
// .js 인 이유: 단위 시험이 빌드 없이 이 파일을 그대로 읽어야 규칙 사본이 둘로 갈리지 않는다.
/** 관찰할 통신 종류. 이미지 · 스크립트 · 폰트는 앱의 통신 결과가 아니다. */
export const TRACKED_INITIATORS = ['fetch', 'xmlhttprequest'];
/** 이번 페이지뷰에서 한 번씩만 보내는 지표. */
export const VITALS = ['LCP', 'CLS', 'INP', 'TTFB', 'FCP'];
/**
 * 주소에서 쿼리와 해시를 뗀다. `origin` + `pathname` 만 남는다.
 *
 * 쿼리에는 토큰 · 개인정보가 실려 있을 수 있다. 잘라내는 것이 아니라 아예 만들지 않는다 —
 * 뒤에서 지우는 방식은 한 군데만 빠뜨려도 샌다.
 *
 * @param {string} url 관찰된 요청 주소. 절대 주소여야 한다.
 * @return {string|null} `origin + pathname`. 해석할 수 없으면 null — 그런 항목은 싣지 않는다.
 */
export function sanitizeUrl(url) {
    if (typeof url !== 'string' || !url)
        return null;
    try {
        const u = new URL(url);
        // 자격증명이 주소에 박힌 경우(user:pass@host)가 실재한다. origin 은 그것을 뺀 값이다.
        return u.origin + u.pathname;
    }
    catch {
        return null;
    }
}
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
export function isOwnEndpoint(url, apiHost, base) {
    if (!url || !apiHost)
        return false;
    try {
        const target = new URL(url, base);
        const own = new URL(apiHost, base);
        if (target.origin !== own.origin)
            return false;
        // api_host 하위 전체를 제외한다. '/ade-collect' 와 '/ade-collect2' 를 가르려고
        // 경계에서 끊는다 — 끝이 같거나 그 아래여야 한다.
        const ownPath = own.pathname.replace(/\/+$/, '');
        if (ownPath === '')
            return true; // 호스트 전체가 수집 서버다
        return target.pathname === ownPath || target.pathname.startsWith(ownPath + '/');
    }
    catch {
        // 판정할 수 없으면 제외하는 쪽이다. 순환은 관측을 통째로 망가뜨린다.
        return true;
    }
}
/**
 * `PerformanceResourceTiming` 하나를 기록으로 옮긴다.
 *
 * @param {{ name?: string, initiatorType?: string, duration?: number,
 *           transferSize?: number, responseStatus?: number }} entry
 * @param {{ apiHost?: string, base?: string }} [opt] 자기 서버 주소와 상대 경로 기준.
 * @return {object|null} `network_path` 와 있는 값만 담은 `network_duration_ms` · `network_transfer_size` · `network_status`.
 *   fetch · XHR 이 아니거나, 주소를 못 풀거나, 자기 서버로 나간 것이면 null.
 */
export function toNetworkRecord(entry, opt = {}) {
    if (!entry || !TRACKED_INITIATORS.includes(entry.initiatorType))
        return null;
    const path = sanitizeUrl(entry.name);
    if (path === null)
        return null;
    if (isOwnEndpoint(entry.name, opt.apiHost, opt.base))
        return null;
    const rec = { network_path: path };
    // 요청 · 응답 본문과 헤더는 어떤 경우에도 싣지 않는다. PerformanceObserver 는 애초에 그 값을
    // 주지 않으므로, 이 목록에 없는 것은 실을 수 없는 것이지 실을 수 있는데 안 싣는 것이 아니다.
    if (Number.isFinite(entry.duration))
        rec.network_duration_ms = Math.round(entry.duration);
    if (Number.isFinite(entry.transferSize))
        rec.network_transfer_size = entry.transferSize;
    // responseStatus 는 브라우저 지원이 갈린다. 없으면 필드를 만들지 않는다 —
    // 0 으로 채우면 "상태를 모른다"와 "0 을 받았다"가 구분되지 않는다.
    if (Number.isFinite(entry.responseStatus) && entry.responseStatus > 0) {
        rec.network_status = entry.responseStatus;
    }
    return rec;
}
/**
 * 레이아웃 이동 값을 누적한다. 사용자 입력 직후의 이동은 세지 않는다 —
 * 클릭으로 열린 메뉴가 화면을 미는 것은 불안정이 아니다.
 *
 * @param {number} sum 지금까지의 합.
 * @param {{ value?: number, hadRecentInput?: boolean }} entry `layout-shift` 항목.
 * @return {number} 더한 합. 입력 직후이거나 값이 없으면 그대로.
 */
export function accumulateCls(sum, entry) {
    if (!entry || entry.hadRecentInput)
        return sum;
    const v = Number(entry.value);
    return Number.isFinite(v) && v > 0 ? sum + v : sum;
}
/**
 * 지표 값을 싣기 좋은 정밀도로 줄인다. CLS 만 소수가 의미 있다.
 * @param {string} name 지표 이름. `CLS` 면 소수 셋째 자리, 나머지는 정수.
 * @param {number} value 원값.
 * @return {number|null} 반올림한 값. 숫자가 아니면 null.
 */
export function roundVital(name, value) {
    if (!Number.isFinite(value))
        return null;
    return name === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);
}
