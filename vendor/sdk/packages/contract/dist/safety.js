// safety.ts — 값 안전 규칙. 민감 요소 · 민감 키 · 마스킹 · 값 길이.
//
// 코드젠 선언 규칙(contract.ts)과 달리 이 파일은 SDK 소유다. 무엇을 민감하게 볼지, 낱말 목록을
// 어디까지 넓힐지는 SDK 가 정하고, 계약 판정(resolveVerdict)은 결과(elementUnsafe)만 넘겨받는다.
//
// 클릭 경로(코어)와 노출 경로(impression 확장)가 같은 규칙을 쓴다.
//
// 차단은 "값을 안 싣는다"가 아니라 "이벤트를 안 만든다"로 한다. 값을 빼도 "결제 폼 3번째 필드가
// 수정됨"이 남으면 그 자체가 단서가 되기 때문이다.
/** 값이 그대로 노출되면 안 되는 입력 타입. */
const SENSITIVE_INPUT_TYPES = new Set(['password', 'email', 'tel', 'hidden', 'file']);
/** 브라우저 자동완성 힌트가 이미 민감함을 선언한 경우. */
const SENSITIVE_AUTOCOMPLETE = /^(cc-|current-password|new-password|username|one-time-code)/i;
/**
 * 인증 · 결제 · 신원 낱말. 요소 판정(`SENSITIVE_HINT`)과 키 판정(`isSensitiveKey`)이 같은 목록을 쓴다 —
 * 두 벌이면 같은 화면에서 요소는 막히고 값은 나가는 어긋남이 생긴다.
 */
const SENSITIVE_WORDS = [
    'passwd', 'password', 'pwd', 'card', 'cvc', 'cvv', 'expiry', 'ssn', 'jumin', 'resident',
    'account', 'auth', 'otp', 'token', 'secret', 'email', 'phone', 'tel', 'mobile', 'birth',
];
/** 요소 이름 · id 에 이런 낱말이 있으면 인증 · 결제 맥락으로 본다. 요소 이름은 자유 형식이라 부분 문자열로 본다. */
const SENSITIVE_HINT = new RegExp(`(${SENSITIVE_WORDS.join('|')})`, 'i');
/**
 * 문자열을 소문자 토막으로 나눈다. `snake_case` · `kebab-case` · `camelCase` · 공백 · 경로 구분자 전부 경계다.
 * 키 판정(`isSensitiveKey`)과 폼 판정(`isSensitiveFormHint`)이 같은 규칙으로 나눠야 한쪽만 새지 않는다.
 * @param s 나눌 문자열.
 * @return 빈 토막을 뺀 소문자 알파벳 토막 목록. `hotel_id` → `['hotel', 'id']`, `loginForm` → `['login', 'form']`.
 */
function tokenize(s) {
    return s
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // camelCase → camel_Case
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter(Boolean);
}
/**
 * 폼(컨테이너) 판정은 더 넓게 본다 — 폼 하나가 인증 · 결제면 그 안의 모든 컨트롤이 막혀야 하고,
 * 필드 이름이 무해해 보여도(installment, agree …) 맥락이 민감하면 함께 막는 게 안전한 방향이다.
 *
 * 다른 낱말 안에 잘 안 들어가는 낱말은 부분 문자열로 본다 — `forgotpassword` · `myaccount` 처럼 붙여 쓴
 * 합성어를 놓치지 않으려면 경계를 따지면 안 된다. `registry` 는 `register` 도 `registration` 도 아니라 안 걸린다.
 */
const SENSITIVE_FORM_STRONG = /(login|signin|signup|register|registration|passw|account|billing|checkout|credit|bank|invoice)/i;
/**
 * 짧아서 흔한 낱말 안에 들어가는 것들. 부분 문자열로 보면 Tailwind `border` 가 `order` 에, Bootstrap `scorecard` 가
 * `card` 에, `author` 가 `auth` 에 걸려 그 폼 안의 모든 클릭 · 입력 · submit 이 조용히 사라진다 — 단서가 진단
 * 한 건뿐이라 아무도 눈치채지 못한다. 그래서 토막(`tokenize`) 단위로 보되 토막 안 어디에 있어도 잡고(`orders` ·
 * `reorder` · `neworderform` · `giftcard` · `autopay` · `oauth`), 다른 뜻의 토막은 `except` 로 뺀다.
 */
