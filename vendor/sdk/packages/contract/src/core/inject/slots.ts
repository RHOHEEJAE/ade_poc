// 런타임 폴백 — 조상 슬롯 속성을 요소에 붙인다.
//
// 조상 슬롯은 `data-ade-parent-*` 와 `data-ade-ancestor-*` 속성이다.
// 이 속성은 이 요소의 조상이 어떤 업무ID 를 선언했는지를 담는다.
// 빌드 플러그인이 React 소스에 넣는 것과 같은 속성이다.
// Babel 을 쓸 수 없는 스택에서는 브라우저가 DOM 트리를 훑어 그 속성을 만든다(DA-104).
//
// 값이 빌드 주입과 언제나 같지는 않다.
// Portal 과 형제 관계와 서드파티 컴포넌트에서는 DOM 조상 체인이 끊겨 폴백도 조상을 찾지 못한다.
// 그때는 FE 가 손으로 적는다.
//
// 이 파일이 맡는 것은 붙이는 규칙과 다시 계산하는 규칙이다.
// 조상 목록을 만드는 일은 collectCtx 가 맡는다.
// 그 목록을 속성 이름과 값의 쌍으로 바꾸는 일은 foldSlots 가 맡는다.
//
// 빌드 경로는 조상 슬롯을 매 렌더 다시 만들지만 폴백은 한 번 붙이고 끝난다.
// 그래서 폴백은 자기가 붙인 속성 이름을 요소에 적어 두고 그 이름만 다시 계산한다(DA-228).
//
// 폴백은 요소 자신의 업무ID 속성이 없을 때 빈 문자열로 붙이는 일도 맡는다(DA-252).
//
// 주입 시점과 갱신 규칙은 docs/설계/주입-시점과-폴백.md 에 있다.

import { foldSlots } from '../fold.js';
import { DECLARED_SELECTOR } from '../contract/read.js';
import { businessAttrName } from '../declaration.js';
import { collectCtx } from './collect.js';

/** 폴백이 붙인 조상 슬롯의 속성 이름 목록을 담는 속성이다(01 선언 계약 §2-3). */
const MARK_ATTR = 'data-ade-fallback-slots';

/** 표식에 적힌 속성 이름. 표식이 없으면 빈 집합이다. */
function readMark(el: Element): Set<string> {
  const raw = el.getAttribute(MARK_ATTR);
  if (raw === null) {
    return new Set();
  }
  return new Set(raw.split(' ').filter((name) => name !== ''));
}

/**
 * 표식을 다시 적는다. 남은 이름이 없으면 속성 자체를 제거한다.
 *
 * 빈 값으로 두면 「폴백이 돌았는데 붙일 것이 없었다」와 구분되지 않는다(01 §2-3).
 * 오름차순으로 고정해야 같은 상태의 요소가 같은 값을 갖는다.
 */
function writeMark(el: Element, names: Set<string>): void {
  if (names.size === 0) {
    el.removeAttribute(MARK_ATTR);
    return;
  }
  el.setAttribute(MARK_ATTR, [...names].sort().join(' '));
}

/** 요소가 자기 업무ID 로 무엇을 선언했는지 가리키는 속성(01 선언 계약 §2-2). */
const ID_KEY_ATTR = 'data-ade-id-key';

/** 선언된 요소임을 나타내는 속성. 빌드 경로도 이 속성이 있는 요소만 감싼다. */
const KIND_ATTR = 'data-ade-kind';

/**
 * `data-ade-id-key` 가 가리키는 업무ID 속성이 없으면 빈 문자열로 붙인다(DA-252).
 * 속성이 없으면 값이 오지 않은 올바른 선언이 ADE-507 로 읽히기 때문이다(03 §4).
 * 붙인 이름을 출처 표식에 적지 않는 이유는 docs/설계/주입-시점과-폴백.md 에 있다.
 */
function keepIdentityAttr(el: Element): void {
  if (!el.hasAttribute(KIND_ATTR)) {
    return;
  }
  const idKey = el.getAttribute(ID_KEY_ATTR);
  if (idKey === null || idKey === '') {
    return;
  }
  const name = businessAttrName(idKey);
  try {
    if (!el.hasAttribute(name)) {
      el.setAttribute(name, '');
    }
  } catch {
    // 키에 공백 같은 문자가 있으면 속성 이름이 될 수 없어 setAttribute 가 예외를 던진다.
    // 그 키는 빌드가 ADE-202 로 막는 값이다. 여기서 멈추면 조상 슬롯까지 채우지 못한다.
  }
}

