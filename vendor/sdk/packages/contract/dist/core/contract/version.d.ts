/**
 * 계약 패키지가 담은 읽기 규칙의 버전.
 *
 * 규칙 버전과 같은 값을 쓴다.
 * 규칙을 한 엔진에서 내고 입구만 셋으로 둔다는 결정 때문이다(ADR-006).
 * 두 값이 갈리면 어느 쪽이 규칙의 버전인지 판단해야 하는 경우가 생긴다.
 */
export declare const CONTRACT_VERSION = "0.1.0";
export type ContractVersionCheck = {
    ok: boolean;
    /** 부르는 쪽이 기대한 버전. */
    expected: string;
    /** 이 패키지가 담은 버전. */
    actual: string;
    /** 어긋났을 때의 설명. 통과하면 null 이다. */
    message: string | null;
};
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
export declare function isCompatibleVersion(expected: string, actual: string): boolean;
/**
 * 수집 SDK 가 기대하는 버전과 이 패키지의 버전이 맞는지 본다. 초기화 때 한 번 부른다.
 *
 * 어긋나도 예외를 던지지 않는다. 어떻게 알릴지는 부르는 쪽이 정한다.
 * 계약 패키지가 서비스를 멈추는 일은 없어야 한다.
 */
export declare function checkContractVersion(expected: string): ContractVersionCheck;
