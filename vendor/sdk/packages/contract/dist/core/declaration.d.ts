import type { Diagnostic } from './diagnostics.js';
export type AdeKind = 'object' | 'control' | 'input';
/** kind 값은 셋으로 고정한다. 값이 늘어나지 않는다(01 §2-1). */
export declare const KINDS: readonly AdeKind[];
/** data-ade-collect 가 인정하는 세 값(01 §2-4). 강한 값을 고르는 판정은 읽기 계약이 한다. */
export declare const COLLECT_VALUES: readonly string[];
/**
 * 정적으로 읽지 못한 속성 값을 나타내는 표식.
 *
 * HTML 속성 값은 문자열이지만 JSX 는 리터럴 숫자와 불리언도 넣을 수 있다.
 * `{p.id}` 같은 표현식은 값을 정적으로 알 수 없으므로 이 심볼로 둔다.
 */
export declare const DYNAMIC: unique symbol;
/**
 * 소스에 글자로 있는데 문자열도 숫자도 아닌 값을 나타내는 표식.
 *
 * `true` 와 `[]` 와 `{}` 가 여기에 해당한다.
 * `DYNAMIC` 과 가르는 이유는 둘의 처리가 반대이기 때문이다.
 * 정적으로 읽지 못한 값은 자료형을 판정하지 않고 넘긴다(01 §6-4).
 * 읽었는데 지원 밖 자료형인 값은 막는다.
 *
 * 직접 결과의 `properties` 값이 이 표식을 쓴다.
 * 화면 선언의 업무 속성은 JSX 표현식 컨테이너를 거치므로 같은 모양이 `DYNAMIC` 으로 들어온다.
 */
export declare const UNSUPPORTED: unique symbol;
/**
 * 업무ID 키와 props 키를 DOM 속성 이름으로 바꾼다. `item_id` 는 `data-ade-item-id` 다.
 * 진단은 위반한 속성 이름을 가리켜야 하므로 검사기가 든 키를 속성 이름으로 되돌린다(01 §7-3).
 * 자동완성이 삽입할 속성을 만들 때 쓰는 변환과 같아서 한 곳에 둔다.
 */
export declare function businessAttrName(key: string): string;
/**
 * 진단 메시지에 값을 적을 때 쓰는 표기다. 값을 읽지 못했다는 사실만 적는다.
 * `Symbol(ade.dynamic)` 이 그대로 나가면 FE 는 소스에 없는 값을 자기 값으로 읽는다.
 * 속성의 위치는 줄 번호와 열 번호가 가리킨다. 상한을 넘는 값은 축약한다(DA-251).
 */
export declare function describeValue(value: AttrValue | undefined): string;
export type AttrValue = string | number | boolean | typeof DYNAMIC;
/** 분해된 선언. 읽기 계약이 이 값으로 신뢰 등급과 코드젠 판정을 계산한다. */
export type ParsedDeclaration = {
    kind?: AdeKind;
    role?: string;
    name?: string;
    /** data-ade-id-key. 업무ID 와 추가 속성을 가르는 키(ADR-003). */
    idKey?: string;
    /** 업무ID. idKey 가 가리키는 속성 하나. */
    businessId?: {
        key: string;
        value: AttrValue;
    };
    /** 추가 속성. idKey 가 가리키지 않는 업무 속성들(키는 snake_case). */
    props: Record<string, AttrValue>;
    /** data-ade-identity-static 이 있는가. 가리킬 인스턴스가 없다는 선언이다(01 §2-4). */
    identityStatic: boolean;
    /** data-ade-impression="off" 로 노출을 껐는가. 속성이 없으면 false 다(01 §2-4). */
    impressionOff: boolean;
    /** data-ade-collect 값. skip, deny, mask 셋이다. 속성이 없으면 undefined 다(01 §2-4). */
    collect?: 'skip' | 'deny' | 'mask';
};
/**
 * identity 판정에 필요한 role 메타. `MergedVocab.roles` 를 그대로 받는다.
 *
 * 나머지 필드를 열어 두는 이유는 어휘가 role 에 `kind` 와 `description` 도 함께 싣기 때문이다.
 * 읽는 필드만 적어 두면 TypeScript 가 그 밖의 필드를 가진 값을 거절한다.
 */
