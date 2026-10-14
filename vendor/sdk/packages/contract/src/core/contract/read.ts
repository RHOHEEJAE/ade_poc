// 읽기 계약 — 요소 하나의 선언을 읽는다(DA-103).
//
// 코드젠이 DOM 에 남긴 것을 어떻게 읽어야 하는가를 정한다.
// 언제 부를지와 결과로 무엇을 할지는 수집 SDK 가 정한다.
// 이 모듈의 함수는 부작용이 없고 이벤트를 만들지 않는다.
//
// 속성 분해는 선언 파서가 만든 splitAdeAttrs 를 재사용한다.
// 같은 분해를 두 벌 만들면 빈 값을 어떻게 읽는지가 두 곳에서 갈릴 수 있다.
// 세 수집 경로가 같은 해석 결과를 내야 한다는 요구가 그 상태를 막는다(03 SDK 인계 계약 §1-1).

import { splitAdeAttrs, type AdeKind, type AttrValue } from '../declaration.js';

/**
 * kind 는 object, control, input 셋에서 늘지 않는다(01 §2-1).
 * 그 밖의 값은 빌드가 ADE-102 kind 값 오류로 막는다.
 */
const KINDS: readonly string[] = ['object', 'control', 'input'];

/** 선언된 조상을 찾을 때 쓰는 선택자. kind 를 선언한 요소가 곧 선언된 요소다. */
export const DECLARED_SELECTOR = '[data-ade-kind]';

/** 한 요소에서 읽어낸 선언. 판정, 등급, 승격 세 축의 재료가 여기 다 들어 있다. */
export type Declaration = {
  /** 미선언 요소는 null 이다. 조상을 한 번 찾아 조상 슬롯만 가져온 경우다(규칙 R3). */
  kind: AdeKind | null;
  /** object 에만 있을 수 있다. 없으면 null 이며 정상 경로다. */
  role: string | null;
  /**
   * 선언 이름. data-ade-name 속성이 없으면 빈 문자열이다.
   * kind 가 있는데 이 값이 빈 문자열이면 선언이 불완전한 것이다.
   */
  name: string;
  /** 이 요소 자신의 업무ID. data-ade-id-key 로 가른다. 한 선언의 identity 는 하나다. */
  identity: Record<string, string>;
  /** 맥락 속성. 하위로 상속하지 않는다. */
  props: Record<string, string>;
  /** 가장 가까운 선언 조상의 업무ID. 값이 빈 문자열일 수 있다. */
  parent: Record<string, string>;
  /** 그보다 먼 조상. 같은 키는 최근접 하나만 담긴다. 값이 빈 문자열일 수 있다. */
  ancestor: Record<string, string>;
  /** 같은 키 충돌로 버려진 조상 값의 개수. 0 이면 속성이 없다. */
  ancestorDropped: number;
  /**
   * 빌드가 남긴 관계 오류 코드. 표식 속성이 없으면 빈 배열이다.
   * 빌드만 판정할 수 있는 관계 오류를 속성에 실어 런타임으로 넘긴다(01 §2-3, DA-178).
   */
  relationErrors: string[];
  /** 빌드가 조립한 사용 위치. 없으면 null 이며 위치를 모르는 것이다. */
  placement: string | null;
  /** 업무ID 가 없는 것이 실수가 아니라 선언임을 표시한 요소인가. */
  identityStatic: boolean;
  /** 노출 수집을 껐는가. */
  impressionOff: boolean;
};

/** DOM 속성은 언제나 문자열이다. 분해 계층은 빌드용 값도 받으므로 여기서 좁힌다. */
function asText(value: AttrValue): string {
  return typeof value === 'string' ? value : String(value);
}

function asTextMap(source: Record<string, AttrValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = asText(value);
  }
  return out;
}

/** 계약이 쓰는 속성의 접두사. 선언은 이 접두사가 붙은 속성으로만 이루어진다(01 §1). */
const PREFIX = 'data-ade-';

/** 요소의 data-ade-* 속성을 이름과 값의 쌍으로 모은다. 읽을 수 없으면 null 이다. */
function collectAttrs(el: Element): Record<string, AttrValue> | null {
  const names = el.getAttributeNames?.();
  if (names === undefined) {
    return null;
  }

  const attrs: Record<string, AttrValue> = {};
  for (const name of names) {
    // 접두사로 먼저 거른다.
    // 계약 함수는 클릭, 노출, 제출마다 불린다.
    // 요소 하나에 class, style, aria-* 속성이 여럿 붙는 것이 보통이다.
    // 거르지 않으면 그 속성들까지 매번 읽는다. 계약 패키지에는 크기와 성능 예산이 있다(04 §7).
    if (!name.startsWith(PREFIX)) {
      continue;
    }
    // 존재하는데 값이 없는 속성(data-ade-identity-static)은 빈 문자열로 온다.
    attrs[name] = el.getAttribute(name) ?? '';
  }
  return attrs;
}

/**
 * 요소 하나의 `data-ade-*` 를 읽어 kind, role, name, 업무ID, props, 조상 슬롯으로 가른다.
 *
 * 미선언 요소에서도 조상에서 가져온 조상 슬롯을 담아 돌려준다. 그때 `kind` 는 null 이다.
 * `null` 은 읽는 것 자체가 불가능할 때만 돌려준다.
 */
