// 읽기 계약 — 계약 패키지의 버전을 검사한다(DA-103).
//
// 어휘 버전 불일치를 ADE-206 형식 버전 불일치로 판정하는 것과 같은 장치를 규칙 코드에도 둔다.
// 비교 기준은 npm 의 `^` 와 같다. 검사는 초기화 때 한 번 한다.
//
// 버전이 어긋나는 경위와 검사 지점을 정한 근거는 docs/설계/계약-판정과-버전.md 에 있다.

import { RULE_VERSION } from '../version.js';

/**
 * 계약 패키지가 담은 읽기 규칙의 버전.
 *
 * 규칙 버전과 같은 값을 쓴다.
 * 규칙을 한 엔진에서 내고 입구만 셋으로 둔다는 결정 때문이다(ADR-006).
 * 두 값이 갈리면 어느 쪽이 규칙의 버전인지 판단해야 하는 경우가 생긴다.
 */
export const CONTRACT_VERSION = RULE_VERSION;

export type ContractVersionCheck = {
  ok: boolean;
  /** 부르는 쪽이 기대한 버전. */
  expected: string;
  /** 이 패키지가 담은 버전. */
  actual: string;
  /** 어긋났을 때의 설명. 통과하면 null 이다. */
  message: string | null;
};

// 프리릴리스 식별자 하나다. 숫자로만 된 식별자는 앞자리 0 을 받지 않는다.
const PRE_ID = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][\dA-Za-z-]*)`;
// SemVer 2.0.0 문법이다. 주, 부, 패치 숫자는 앞자리 0 을 받지 않는다.
// 프리릴리스는 네 번째 묶음으로 꺼낸다.
// + 뒤의 빌드 메타데이터는 형식만 검사하고 꺼내지 않는다.
const SEMVER = new RegExp(
  String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)` +
    String.raw`(?:-(${PRE_ID}(?:\.${PRE_ID})*))?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$`,
);

type Parsed = { core: [number, number, number]; pre: string[] };

/**
 * SemVer 문자열을 주, 부, 패치 숫자와 프리릴리스 식별자 목록으로 가른다.
 * 형식이 틀리면 null 이다.
 */
function parse(version: unknown): Parsed | null {
  if (typeof version !== 'string') {
    return null;
  }
  const match = SEMVER.exec(version);
  if (match === null) {
    return null;
  }
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] === undefined ? [] : match[4].split('.'),
  };
}

/**
 * 두 프리릴리스 식별자 목록의 순서를 낸다. a 가 낮으면 음수, 같으면 0, 높으면 양수다.
 *
 * 순서는 SemVer 2.0.0 의 우선순위 규칙을 따른다.
 * 정식 버전은 주, 부, 패치 버전이 같은 프리릴리스보다 높다.
 * 숫자 식별자는 숫자로 비교한다.
 * 숫자 식별자는 영문 식별자보다 낮다.
 * 앞 식별자가 모두 같으면 식별자가 더 많은 쪽이 높다.
 */
function comparePre(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return b.length - a.length;
  }
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === y) {
      continue;
    }
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum !== yNum) {
      return xNum ? -1 : 1;
    }
    // 숫자 식별자는 앞자리 0 이 없으므로 자릿수가 많은 쪽이 크다.
    if (xNum && x.length !== y.length) {
      return x.length - y.length;
    }
    return x < y ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * 바뀌면 읽기 규칙이 갈리는 비교 자릿수를 낸다.
 *
 * 왼쪽에서 첫 번째 0 이 아닌 자리까지 비교한다.
 * 그 자릿수를 정하는 SemVer 규칙은 docs/설계/계약-판정과-버전.md 에 있다.
 */
function wallDepth(parts: [number, number, number]): number {
  if (parts[0] !== 0) {
    return 1;
  } // 1.x.y 는 주 버전만 비교한다
  if (parts[1] !== 0) {
    return 2;
  } // 0.x.y 는 주 버전과 부 버전을 비교한다
  return 3; // 0.0.x 는 셋을 모두 비교한다
}