const SENSITIVE_FORM_AMBIGUOUS = [
    { word: 'order', except: /^(border|recorder|disorder)s?$/ },
    { word: 'card', except: /^(scorecard|discard|placard|wildcard|postcard|cardio|cardigan|cardinal)s?$/ },
    { word: 'pay', except: /^payload/ },
    // `authorization` · `authorize` 는 `author` 로 시작하지만 인증 낱말이라 예외에서 뺀다
    { word: 'auth', except: /^author(s|ed|ing|ship|ity|ities)?$/ },
];
/**
 * CSS 프레임워크가 쓰는 유틸 클래스 이름. 폼의 업무 맥락이 아니라 생김새라서 판정에서 뺀다 —
 * Bootstrap · DaisyUI · Material 의 `card` · `card-body` · `mat-card`, Tailwind 의 `order-2` · `order-first`.
 * class 속성에만 적용한다. 같은 낱말이 name · id · action 에 있으면 업무 맥락이다.
 */
const UTILITY_CLASS = /^(?:[a-z]+-)?card(?:-[a-z]+)*$|^order-(?:\d+|first|last|none)$/;
/**
 * 폼의 이름 · id · action · class 가 인증 · 결제 맥락인지 본다.
 * @param hint name · id · action 을 공백으로 이은 값.
 * @param className class 속성 값. 유틸 클래스를 뺀 나머지만 본다.
 * @return 부분 문자열 낱말이 있거나, 토막에 애매한 낱말이 들어 있으면서 예외가 아니면 true.
 */
function isSensitiveFormHint(hint, className) {
    const classes = className.split(/\s+/).filter((c) => c && !UTILITY_CLASS.test(c.toLowerCase()));
    const text = `${hint} ${classes.join(' ')}`;
    if (SENSITIVE_FORM_STRONG.test(text))
        return true;
    return tokenize(text).some((t) => SENSITIVE_FORM_AMBIGUOUS.some(({ word, except }) => t.includes(word) && !except.test(t)));
}
/** 폼 안에 이런 필드가 하나라도 있으면 그 폼 전체를 민감하게 본다. */
const SENSITIVE_FIELD_SELECTOR = 'input[type=password], [autocomplete^="cc-"], [autocomplete="current-password"], [autocomplete="new-password"]';
/**
 * 인증 · 결제 맥락의 요소인지 본다. 여기 걸리면 이벤트 자체를 만들지 않는다.
 *
 * 벤더 자체 검사는 카드번호 · 미국 SSN 정규식만 본다. 국내 주민번호 · 계좌번호는 안 잡히므로
 * 이 함수가 필요하다.
 *
 * @param el 검사할 요소. 비밀번호 · 카드 입력, 그런 입력을 품은 폼, 결제 · 인증 문맥의 조상을 본다.
 * @return 민감하면 true. 예외가 나면 true — 판정할 수 없으면 안전한 쪽으로 막는다.
 */
export function isSensitiveElement(el) {
    try {
        const tag = el.tagName.toLowerCase();
        if (tag === 'input') {
            const t = (el.getAttribute('type') || 'text').toLowerCase();
            if (SENSITIVE_INPUT_TYPES.has(t))
                return true;
        }
        const ac = el.getAttribute('autocomplete');
        if (ac && SENSITIVE_AUTOCOMPLETE.test(ac))
            return true;
        const hint = `${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''}`;
        if (hint.trim() && SENSITIVE_HINT.test(hint))
            return true;
        // 요소 자신이 form 이면 자기 속성으로 판정한다.
        const form = tag === 'form' ? el : el.closest('form');
        if (form) {
            const fh = [
                form.getAttribute('name') || '',
                form.getAttribute('id') || '',
                form.getAttribute('action') || '',
            ].join(' ');
            if (isSensitiveFormHint(fh, form.getAttribute('class') || ''))
                return true;
            if (form.querySelector(SENSITIVE_FIELD_SELECTOR))
                return true;
        }
        return false;
    }
    catch {
        return true;
    }
}
/**
 * 속성 키에서만 더 보는 낱말. 요소 판정에 넣으면 주소 입력칸 클릭까지 이벤트가 안 만들어지므로
 * 요소 쪽 목록은 그대로 두고 키 쪽만 넓힌다.
 */
