// 런타임 폴백 — 마운트 시점 주입기.
//
// 새로 추가된 선언 요소를 `MutationObserver` 로 검출해 조상 슬롯을 채운다(DA-104).
// 이 파일의 주입은 전부 런타임에 돈다. 빌드 단계와는 관계가 없다.
// React 와 Babel 을 쓰는 스택에서는 빌드 플러그인이 조상 슬롯을 소스에 넣는다(02 빌드 주입 §7-1).
// Vue, 순수 HTML, JSP 에는 그 플러그인이 돌 단계가 없어 브라우저에서 DOM 을 훑어 채운다.
//
// 이 저장소는 함수를 만들어 `@adestack/core/inject` 로 내보낸다.
// 부르는 것은 수집 SDK 다. 저장소를 나눈 배포 경계를 그대로 따른다(03 SDK 인계 계약 §1-3).
//
// 호출 시점과 호출 예시는 docs/설계/주입-시점과-폴백.md 에 있다.

import { DECLARED_SELECTOR } from '../contract/read.js';
import type { Diagnostic } from '../diagnostics.js';
import { injectSlots } from './slots.js';

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

const UNSUPPORTED_STACK: Diagnostic = {
  code: 'ADE-406',
  severity: 'warning',
  message:
    '빌드 플러그인이 처리하지 못하는 화면입니다. 조상 슬롯은 페이지 실행 중에 채워지지만, 사용 위치(data-ade-placement)는 채워지지 않습니다',
  hint: '사용 위치가 필요한 요소에는 data-ade-placement 를 직접 적으세요. Portal 로 그린 요소에는 조상 슬롯(data-ade-parent-*)도 직접 적으세요',
};

/**
 * 진단을 내보낸다. 받는 쪽이 예외를 던져도 주입을 멈추지 않는다.
 *
 * 검증 전략은 장애가 나도 사용자 서비스를 끊지 않는 것을 런타임의 기준으로 정했다(04 검증 전략 §7).
 * 경고 하나를 전하지 못한 것이 그 페이지의 수집 전체를 멈출 이유가 되지 않는다.
 */
function report(diagnostic: Diagnostic, onDiagnostic?: (d: Diagnostic) => void): void {
  try {
    if (onDiagnostic !== undefined) {
      onDiagnostic(diagnostic);
      return;
    }
    const hint = diagnostic.hint === undefined ? '' : `\n  → ${diagnostic.hint}`;
    console.warn(`[adestack] ${diagnostic.code} ${diagnostic.message}${hint}`);
  } catch {
    // 진단을 전하지 못한 예외는 여기서 끝낸다. 주입은 계속한다.
  }
}

/**
 * 뿌리 자신과 그 안쪽의 선언 요소를 모두 채운다.
 * 뿌리 자신을 함께 보는 이유는 추가되는 단위가 요소 하나일 수도 있고 서브트리일 수도 있기 때문이다.
 * `querySelectorAll` 은 자기 자신을 세지 않는다.
 * 그 함수만 쓰면 선언 요소 하나가 통째로 추가된 경우를 놓친다.
 */
function sweep(root: ParentNode): void {
  if (root instanceof Element && root.matches(DECLARED_SELECTOR)) {
    injectSlots(root);
  }
  for (const inner of root.querySelectorAll(DECLARED_SELECTOR)) {
    injectSlots(inner);
  }
}

/** `MutationObserver` 가 알려 온 노드를 훑는다. 요소가 아닌 노드(글자 노드 등)는 건너뛴다. */
function sweepAdded(node: Node): void {
  if (node instanceof Element) {
    sweep(node);
  }
}

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
export function startFallbackInjection(options: FallbackInjectionOptions = {}): () => void {
  const root = options.root ?? document;

  // 이미 그려져 있는 선언 요소부터 채운다.
  sweep(root);

  // 이후에 추가되는 선언 요소를 검출한다.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        sweepAdded(added);
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  // 이 함수를 불렀다는 것 자체가 Babel 주입이 없는 스택이라는 증거다.
  report(UNSUPPORTED_STACK, options.onDiagnostic);

  return () => observer.disconnect();
}
