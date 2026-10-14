// 읽기 계약 — 요소 하나를 읽어 사용 가능, 분류 필요, 수집 실패 중 하나로 판정한다.
// 읽기 규칙을 문서가 아니라 순수 함수 넷으로 넘기기로 정했고 이 파일이 그중 하나다(DA-103).
//
// 판정 값 셋은 이 저장소가 늘리거나 줄이지 않는다. 상위 명세가 고정한 값이다(기능정의서).
// 사람이 입력하는 품질 등급이나 분석 승인 상태가 아니다.
//
// 이 판정은 신뢰 등급과 답하는 질문이 다르다.
// 신뢰 등급은 같은 폴더의 resolveIdentityMode 가 guaranteed 와 observed 중 하나로 낸다.
// 판정은 이 이벤트를 쓸 수 있는지를 답하고, 등급은 그 값을 얼마나 믿을 수 있는지를 답한다.
// 둘 중 하나만 실으면 수정할 것이 없는 상태와 배포가 필요한 상태를 구분하지 못한다.
//
// 읽기 규칙은 여섯 개다. 이 파일이 쓰는 것은 안전 검사를 먼저 하라는 하나뿐이다(R4).
// 판정 트리 전체와 규칙 여섯 개는 docs/설계/계약-판정과-버전.md 에 있다(R1 부터 R6).

import { isValidName } from '../name.js';
import { scanCollect } from './collect.js';
import type { Declaration } from './read.js';

/**
 * 요소 하나를 읽어 내는 판정 3종. 값은 영어 식별자이고, 한국어 이름은 문서와 진단의 표기다.
 *
 * 적재 컬럼 값, 집계 키, 로그 검색어로 그대로 쓰이는 저장 값이라 좁은 문자 집합으로 둔다.
 * 제품 용어가 바뀌어도 저장 값은 그대로여서 용어 개정이 데이터 마이그레이션이 되지 않는다.
 */
export type Verdict =
  | 'usable' // 사용 가능
  | 'needs_classification' // 분류 필요
  | 'collection_failed'; // 수집 실패

export type VerdictResult = {
  verdict: Verdict;
  /**
   * 판정 근거. 담기는 값은 네 갈래다.
   *
   * ADE 코드 하나이거나 공백으로 이은 ADE 코드 목록이다.
   * 안전 검사와 수집 제한과 읽기 실패에서는 코드 대신 사유 문자열을 담는다.
   * 조상 체인을 읽지 못한 경우와 선언을 읽지 못한 경우의 사유는 둘 다 unreadable 이다.
   * 안전망이 판정을 바꿨으면 unclassified 다.
   * 근거가 없으면 null 이다. 그런 경우가 둘이다.
   * 사용 가능이 하나다. data-ade-kind 속성이 없어 분류 필요가 된 경우가 둘이다.
   */
  reason: string | null;
};

/**
 * 안전망이 그대로 통과시키는 판정 둘. walkTree 는 이 배열을 보지 않는다.
 * 수집 실패는 트리가 자기 분기에서 직접 내고, 이 배열과 견주는 것은 안전망뿐이다.
 *
 * 타입을 Verdict[] 로 두지 않는 이유는 applySafetyNet 이 문자열이면 무엇이든 받기 때문이다.
 * Verdict[] 이면 includes 가 그 인자를 받지 못한다.
 * 통과해도 타입이 좁혀지지 않아 아래에서 as Verdict 를 붙인다.
 */
const PASSING: readonly string[] = ['usable', 'needs_classification'];

/**
 * 트리 밖 안전망. 사용 가능도 분류 필요도 아닌 값은 수집 실패로 바꾼다.
 * walkTree 가 Verdict 를 돌려주므로 타입을 지키는 호출에서는 이 분기가 돌지 않는다.
 * 트리에 갈래를 더하다 셋 밖의 값을 내보내는 것을 막는다(docs/설계/계약-판정과-버전.md).
 */
export function applySafetyNet(verdict: string | undefined | null): Verdict {
  return typeof verdict === 'string' && PASSING.includes(verdict)
    ? (verdict as Verdict)
    : 'collection_failed';
}

/**
 * 요소가 자기 자신을 조상으로 가리키나.
 * 조상 슬롯은 decl.parent 와 decl.ancestor 둘을 함께 가리키는 말이다.
 * 그 둘에 자기 업무ID 와 같은 키이면서 같은 값이 있으면 참이다(ADE-505 자기 참조).
 * 직속 조상과 먼 조상을 가르지 않는다. 나누면 조합마다 이름을 붙여야 한다.
 * 빈 값은 세지 않는다. 그것은 ADE-502(조상 값 비어 있음)가 다루는 상태다.
 * 같은 키에 값이 다른 것도 자기 참조가 아니다. 상품 안의 상품이 그 경우다.
 */
