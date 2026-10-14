/**
 * 인증 · 결제 맥락의 요소인지 본다. 여기 걸리면 이벤트 자체를 만들지 않는다.
 *
 * 벤더 자체 검사는 카드번호 · 미국 SSN 정규식만 본다. 국내 주민번호 · 계좌번호는 안 잡히므로
 * 이 함수가 필요하다.
 *
 * @param el 검사할 요소. 비밀번호 · 카드 입력, 그런 입력을 품은 폼, 결제 · 인증 문맥의 조상을 본다.
 * @return 민감하면 true. 예외가 나면 true — 판정할 수 없으면 안전한 쪽으로 막는다.
 */
export declare function isSensitiveElement(el: Element): boolean;
/**
 * 직접 결과(`adesdk.track`)의 속성 키가 민감해 보이는지 본다. 걸리면 그 키만 싣지 않는다.
 *
 * `isSensitiveElement` 가 요소를 보고 하는 판정을 키 이름으로 한다. 같은 낱말 목록(`SENSITIVE_WORDS`)을
 * 쓰되, 키는 `snake_case` · `camelCase` 라 토막 단위로 본다 — `hotel_id` · `author_id` 는 통과하고
 * `card_no` · `cardNo` · `user_email` 은 걸린다.
 *
 * @param key FE 가 넘긴 속성 키.
 * @return 민감하면 true. 문자열이 아니거나 토막이 하나도 없으면 true — 판정할 수 없으면 안전한 쪽으로.
 */
export declare function isSensitiveKey(key: unknown): boolean;
/**
 * 마스킹 대상 이벤트의 속성에서 지울 것을 지운다.
 *
 * `$elements`(조상 배열) 전체를 훑어야 한다. 대상 요소만 지우면 조상 배열의 `$attr-href` 와
 * `$el_text` 가 남는다.
 *
 * 던지지 않는다. 지우다 실패하면 남은 것은 그대로 둔다.
 *
 * @param props 이벤트 생성 시점의 속성 객체(제자리 수정). `$el_text` 를 지우고 `$el_attr__href` ·
 *   `$elements[].$attr-href` 의 쿼리를 뗀다.
 */
export declare function applyMask(props: Record<string, unknown>): void;
/** 벤더가 문자열을 자르는 길이. 단위는 JS `.length`(UTF-16 코드 유닛) — 벤더가 `slice(0, 255)` 로 자르므로 같은 단위로 센다. */
export declare const VENDOR_MAX_STRING = 255;
/**
 * `adesdk.identify(userId)` 이 받을 수 있는 사용자 ID 인가(DA-279).
 *
 * 공백이 아닌 문자열이고 벤더가 자르는 길이 이하여야 한다 — 잘린 ID 는 다른 사람의 ID 가 된다.
 * `@` 가 든 값은 이메일로 보고 받지 않는다. 사용자 ID 는 회원번호 같은 내부 값이어야 한다.
 * `$device:` 로 시작하는 값도 받지 않는다 — 벤더 `identify()` 가 이 접두어를 조용히 거부해(`mixpanel.cjs.js:30406`) 세션만 바뀌고 익명 `$ade_login` 이 나간다.
 * 값은 다듬지 않는다 — 앞뒤 공백을 지우면 보낸 값과 실린 값이 달라진다.
 *
 * @param v 서비스가 넘긴 값.
 * @return 받을 수 있으면 true.
 */
export declare function isValidUserId(v: unknown): v is string;
/**
 * `adesdk.set_group(key, ids)` 이 받을 수 있는 그룹 키의 형식인가(DA-279).
 *
 * 형식만 본다 — 문자열, 공백을 뺀 길이 1 이상 · 255 이하, `$` 로 시작하지 않음, 민감 키(`isSensitiveKey`)가 아님(한글 · 숫자만 있어 판정할 수 없는 이름도 민감으로 보고 받지 않는다 — 직접 결과 속성 키와 같은 규칙).
 * 우리 · 벤더 예약 키(`session_id` · `mp_*` · `ade_*` …)는 코어 쪽 상수라 부르는 쪽이 따로 막는다.
 * `$` 로 시작하는 키는 벤더 예약 속성 이름이라 막는다. 값은 다듬지 않는다 — 보낸 키와 실린 키가 같아야 한다.
 *
 * @param key 서비스가 넘긴 값.
 * @return 받을 수 있으면 true.
 */
export declare function isValidGroupKey(key: unknown): key is string;
/**
 * `adesdk.time_event(name)` 이 받을 수 있는 기록 이름인가(DA-279 §10).
 *
 * 공백이 아닌 문자열이고 벤더가 자르는 길이 이하. 형식(`ade_` + 16진수)은 보지 않는다 — 자동수집 이름(`$mp_click`)도
 * 잴 수 있고, 이름이 틀리면 그 이름의 기록이 안 나올 뿐 잘못 실리는 값은 없다. 값은 다듬지 않는다.
 *
 * @param v 서비스가 넘긴 값.
 * @return 받을 수 있으면 true.
 */
export declare function isValidEventName(v: unknown): v is string;
/**
 * `adesdk.set_group(key, ids)` 의 그룹 ID 를 벤더가 받는 모양(배열)으로 만든다(DA-279).
 *
 * 값 하나면 배열로 감싼다(벤더도 같다 — `mixpanel.cjs.js:29938`). 원소는 유한한 숫자이거나, 공백이 아닌 255자 이하
 * 문자열이고 `@` 가 없다(이메일은 그룹 ID 로도 받지 않는다). 배열은 1개 이상. 하나라도 어기면 통째로 받지 않는다.
 * 값은 다듬지 않는다.
 *
 * @param ids 서비스가 넘긴 값.
 * @return 받을 수 있으면 배열, 아니면 null.
 */
export declare function normalizeGroupIds(ids: unknown): Array<string | number> | null;
/**
 * 선언 안의 실행 중 값이 255자를 넘으면 그 값만 뺀다. 자르지 않는다.
 *
 * `placement` 는 빌드 값이지만 뒷막이로 같이 본다. 던지지 않는다. 선언이 아니면 손대지 않는다.
 *
 * @param decl 판정에 넘기기 전의 선언 객체(제자리 수정).
 * @return 뺀 자리의 이름 목록(`identity.item_id` · `placement` …). 부른 쪽이 진단 사유로 쓴다 — 값은 담지 않는다.
 */
export declare function dropLongDeclarationValues(decl: unknown): string[];
