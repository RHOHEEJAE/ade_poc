export type ImpressionOptions = {
    areaRatio: number;
    oversizeViewportRatio: number;
    durationMs: number;
    kinds: string[];
};
/**
 * 판정 기준. Amplitude 의 노출 판정값(면적 100% · 시간 150ms · 재발화 1회)을 따르고,
 * 화면보다 큰 요소를 위한 예외(`oversizeViewportRatio`) 하나만 더했다.
 *
 * @typedef {{ areaRatio: number, oversizeViewportRatio: number, durationMs: number, kinds: string[] }} ImpressionOptions
 * @type {ImpressionOptions}
 */
export declare const DEFAULT_IMPRESSION: ImpressionOptions;
/**
 * IntersectionObserver 에 넘길 문턱 목록.
 *
 * `[1.0]` 하나만 주면 화면보다 큰 요소에서는 콜백이 아예 오지 않는다 — 비율이 1.0 을 넘나드는 순간이
 * 없기 때문이다. 예외 판정을 하려면 낮은 문턱에서도 콜백을 받아야 하므로 여러 개를 준다.
 */
export declare const IO_THRESHOLDS: number[];
/**
 * 화면을 차지한 정도가 기준을 넘었는지 본다.
 *
 * @param {{ intersectionRatio: number,
 *           boundingClientRect: { width: number, height: number },
 *           intersectionRect: { width: number, height: number },
 *           rootBounds: { width: number, height: number } | null }} entry
 *   IntersectionObserverEntry 에서 쓰는 네 값. 시험에서는 평범한 객체를 넣는다.
 * @param {ImpressionOptions} opt 판정 기준. `areaRatio` 와 `oversizeViewportRatio` 를 쓴다.
 * @return {boolean} 기준을 넘었으면 true. entry 가 없거나 값이 모자라면 false.
 */
export declare function meetsArea(entry: {
    intersectionRatio: number;
    boundingClientRect: {
        width: number;
        height: number;
    };
    intersectionRect: {
        width: number;
        height: number;
    };
    rootBounds: {
        width: number;
        height: number;
    } | null;
}, opt: ImpressionOptions): boolean;
/**
 * 노출을 관찰할 요소인지 본다.
 *
 * 기본은 `object` 만이다. `control` · `input` 은 끄고, 미선언 요소는 제외한다.
 * 개별 해제는 `data-ade-impression="off"` 하나뿐이다.
 *
 * @param {{ kind: string | null, impressionOff: boolean } | null} decl 요소에서 읽은 선언. 없으면 null.
 * @param {{ kinds: string[] }} [opt] 관찰할 kind 목록. 기본은 DEFAULT_IMPRESSION.
 * @return {boolean} 선언이 있고, kind 가 목록에 있고, 개별 해제되지 않았으면 true.
 */
export declare function isImpressionTarget(decl: {
    kind: string | null;
    impressionOff: boolean;
} | null, opt?: {
    kinds: string[];
}): boolean;
/**
 * 관찰 후보를 찾는 CSS 셀렉터. `isImpressionTarget` 과 같은 배열에서 만든다.
 * 한쪽만 고치면 「관찰은 붙는데 판정에서 탈락」하는 조용한 실패가 난다.
 * @param {{ kinds: string[] }} [opt] 관찰할 kind 목록. 기본은 DEFAULT_IMPRESSION.
 * @return {string} `querySelectorAll` 에 넘길 셀렉터. kind 마다 하나씩 쉼표로 잇는다.
 */
export declare function targetSelector(opt?: {
    kinds: string[];
}): string;
/**
 * 「같은 것」을 가리는 열쇠. 재발화를 막는 기준이다.
 *
 * DOM 노드를 열쇠로 쓰면 리액트가 목록을 다시 그릴 때 노드가 새로 생겨 같은 배너가 또 발화한다.
 * 선언 이름과 업무ID 로 가르면 다시 그려도 값이 같다.
 *
 * @param {{ name: string, identity: Record<string, string>, identityStatic?: boolean } | null} decl 요소에서 읽은 선언.
 * @return {string | null} `이름` 또는 `이름#키=값,…` 형식의 열쇠.
 *   `null` 이면 열쇠를 만들 수 없다는 뜻이고, 부른 쪽이 요소 단위로 세야 한다. 세 경우에 그렇다 —
 *     · 이름이 없다 (선언되지 않았다)
 *     · 업무ID 값이 비어 있다. 목록 100건이 전부 빈 값이면 한 열쇠로 뭉쳐 1건만 세게 되는데,
 *       그러면 전환율의 분모가 100분의 1로 줄어든다.
 *     · 업무ID 가 아예 없는데 `identity-static` 도 아니다 — 빈 값과 같은 문제다. `data-ade-id-key` 를
 *       빠뜨린 카드 100장이 이름 하나로 뭉친다. 화면에 하나뿐인 배너는 static 을 표시해 이름만으로 센다.
 */
export declare function impressionKey(decl: {
    name: string;
    identity: Record<string, string>;
    identityStatic?: boolean;
} | null): string | null;
