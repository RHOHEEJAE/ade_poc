import { type AdeKind } from '../declaration.js';
/** 선언된 조상을 찾을 때 쓰는 선택자. kind 를 선언한 요소가 곧 선언된 요소다. */
export declare const DECLARED_SELECTOR = "[data-ade-kind]";
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
/**
 * 요소 하나의 `data-ade-*` 를 읽어 kind, role, name, 업무ID, props, 조상 슬롯으로 가른다.
 *
 * 미선언 요소에서도 조상에서 가져온 조상 슬롯을 담아 돌려준다. 그때 `kind` 는 null 이다.
 * `null` 은 읽는 것 자체가 불가능할 때만 돌려준다.
 */
export declare function readDeclaration(el: Element): Declaration | null;
