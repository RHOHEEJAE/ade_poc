import type { Ctx } from '../ctx.js';
/**
 * 요소의 선언된 DOM 조상을 훑어 조상 목록을 만든다. 가까운 조상이 앞이다.
 *
 * 깊이 상한을 두지 않고 문서 최상단까지 올라간다. 탐색을 최상단까지 잇는 규칙이 (가) 다.
 * 담는 것은 `data-ade-id-key` 가 가리키는 키 하나이고 맥락 속성(props)은 담지 않는다(규칙 (라)).
 * 같은 키의 중복 제거와 잘린 개수 세기는 여기서 하지 않고 접기가 맡는다(규칙 (다)).
 * 탐색은 shadow 경계에서 멈춘다. `parentElement` 가 shadow root 에서 `null` 이 되기 때문이다.
 *
 * 다섯 규칙의 전문과 배경은 docs/설계/주입-시점과-폴백.md 에 있다(01 선언 계약 §2-3, 02 §7-3).
 */
export declare function collectCtx(el: Element): Ctx;