export function readDeclaration(el: Element): Declaration | null {
  try {
    return read(el);
  } catch {
    // 계약 패키지가 넘기는 함수가 예외를 던지면 수집 SDK 가 감싸도 위험이 남는다.
    // 계약 패키지는 잘못된 입력에도 안전한 기본값을 돌려준다(04 검증 전략 §3-8).
    // 읽지 못한 것은 읽지 못했다고 답한다.
    return null;
  }
}

function read(el: Element): Declaration | null {
  if (el === null || typeof el !== 'object') {
    return null;
  }

  const attrs = collectAttrs(el);
  if (attrs === null) {
    return null;
  }

  const split = splitAdeAttrs(attrs);

  // 값이 셋 밖인 요소는 빌드가 ADE-102 kind 값 오류로 막는 상태다.
  // 모르는 값을 셋 중 하나로 지어내지 않고 null 로 둔다.
  const rawKind = split.rawKind === undefined ? undefined : asText(split.rawKind);
  const kind = rawKind !== undefined && KINDS.includes(rawKind) ? (rawKind as AdeKind) : null;

  const business = asTextMap(split.business);
  const identity: Record<string, string> = {};
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(business)) {
    if (split.idKey !== undefined && key === split.idKey) {
      identity[key] = value;
    } else {
      props[key] = value;
    }
  }

  // 선언된 요소에서는 업무ID 조상 슬롯을 다시 계산하지 않는다(규칙 R2). 이미 요소에 찍혀 있다.
  const declaration: Declaration = {
    kind,
    role: split.role ?? null,
    name: typeof split.rawName === 'string' ? split.rawName : '',
    identity,
    props,
    parent: asTextMap(split.parent),
    ancestor: asTextMap(split.ancestor),
    ancestorDropped: readDropped(split.ancestorDropped),
    relationErrors: readRelationErrors(split.rawRelationError),
    placement: split.placement ?? null,
    identityStatic: split.identityStatic,
    impressionOff: split.rawImpression === 'off',
  };

  // 선언 여부는 값이 아니라 속성의 존재로 가른다.
  // 값이 셋 밖인 요소는 빌드가 막는 상태이지 미선언 요소가 아니다.
  // 그런 요소가 자기 자신을 조상으로 가져오면 안 된다.
  if (split.rawKind !== undefined) {
    return declaration;
  }

  return liftAncestorSlots(el, declaration);
}

/**
 * 미선언 요소가 선언 조상에서 조상 슬롯을 가져온다.
 * `closest` 를 한 번만 쓰고 조상 체인을 여러 단 훑지 않는다(규칙 R3).
 * 탐색을 넓히면 예외가 원칙을 대신하게 된다.
 *
 * 예외를 둔 이유는 선언하지 않은 요소를 클릭했을 때 무엇을 눌렀는지만 남기 때문이다.
 * 어느 상품이었는지는 함께 사라진다. 기능정의서가 승인한 예외다(확정사항 5).
 */
function liftAncestorSlots(el: Element, base: Declaration): Declaration {
  const found = el.parentElement?.closest?.(DECLARED_SELECTOR) ?? null;
  if (found === null) {
    return base;
  }

  // 조상은 kind 를 선언한 요소이므로 이 재귀 호출에서 조상 탐색이 다시 일어나지 않는다.
  const outer = readDeclaration(found);
  if (outer === null) {
    return base;
  }

  // 슬롯을 한 단계씩 밀어 넣는다.
  // 미선언 요소의 입장에서 찾은 조상이 직속 조상이다(03 §2).
  // 조상의 identity 값이 parent 슬롯으로 가고 조상의 parent 는 ancestor 슬롯으로 간다.
  const ancestor: Record<string, string> = { ...outer.parent };
  let dropped = outer.ancestorDropped;

  // 조상의 먼 조상도 ancestor 슬롯에 합친다.
  // 키가 겹치면 더 가까운 조상의 값을 남기고 버린 개수를 센다.
  // 조상 슬롯을 채울 때 쓰는 최근접 우선 규칙을 여기에도 같게 적용한 것이다(01 §2-3).
  for (const [key, value] of Object.entries(outer.ancestor)) {
    if (key in ancestor) {
      dropped += 1;
    } else {
      ancestor[key] = value;
    }
  }

  return { ...base, parent: { ...outer.identity }, ancestor, ancestorDropped: dropped };
}

/**
 * 관계 오류 코드 목록. 속성이 없으면 빈 배열이다.
 *
 * 코드 형식을 검사하지 않는다. 빌드가 적은 것을 그대로 옮기는 것이 이 함수의 일이다.
 * 검사하지 않는 이유는 docs/설계/계약-판정과-버전.md 에 있다.
 */
function readRelationErrors(value: AttrValue | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return asText(value)
    .split(' ')
    .filter((code) => code !== '');
}

/** 조상 잘림 개수. 속성이 없거나 숫자로 읽히지 않으면 0 이다. 집계용이며 오류가 아니다. */
function readDropped(value: AttrValue | undefined): number {
  if (value === undefined) {
    return 0;
  }
  const parsed = Number.parseInt(asText(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