/**
 * 두 버전이 같은 읽기 규칙을 담고 있는가. npm 의 `^` 와 같은 기준이다.
 *
 * 두 값은 SemVer 2.0.0 형식이어야 한다. 형식이 틀리면 어긋난 것으로 본다.
 * 빌드 메타데이터(+ 뒤)는 비교하지 않는다.
 * 프리릴리스(- 뒤)는 순서 비교에 쓴다.
 * 실제 버전이 프리릴리스이면 기대 버전도 주, 부, 패치 버전이 같은 프리릴리스일 때만 받는다.
 *
 * 수집 SDK 의 `package.json` 의존 범위와 런타임 검사가 같은 기준이어야 한다.
 * 두 층이 다른 답을 내면 검사 통과가 버전이 맞는다는 근거가 되지 못한다.
 * npm 이 호환되지 않는다고 보는 조합을 이 검사가 통과시키는 경우가 그것이다.
 *
 * 이 함수는 수집 SDK 가 아는 버전과 실제 설치된 버전만 견준다.
 * DOM 을 찍은 빌드의 규칙 버전은 빌드 플러그인이 `globalThis.__ADE_BUILD__` 에 남긴다(DA-136).
 * 수집 SDK 가 그 값을 이 함수에 넣으면 빌드와 런타임의 규칙이 갈렸는지 볼 수 있다.
 * 그 값은 이벤트를 만드는 시점에 읽는다. 모듈 초기화 때 읽으면 값이 비어 있다(규칙 R6).
 */
export function isCompatibleVersion(expected: string, actual: string): boolean {
  const wanted = parse(expected);
  const have = parse(actual);

  // 비교할 수 없는 값을 통과시키면 검사를 붙인 뜻이 없다.
  if (wanted === null || have === null) {
    return false;
  }

  // 실제 버전이 프리릴리스이면 기대 버전도 같은 주, 부, 패치 버전의 프리릴리스여야 한다.
  // npm 의 `^` 가 이 조건에서만 프리릴리스를 받는다.
  // 프리릴리스는 정식 버전과 달리 호환을 약속하지 않기 때문이다.
  if (have.pre.length > 0) {
    if (wanted.pre.length === 0) {
      return false;
    }
    if (wanted.core.some((part, i) => part !== have.core[i])) {
      return false;
    }
  }

  // 비교하는 자릿수가 같아야 한다. 둘 중 엄격한 쪽을 따른다.
  // 느슨한 쪽에 맞추면 검사가 걸러 내는 조합이 줄어든다.
  const depth = Math.max(wallDepth(wanted.core), wallDepth(have.core));
  for (let i = 0; i < depth; i += 1) {
    if (wanted.core[i] !== have.core[i]) {
      return false;
    }
  }

  // 실제가 기대보다 낮아도 어긋난 것이다. `^1.2.0` 이 `>=1.2.0` 인 것과 같다.
  // 수집 SDK 가 1.2.0 기준으로 짠 코드에 1.0.0 이 설치되면 없는 함수를 부르게 된다.
  for (let i = 0; i < 3; i += 1) {
    if (have.core[i] !== wanted.core[i]) {
      return have.core[i] > wanted.core[i];
    }
  }
  // 주, 부, 패치 버전이 같으면 프리릴리스 순서로 가른다. 1.2.0-beta.1 은 1.2.0 보다 낮다.
  return comparePre(have.pre, wanted.pre) >= 0;
}

/**
 * 수집 SDK 가 기대하는 버전과 이 패키지의 버전이 맞는지 본다. 초기화 때 한 번 부른다.
 *
 * 어긋나도 예외를 던지지 않는다. 어떻게 알릴지는 부르는 쪽이 정한다.
 * 계약 패키지가 서비스를 멈추는 일은 없어야 한다.
 */
export function checkContractVersion(expected: string): ContractVersionCheck {
  const shown = typeof expected === 'string' ? expected : String(expected);

  if (!isCompatibleVersion(expected, CONTRACT_VERSION)) {
    return {
      ok: false,
      expected: shown,
      actual: CONTRACT_VERSION,
      message: `계약 패키지 버전이 다릅니다: 기대 ${shown}, 실제 ${CONTRACT_VERSION}. 버전이 다르면 같은 화면 요소를 다르게 판정할 수 있습니다`,
    };
  }

  return { ok: true, expected: shown, actual: CONTRACT_VERSION, message: null };
}