const SENSITIVE_KEY_WORDS = new Set([...SENSITIVE_WORDS, 'mail', 'addr', 'address']);
/**
 * 토막이 이 낱말로 시작해도 민감하다 — `cardno` · `accountno` · `phone2` 처럼 구분자 없이 붙여 쓴 것.
 * 요소 판정처럼 부분 문자열로 보지 않는 이유: `auth` 는 `author`, `tel` 은 `hotel`, `card` 는 `scorecard` 를
 * 잡아 업무 키가 조용히 빠진다. 뒤에 붙는 것이 흔하고 앞에 붙는 것이 드문 낱말만 접두어로 본다.
 */
const SENSITIVE_KEY_PREFIXES = [
    'passw', 'pwd', 'cvc', 'cvv', 'ssn', 'jumin', 'otp', 'email', 'phone', 'mobile', 'birth', 'addr', 'secret', 'token', 'card', 'account',
];
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
export function isSensitiveKey(key) {
    if (typeof key !== 'string')
        return true;
    const tokens = tokenize(key);
    if (tokens.length === 0)
        return true;
    return tokens.some((t) => SENSITIVE_KEY_WORDS.has(t) || SENSITIVE_KEY_PREFIXES.some((p) => t.startsWith(p)));
}
// ─────────────────────────────────────────────────────────────────────────────
// 마스킹 — data-ade-collect="mask"
// ─────────────────────────────────────────────────────────────────────────────
//
// deny · skip 은 이벤트를 없애지만 mask 는 이벤트를 남기고 값만 지운다. 그래서 요소 검사
// (block_element_callback)가 아니라 이벤트 생성 시점(before_track)에서 처리한다.
// 지우는 것: 화면 글자(`$el_text`) · 주소의 쿼리 · 입력값.
/**
 * 주소에서 쿼리 · 해시를 떼고 경로만 남긴다.
 * @param href 속성 값. 문자열이 아니면 손대지 않는다.
 * @return `?` 또는 `#` 앞까지. 둘 다 없으면 입력 그대로.
 */
