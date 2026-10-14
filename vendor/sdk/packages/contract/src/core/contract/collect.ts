// 읽기 계약 — 서브트리 수집 제한을 판정한다(DA-103).
//
// data-ade-collect 는 적용 범위가 서브트리라서 조상까지 보아야 값이 정해진다.
// 조상을 훑는 것은 읽기 규칙 위반이 아니다(R2).
// 그 규칙이 막는 것은 업무ID 조상 슬롯을 다시 계산하는 것이다.
// 이 모듈은 빌드가 찍은 업무ID 값을 다시 만들지 않는다.
//
// skip, deny, mask 세 값은 동작이 같아도 뜻이 다르다.
// 세 값의 뜻과 되돌리는 권한은 docs/설계/계약-판정과-버전.md 에 있다.

/** 수집 제한 값. 부재하면 정상 수집이라 null 이다. */
export type CollectMode = 'skip' | 'deny' | 'mask';

const ATTR = 'data-ade-collect';

/** 제한이 강한 순서. 안쪽 요소가 바깥 요소의 제한을 되돌릴 수 없으므로 앞선 값을 고른다. */
const STRENGTH: readonly CollectMode[] = ['deny', 'skip', 'mask'];

function rank(value: string): number {
  return STRENGTH.indexOf(value as CollectMode);
}

/**
 * 서브트리 수집 제한을 판정한다. 조상까지 훑어 가장 강한 값을 돌려준다.
 * 인정하지 않는 값은 없는 것으로 읽는다. 강한 쪽으로 올리면 정상 수집이 오류 없이 중단된다.
 * 셋 밖의 값은 빌드가 ADE-109 플래그 값 오류로 막는다.
 */
export function resolveCollect(el: Element): CollectMode | null {
  return scanCollect(el).mode;
}

/**
 * 조상까지 훑은 결과와 끝까지 훑었는지를 함께 돌려준다.
 *
 * 판정 트리가 이 둘을 구분해야 한다.
 * 훑지 못한 요소를 제한이 없다고 읽으면 안전하지 않은 기록이 정상처럼 연결된다(규칙 R4).
 * `resolveCollect` 를 쓰는 수집 SDK 는 값만 필요하므로 그쪽에는 이 구분을 내보내지 않는다.
 */
export function scanCollect(el: Element): { mode: CollectMode | null; complete: boolean } {
  let strongest = -1;

  try {
    // 요소로서 최소한의 인터페이스도 없으면 훑기를 시작할 수 없다.
    // 이 검사까지 try 안에 두는 이유는 속성 접근 자체가 예외를 던지는 요소가 있기 때문이다.
    // Proxy 나 래퍼가 그런 요소를 만든다.
    // 검사를 try 밖에 두면 `el.getAttribute` 를 읽는 순간 예외가 호출한 쪽으로 전달된다.
    // 계약 패키지는 잘못된 입력에도 예외를 던지지 않는다(04 검증 전략 §3-8).
    if (el === null || typeof el !== 'object' || typeof el.getAttribute !== 'function') {
      return { mode: null, complete: false };
    }

    // parentElement 가 null 일 때만 문서 끝으로 본다.
    for (let node: Element | null = el; node !== null; node = node.parentElement) {
      // 조상의 getAttribute 가 함수가 아니거나 조상이 undefined 이면 이 호출이 예외를 던진다.
      // 그 조상의 값은 읽지 못한 것이므로 catch 가 complete 를 false 로 낸다.
      const value = node.getAttribute(ATTR);
      if (value === null || value === undefined) {
        continue;
      }

      const found = rank(value);
      if (found === -1) {
        continue;
      }

      // 더 강한 값이 나오면 그 값으로 바꾼다. deny 를 만나면 더 강한 것이 없으니 멈춘다.
      if (strongest === -1 || found < strongest) {
        strongest = found;
      }
      if (strongest === 0) {
        break;
      }
    }
  } catch {
    // 조상을 훑다 예외가 발생해도 이미 찾은 값은 유효하다.
    // 그 값까지 버리면 조상이 건 제한이 오류 없이 풀린다.
    // 끝까지 보지 못했다는 것은 complete 로 알린다.
    return { mode: strongest === -1 ? null : STRENGTH[strongest], complete: false };
  }

  return { mode: strongest === -1 ? null : STRENGTH[strongest], complete: true };
}
