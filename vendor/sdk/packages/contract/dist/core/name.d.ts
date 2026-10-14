import type { Diagnostic } from './diagnostics.js';
/** 이름 형식. 접두사에 role 을 담지 않는다(01 §2-1). */
export declare const NAME_PATTERN: RegExp;
/** 이름이 실릴 수 있는 두 위치. 위치에 따라 진단 문구가 달라진다. */
export type NameSiteKind = 'screen' | 'outcome';
/** 값이 이름 형식을 지켰는가. 문자열이 아니면 정적으로 읽을 수 없는 값이라 거짓이다. */
export declare function isValidName(value: unknown): value is string;
/** 이름이 실리는 위치를 사람이 읽는 말로 적은 것. 진단 문구에 그대로 들어간다. */
export declare function nameSiteLabel(site: NameSiteKind): string;
/**
 * 이름 규칙을 검사한다. 이름이 없으면 ADE-301 name 누락이다.
 * 형식이 어긋나거나 값이 리터럴이 아니면 ADE-302 name 형식 위반이다.
 *
 * 언제 검사할지는 부르는 쪽이 정한다.
 * 화면 선언은 data-ade-kind 가 있을 때만 부른다. kind 가 없으면 선언이 아니기 때문이다.
 * 직접 결과는 호출 자체가 선언이므로 언제나 부른다.
 * 검사는 값의 출처를 보지 않는다. FE 가 손으로 적은 이름도 같은 규칙으로 판정한다(01 §1).
 */
export declare function checkName(name: unknown, site: NameSiteKind): Diagnostic[];