function stripQuery(href) {
    if (typeof href !== 'string' || !href)
        return href;
    const cut = href.search(/[?#]/);
    return cut === -1 ? href : href.slice(0, cut);
}
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
export function applyMask(props) {
    try {
        delete props['$el_text'];
        if ('$el_attr__href' in props)
            props['$el_attr__href'] = stripQuery(props['$el_attr__href']);
        const elements = props['$elements'];
        if (Array.isArray(elements)) {
            for (const e of elements) {
                if (!e || typeof e !== 'object')
                    continue;
                const rec = e;
                if ('$attr-href' in rec)
                    rec['$attr-href'] = stripQuery(rec['$attr-href']);
                delete rec['$el_text'];
            }
        }
    }
    catch {
        /* 마스킹 실패가 서비스를 멈추게 하지 않는다. 값이 남는 위험은 수집 서버가 잡는다. */
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// 값 길이 — 벤더가 자르기 전에 뺀다
// ─────────────────────────────────────────────────────────────────────────────
//
// Mixpanel 은 이벤트의 모든 문자열 값을 255자에서 조용히 자른다 — 중첩 객체 안까지. 잘린 업무ID 는
// 다른 항목과 겹쳐 잘못 세게 되므로, 자르지 않고 그 값만 빼서 「부재」로 남긴다.
//
// 빌드 때 값을 아는 것(리터럴 props · placement)은 코드젠이 빌드 오류로 막는다. 실행 중에야 정해지는
// 값 — DOM 에서 읽는 업무ID · 조상 슬롯 · 동적 props — 은 코드젠이 볼 수 없어 SDK 가 본다.
//
// 반드시 판정 앞에서 부른다. 등급(resolveIdentityMode)과 판정(resolveVerdict)이 identity 유무로
// 갈리므로, 판정 뒤에 지우면 identity 가 비었는데 guaranteed · 정상 판정인 모순된 기록이 나간다.
/** 벤더가 문자열을 자르는 길이. 단위는 JS `.length`(UTF-16 코드 유닛) — 벤더가 `slice(0, 255)` 로 자르므로 같은 단위로 센다. */
export const VENDOR_MAX_STRING = 255;
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
export function isValidUserId(v) {
    return typeof v === 'string' && v.trim().length > 0 && v.length <= VENDOR_MAX_STRING && !v.includes('@') && !v.startsWith('$device:');
}
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
export function isValidGroupKey(key) {
    return (typeof key === 'string' &&
        key.trim().length > 0 &&
        key.length <= VENDOR_MAX_STRING &&
        !key.startsWith('$') &&
        !isSensitiveKey(key));
}
/**
 * `adesdk.time_event(name)` 이 받을 수 있는 기록 이름인가(DA-279 §10).
 *
 * 공백이 아닌 문자열이고 벤더가 자르는 길이 이하. 형식(`ade_` + 16진수)은 보지 않는다 — 자동수집 이름(`$mp_click`)도
 * 잴 수 있고, 이름이 틀리면 그 이름의 기록이 안 나올 뿐 잘못 실리는 값은 없다. 값은 다듬지 않는다.
 *
 * @param v 서비스가 넘긴 값.
 * @return 받을 수 있으면 true.
 */
export function isValidEventName(v) {
    return typeof v === 'string' && v.trim().length > 0 && v.length <= VENDOR_MAX_STRING;
}
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
export function normalizeGroupIds(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (list.length === 0)
        return null;
    for (const v of list) {
        if (typeof v === 'number' ? !Number.isFinite(v) : !(typeof v === 'string' && v.trim().length > 0 && v.length <= VENDOR_MAX_STRING && !v.includes('@'))) {
            return null;
        }
    }
    return list;
}
/** 선언 중 실행 중 DOM 에서 읽는 값이 담기는 자리. 여기 든 문자열은 빌드가 못 봤다. */
const DECLARATION_RUNTIME_MAPS = ['identity', 'props', 'parent', 'ancestor'];
/**
 * 선언 안의 실행 중 값이 255자를 넘으면 그 값만 뺀다. 자르지 않는다.
 *
 * `placement` 는 빌드 값이지만 뒷막이로 같이 본다. 던지지 않는다. 선언이 아니면 손대지 않는다.
 *
 * @param decl 판정에 넘기기 전의 선언 객체(제자리 수정).
 * @return 뺀 자리의 이름 목록(`identity.item_id` · `placement` …). 부른 쪽이 진단 사유로 쓴다 — 값은 담지 않는다.
 */
export function dropLongDeclarationValues(decl) {
    const dropped = [];
    try {
        if (!decl || typeof decl !== 'object')
            return dropped;
        const d = decl;
        for (const field of DECLARATION_RUNTIME_MAPS) {
            const map = d[field];
            if (!map || typeof map !== 'object')
                continue;
            for (const [k, v] of Object.entries(map)) {
                if (typeof v === 'string' && v.length > VENDOR_MAX_STRING) {
                    delete map[k];
                    dropped.push(`${field}.${k}`);
                }
            }
        }
        if (typeof d['placement'] === 'string' && d['placement'].length > VENDOR_MAX_STRING) {
            d['placement'] = null;
            dropped.push('placement');
        }
    }
    catch {
        /* 길이 검사 실패가 서비스를 멈추게 하지 않는다 */
    }
    return dropped;
}
