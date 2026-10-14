import type { Diagnostic } from '../diagnostics.js';
export type FallbackInjectionOptions = {
    /**
     * 관찰할 뿌리. 기본은 `document` 다.
     *
     * shadow root 를 주면 그 안쪽에 관찰자를 따로 등록할 수 있다.
     * 바깥에 등록한 `MutationObserver` 는 shadow 경계를 넘지 못한다(02 §7-3).
     * 안쪽에 선언을 넣었다면 안쪽에도 한 번 등록해야 한다.
     */
    root?: ParentNode & Node;
    /** 진단을 받는 콜백. 주지 않으면 `console.warn` 으로 한 줄 낸다. */
    onDiagnostic?: (diagnostic: Diagnostic) => void;
};
/**
 * 폴백 주입을 시작하고, 관찰을 끊는 함수를 돌려준다.
 *
 * 세 가지를 한다. 뿌리 안의 선언 요소를 한 번 전수로 훑어 채운다.
 * `MutationObserver` 를 `childList` 와 `subtree` 로 등록한다.
 * `ADE-406` 미지원 스택 진단을 한 번 낸다.
 *
 * 전수 훑기가 없으면 첫 화면의 선언 요소가 채워지지 않는다.
 * `MutationObserver` 는 등록 이전에 그려진 요소를 알려주지 않기 때문이다.
 * `attributes` 를 관찰하지 않는 이유와 그때 놓치는 경우는 docs/설계/주입-시점과-폴백.md 에 있다.
 *
 * `ADE-406` 은 이 호출마다 한 번이고 요소 수만큼 쌓이지 않는다.
 * 수집 SDK 는 한 페이지에서 이 함수를 한 번 부른다.
 *
 * 검증 CLI 도 같은 진단을 낸다. 두 곳에서 내는 이유는 docs/설계/주입-시점과-폴백.md 에 있다.
 */
export declare function startFallbackInjection(options?: FallbackInjectionOptions): () => void;
