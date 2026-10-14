// index.js 의 타입 선언. 본체가 .js 인 이유는 index.js 머리말에 있다 — 중계 서버가 빌드 없이 같은 파일을
// 읽어야 한다. TS 쪽에는 이 선언으로 타입을 준다.

/** 규칙 적용 뒤에도 남아 있으면 안 되는 벤더 제품명 패턴. */
export declare const VENDOR_LEAK: RegExp;

/**
 * 이름 하나의 벤더 접두어 `mp_` 를 `ade_` 로 바꾼다.
 * @param name 이벤트 이름 또는 속성 키.
 * @return 바뀐 이름. 문자열이 아니면 입력 그대로.
 */
export declare function adeName(name: unknown): unknown;

/**
 * 벤더 제품명이 아직 남아 있는지 본다.
 * @param name 검사할 이름.
 * @return 남아 있으면 true.
 */
export declare function isVendorLeak(name: unknown): boolean;

/**
 * 이벤트의 이름과 속성 키를 전부 바꾼다. 값은 건드리지 않는다.
 * @param data `{event, properties}` 또는 그 배열.
 * @return 같은 객체(제자리 수정).
 */
export declare function adeVendorMask<T>(data: T): T;