/**
 * 요소의 조상 슬롯을 채운다. 같은 이름의 속성이 이미 있으면 그 이름만 건너뛴다.
 *
 * 건너뛰지 않으면 FE 가 손으로 적은 값을 빈 문자열이 덮는다(02 빌드 주입 §3).
 * 붙인 이름만 표식에 적으므로 여러 번 불러도 결과가 같다.
 * 이 함수는 요소가 선언된 것인지 검사하지 않는다.
 * observe.ts 와 ensureSlots 는 선언된 요소만 넘긴다.
 * 패키지 밖에서 부르는 곳은 그 보장을 주지 않는다.
 */
export function injectSlots(el: Element): void {
  keepIdentityAttr(el);

  const attrs = foldSlots(collectCtx(el));
  const marked = readMark(el);
  let added = false;

  for (const [name, value] of Object.entries(attrs)) {
    if (el.hasAttribute(name)) {
      continue;
    }
    el.setAttribute(name, value);
    marked.add(name);
    added = true;
  }

  if (added) {
    writeMark(el, marked);
  }
}

/**
 * 조상 슬롯 속성의 두 접두사. 정본은 이 값을 만드는 fold.ts 이고 여기는 읽는 쪽이다.
 *
 * 잘린 개수를 담는 `data-ade-ancestor-dropped` 도 뒤 접두사로 시작해 아래 검사에 걸린다.
 * 그 속성은 같은 키가 둘 이상일 때만 붙으므로 슬롯 없이 홀로 있을 수 없다(fold.ts 44행).
 */
const SLOT_PREFIXES: readonly string[] = ['data-ade-parent-', 'data-ade-ancestor-'];

/** 이 요소에 조상 슬롯이 하나라도 있는가. */
function hasSlots(el: Element): boolean {
  return el
    .getAttributeNames()
    .some((name) => SLOT_PREFIXES.some((prefix) => name.startsWith(prefix)));
}

/**
 * 폴백이 붙인 슬롯만 다시 계산해 덮는다. 표식에 없는 이름은 손대지 않는다.
 *
 * 잘린 개수 속성도 같은 규칙으로 처리한다. 접기가 그 속성을 다른 슬롯과 함께 내기 때문이다.
 */
function refreshSlots(el: Element, marked: Set<string>): void {
  const attrs = foldSlots(collectCtx(el));

  // 더 이상 나오지 않는 이름은 속성과 표식에서 함께 제거한다.
  for (const name of marked) {
    if (Object.hasOwn(attrs, name)) {
      continue;
    }
    el.removeAttribute(name);
    marked.delete(name);
  }

  for (const [name, value] of Object.entries(attrs)) {
    // 표식에 없는데 요소에 있는 것은 FE 가 직접 적은 값이다(02 §3).
    if (!marked.has(name) && el.hasAttribute(name)) {
      continue;
    }
    el.setAttribute(name, value);
    marked.add(name);
  }

  writeMark(el, marked);
}

/**
 * 폴백이 붙인 슬롯을 다시 계산하고, 슬롯이 하나도 없으면 채운다.
 *
 * 수집 SDK 가 세 수집 경로 모두에서 선언을 읽기 직전에 부른다(03 SDK 인계 계약 §1-4).
 * 선언하지 않은 요소를 받으면 그 요소 대신 가장 가까운 선언 조상을 보완한다.
 * 그 요소의 조상 정보는 readDeclaration 이 가장 가까운 선언 조상에서 읽기 때문이다.
 * 표식이 없는 요소에 조상 슬롯이 하나라도 있으면 그 요소의 슬롯을 하나도 채우지 않는다.
 * injectSlots 는 같은 이름의 속성이 있을 때 그 이름만 건너뛰므로 이 점이 다르다.
 * 일부만 채우면 손으로 적은 값과 자동으로 만든 값이 한 요소에 섞여 다중 부모(ADE-504)가 된다.
 * 배경은 docs/설계/주입-시점과-폴백.md 에 있다.
 */
export function ensureSlots(el: Element): void {
  if (!el.hasAttribute(KIND_ATTR)) {
    // readDeclaration 의 미선언 요소 처리와 같은 방법으로 조상을 찾는다.
    const declared = el.parentElement?.closest(DECLARED_SELECTOR) ?? null;
    if (declared !== null) {
      ensureSlots(declared);
    }
    return;
  }

  // 아래 두 갈래는 요소 단위로 건너뛰므로 업무ID 속성은 그보다 먼저 붙인다.
  keepIdentityAttr(el);

  const marked = readMark(el);
  if (marked.size > 0) {
    refreshSlots(el, marked);
    return;
  }
  if (hasSlots(el)) {
    return;
  }
  injectSlots(el);
}
