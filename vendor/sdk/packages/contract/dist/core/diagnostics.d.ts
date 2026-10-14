/**
 * 값 길이의 상한. JS 문자열 length 기준이고 UTF-16 코드 유닛을 센다.
 * 수집 단계가 값을 자르는 기준이고, `ADE-111` 과 `ADE-704` 가 진단을 낼지 정하는 기준이다(DA-251).
 */
export declare const VALUE_LENGTH_LIMIT = 255;
/**
 * {@link abbreviate} 가 남기는 앞자리 길이이자, 축약할지 판정하는 기준이다.
 * 진단 메시지와 인용 줄의 출력 폭을 줄이는 값이라 수집 단계의 절단 기준과는 다르다(DA-251).
 */
export declare const ABBREVIATE_PREFIX_LENGTH = 40;
/**
 * 진단 메시지에 인용할 값을 축약한다.
 *
 * `value` 칸과 달리 메시지 문장은 값을 아예 빼면 무엇을 가리키는지 알 수 없다.
 * 그래서 앞 {@link ABBREVIATE_PREFIX_LENGTH} 자만 남기고 뒤는 총 길이로 대신한다.
 * {@link ABBREVIATE_PREFIX_LENGTH} 이하 값은 그대로 돌려준다.
 *
 * 앞자리 경계가 서로게이트 쌍의 가운데를 가르면 그 쌍을 통째로 뺀다.
 * 반으로 자르면 짝을 잃은 상위 서로게이트 하나만 남는다.
 */
export declare function abbreviate(value: string): string;
export type Severity = 'error' | 'warning' | 'info';
export type Diagnostic = {
    /** ADE-xxx 코드. 진단을 되짚는 안정 식별자다. */
    code: string;
    /** error 만 빌드를 막는다. warning 과 info 는 표시만 한다. */
    severity: Severity;
    /** 사람이 읽는 메시지. 한국어 이름을 쓴다. */
    message: string;
    /** 진단이 가리키는 파일 경로. 위치를 모르면 없다. */
    file?: string;
    /** 파일 안의 줄 번호(1부터). */
    line?: number;
    /** 그 줄 안의 열 번호(1부터). 진단 출력 `파일:줄:열` 의 마지막 값이다(01 선언 계약 §7-3). */
    column?: number;
    /** 고치는 방법 힌트. */
    hint?: string;
    /**
     * 위반한 속성 이름. 검사기가 담는 위치 정보는 이 하나뿐이다.
     * 소스의 줄, 열, 값은 워크스페이스 층이 이 이름을 보고 채운다.
     * 가리킬 속성이 없는 누락 계열 진단은 비운다.
     */
    attr?: string;
    /**
     * 그 속성의 소스 리터럴 값. 동적 표현식은 비운다.
     * `{p.id}` 안의 실제 값을 검증 CLI 는 읽을 수 없다.
     * 읽을 수 없는 값이 진단에 담기는 경로도 없어야 한다(01 선언 계약 §7-3).
     * 근거는 진단에 실제 입력값이 담기지 않아야 한다는 수용 기준이다(수용 기준 ③).
     */
    value?: string;
    /** 유사 후보. `ADE-201` 미등록 role 의 「비슷한 것: banner」가 이 항목이다(01 선언 계약 §7-2). */
    candidates?: readonly string[];
    /** ADE-501 전용 필드다. role 없는 object 가 업무ID 나 확인 표시를 가지면 어느 쪽인지 담는다. */
    identity?: 'business-id' | 'static';
};
/**
 * 빌드를 막아야 하는 진단이 있는가.
 * error 심각도가 하나라도 있으면 참이다.
 * 런타임 폴백으로 내려간 요소가 있다는 것만으로는 빌드를 막지 않는다(DA-92 수용 기준 ①).
 */
export declare function hasBlockingError(diagnostics: readonly Diagnostic[]): boolean;