function hasSelfReference(decl: Declaration): boolean {
  for (const [key, value] of Object.entries(decl.identity)) {
    if (value === '') {
      continue;
    }
    if (decl.parent[key] === value || decl.ancestor[key] === value) {
      return true;
    }
  }
  return false;
}

/**
 * 판정 트리. 단계마다 검사하고 먼저 걸린 것이 결론이다.
 * 전체 표는 docs/설계/계약-판정과-버전.md 에 있다.
 *
 * 인자가 셋인 이유는 단계마다 필요한 것이 다르기 때문이다.
 * el 은 수집 제한의 조상 탐색에 쓴다.
 * el 로 data-ade-kind 속성을 다시 읽어 kind 값이 셋 밖인지도 가른다.
 * decl 은 선언 검사에 쓴다. 읽을 수 없는 요소에서는 null 이다.
 * elementUnsafe 는 수집 SDK 가 수행한 요소 검사의 결과를 받는다.
 */
function walkTree(el: Element, decl: Declaration | null, elementUnsafe: boolean): VerdictResult {
  // 안전 검사에 걸렸나. 의미 검사와 관계 검사보다 먼저 돈다(규칙 R4).
  //
  // 비밀번호 입력을 다른 kind 로 잘못 선언해도 값과 행동을 만들지 않는다.
  // 선언보다 요소 검사가 우선한다.
  // 안전 실패의 구체 코드는 수집 SDK 가 정의하므로 번호를 지어내지 않고 사유만 남긴다.
  if (elementUnsafe) {
    return { verdict: 'collection_failed', reason: 'unsafe-element' };
  }

  // mask 는 이벤트를 남기고 값과 텍스트만 지우므로 여기서 걸리지 않는다.
  const collect = scanCollect(el);
  if (collect.mode === 'deny' || collect.mode === 'skip') {
    return { verdict: 'collection_failed', reason: `collect=${collect.mode}` };
  }

  // 조상 체인을 끝까지 읽지 못했으면 안전 검사를 마치지 못한 것이다.
  // 제한이 없다고 읽고 통과시키면 안전하지 않은 기록이 정상처럼 연결된다(규칙 R4).
  // 분류 필요도 원시 행동을 만들므로 안전한 쪽은 수집 실패다.
  // 트리가 예외로 끝났을 때도 같은 사유를 쓴다. 두 경우는 사유로 갈리지 않는다.
  if (!collect.complete) {
    return { verdict: 'collection_failed', reason: 'unreadable' };
  }

  // 선언을 읽지 못했나. readDeclaration 은 요소나 속성 목록을 읽을 수 없을 때만 null 을 낸다.
  // 그 함수는 같은 폴더의 read.ts 에 있다.
  // 이 요소는 선언이 없는 것인지 읽지 못한 것인지 알 수 없다.
  // 사용 가능과 분류 필요에 속하지 않는 조합이므로 수집 실패로 판정한다(03 판정 트리의 안전망).
  // 근거는 조상 체인을 읽지 못한 경우와 같다.
  // data-ade-kind 가 없는 요소는 여기가 아니라 kind 가 null 인 객체로 아래 분기에 간다.
  if (decl === null) {
    return { verdict: 'collection_failed', reason: 'unreadable' };
  }

  if (decl.kind === null) {
    // 이 분기가 두 경우를 받는다. data-ade-kind 속성이 아예 없는 요소와 값이 셋 밖인 요소다.
    // 셋은 object, control, input 이다. 아래에서 속성을 다시 읽어 두 경우를 가른다.
    // 속성이 있는데 kind 가 null 이면 빌드가 ADE-102(kind 값 오류)로 막았어야 할 상태다.
    // 그 상태가 런타임에 도달한 것이라 근거를 남긴다. 판정은 그대로 분류 필요다.
    //
    // 근거를 남기지 않으면 진짜 미선언 요소와 기록이 같아진다.
    // 그러면 파이프라인이 이름은 있는데 kind 가 없다는 것을 따로 추론해야 서비스팀에 알릴 수 있다.
    // getAttribute 가 함수가 아닌 요소는 앞 단계의 scanCollect 가 이미 걸러 냈다.
    const raw = el.getAttribute('data-ade-kind');
    return {
      verdict: 'needs_classification',
      reason: typeof raw === 'string' ? 'ADE-102' : null,
    };
  }

  // data-ade-name 이 없나. 그 상태가 ADE-301(name 누락)이다.
  // 값의 형식이 어긋나는 것은 ADE-302(name 형식 위반)다.
  // 빌드가 필수로 강제하는데도 다시 보는 이유는 검증 CLI 를 CI 에 넣지 않은 서비스가 있기 때문이다.
  if (typeof decl.name !== 'string' || decl.name === '') {
    return { verdict: 'collection_failed', reason: 'ADE-301' };
  }
  if (!isValidName(decl.name)) {
    return { verdict: 'collection_failed', reason: 'ADE-302' };
  }

  if (decl.kind === 'object') {
    // object 인데 role 이 없나. 정상 경로이며 role 을 고르면 된다(ADE-501 role 없는 선언).
    if (decl.role === null) {
      return { verdict: 'needs_classification', reason: 'ADE-501' };
    }

    // role 은 있는데 decl.identity 의 키도 data-ade-identity-static 도 없나.
    // 그 상태가 ADE-507(identity 선언 결손)이다.
    //
    // 빌드가 ADE-104(identity 누락)로 이미 막는 상태다.
    // 그런데 검증 CLI 를 CI 에 넣지 않은 서비스가 허용되어 있다.
    // 그래서 걸러지지 않은 요소가 런타임에 도달할 수 있다.
    // 이미 배포된 코드라 막을 수 없으므로 판정만 남긴다.
    // role 없는 object 는 앞 단계에서 빠져나간다.
    //
    // 키가 있으면 값이 빈 문자열이어도 업무ID 를 제공한 것으로 센다.
    // 여기는 선언이 있는지만 묻고, 빈 값은 ADE-502(조상 값 비어 있음)가 따로 다룬다.
    // hasSelfReference 가 빈 값을 빼는 것은 두 값이 같은지를 묻기 때문이다.
    // 빈 값끼리 같다고 세면 조상 값이 오지 않은 날마다 정상 선언이 분류 필요가 된다.
    const hasIdentity = Object.keys(decl.identity).length > 0;
    if (!hasIdentity && !decl.identityStatic) {
      return { verdict: 'needs_classification', reason: 'ADE-507' };
    }
  }

  // 빌드가 남긴 관계 오류 목록이다.
  const relation = decl.relationErrors.map((code) => `ADE-${code}`);

  // decl.relationErrors 의 원소는 readRelationErrors 가 속성 값을 공백으로 끊은 조각이다.
  // 그 함수는 빈 조각만 버리고 형식은 검사하지 않으므로 번호가 아닌 값도 올 수 있다.
  // 위 relation 은 그 조각마다 ADE- 를 붙인 목록이다.
  //
  // 요소 하나로 드러나는 ADE-505(자기 참조)를 그 목록에 더한다.
  // 빌드만 알 수 있는 관계 오류는 속성으로 넘기고 자기 참조는 런타임이 판정하기로 정했다(DA-178).
  // 근거는 docs/설계/계약-판정과-버전.md 에 있다.
  if (hasSelfReference(decl) && !relation.includes('ADE-505')) {
    relation.push('ADE-505');
  }
  if (relation.length > 0) {
    // 집계 키로 쓰이는 값이라 순서를 고정한다. 흔들리면 같은 상태가 두 값으로 세어진다.
    return { verdict: 'needs_classification', reason: relation.sort().join(' ') };
  }

  // 어느 단계에도 걸리지 않았다.
  return { verdict: 'usable', reason: null };
}