export type RoleMeta = {
    identity_attr?: unknown;
    [key: string]: unknown;
};
export type ParseResult = {
    declaration: ParsedDeclaration;
    diagnostics: Diagnostic[];
};
/**
 * 역할별로 갈라 놓은 속성.
 * 이름에 `raw` 가 붙은 필드는 형식 검사를 거치지 않은 원래 값이다.
 * 그 값이 인정하는 값인지는 부르는 쪽이 다시 본다.
 */
export type SplitDeclarationAttrs = {
    rawKind?: AttrValue;
    role?: string;
    /** 이름의 원래 값. 표현식으로 적힌 경우를 ADE-302 name 형식 위반으로 가려내려고 그대로 담는다. */
    rawName?: AttrValue;
    idKey?: string;
    identityStatic: boolean;
    rawImpression?: AttrValue;
    rawCollect?: AttrValue;
    /** 빌드가 조립한 사용 위치(01 §2-1). FE 는 적지 않는다. */
    placement?: string;
    /** 업무 속성. 업무ID 와 추가 속성이 아직 갈리지 않았다. `data-ade-id-key` 가 가른다. */
    business: Record<string, AttrValue>;
    /** 가장 가까운 선언 조상의 업무ID(01 §2-3). 값이 빈 문자열일 수 있다. */
    parent: Record<string, AttrValue>;
    /** 직속보다 먼 조상. 같은 키는 최근접 하나만 담긴다. 값이 빈 문자열일 수 있다. */
    ancestor: Record<string, AttrValue>;
    /** 같은 키 충돌로 버려진 조상 값의 개수. 슬롯이 아니라 집계값이다. */
    ancestorDropped?: AttrValue;
    /** 빌드가 남긴 관계 오류 코드 목록(01 §2-3). 업무 정보가 아니라 진단이다. */
    rawRelationError?: AttrValue;
};
/**
 * 요소 하나의 `data-ade-*` 속성을 역할별로 가른다. 형식 검사는 하지 않는다.
 *
 * 빌드와 확장이 쓰는 선언 파서와 런타임이 쓰는 읽기 계약이 이 분해를 함께 쓴다.
 * 분해를 두 벌 만들면 빈 값을 어떻게 읽는지가 두 곳에서 갈릴 수 있다.
 * 그 갈림을 막는 것이 SDK 인계 계약의 요구다(03 §1-1).
 * 그래서 빈 문자열을 여기서 지우지 않고 그대로 담는다. 빈 문자열과 부재는 다른 상태다(R1).
 */
export declare function splitAdeAttrs(attrs: Record<string, AttrValue>): SplitDeclarationAttrs;
/**
 * data-ade-id-key 값을 공백이나 쉼표로 나눈 키 목록.
 * 업무ID 키는 하나여야 하므로 조각이 둘 이상이면 이름 검사가 다중 업무ID 로 알린다.
 */
export declare function splitIdKey(idKey: string): string[];
/**
 * 선언 신호가 하나라도 붙어 있는가. 신호는 kind, name, role, 업무 속성이다(01 §7-2).
 * 신호는 속성이 붙어 있는지로 판정하고 값의 형태는 보지 않는다.
 * `data-ade-role={r}` 처럼 표현식으로 적어도 선언하려 한 표시다.
 * data-ade-id-key 는 신호가 아니다.
 * 그 값이 가리키는 업무 속성이 없는 경우는 ADE-107 이 따로 알린다.
 * 선언 파서(ADE-101)와 지원 불가 검사(ADE-403)가 이 판정을 함께 쓴다.
 */
export declare function hasDeclarationSignal(attrs: Record<string, AttrValue>): boolean;
/**
 * 선언 하나의 속성을 분해하고 형식 오류를 진단으로 돌려준다.
 * roles 는 identity 충족 여부를 볼 때만 참조한다. 미등록 role 판정은 하지 않는다.
 * 그 대상은 ADE-104 identity 누락과 ADE-105 identity 오매칭이다.
 */
export declare function parseDeclaration(attrs: Record<string, AttrValue>, roles?: Record<string, RoleMeta>): ParseResult;