/**
 * 판정 3종을 결정한다. 트리를 돌리고 안전망을 씌운다.
 *
 * 미정 상태를 남기지 않는다.
 * 수집 실패로 판정한 요소에서 원시 행동을 만들지 않는 것은 이 함수를 쓰는 수집 SDK 의 몫이다.
 */
export function resolveVerdict(
  el: Element,
  decl: Declaration | null,
  elementUnsafe: boolean,
): VerdictResult {
  let result: VerdictResult;
  try {
    result = walkTree(el, decl, elementUnsafe);
  } catch {
    // 안전 검사를 할 수 없는 요소를 통과시키면 안전하지 않은 기록이 정상처럼 연결된다(R4).
    // 조상 체인을 끝까지 읽지 못한 경우와 같은 사유를 쓴다. 두 경우는 사유로 갈리지 않는다.
    // 자세한 것은 docs/설계/계약-판정과-버전.md 의 안전망 절에 있다.
    return { verdict: 'collection_failed', reason: 'unreadable' };
  }

  const verdict = applySafetyNet(result.verdict);

  // 안전망이 판정을 바꿨다면 트리가 낸 근거도 더는 그 판정의 근거가 아니다.
  if (verdict !== result.verdict) {
    return { verdict, reason: 'unclassified' };
  }
  return result;
}
