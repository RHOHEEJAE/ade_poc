// 추적 이름의 형식과 규칙을 검사한다. 형식은 ade_ 뒤에 16진수 열두 자리다(01 §2-1).
//
// 이름은 확장이 작성 시점에 소스에 삽입하는 리터럴이다(ADR-002).
// 빌드는 이름을 만들지 않는다(02 빌드 주입 §9-1).
// 검사 대상은 화면 선언의 data-ade-name 과 직접 결과의 adesdk.track 호출 인자다(ADR-020).
// 두 대상의 형식과 오류 코드가 같으므로 검사기를 한 벌만 둔다(DA-98, 01 선언 계약 §7-2).
//
// 이름 발급은 name-issue.ts 에 따로 둔다(DA-97).
// 읽기 계약이 isValidName 과 checkName 을 쓰느라 이 파일을 함께 불러오기 때문이다.
// 런타임 계약은 읽기 함수 넷뿐이고 어휘 로딩, 발급, 스캔을 담지 않는다(ADR-006).
// 한 파일에 두면 발급 코드가 서비스팀 런타임 번들에 함께 들어간다.
// 파일 단위로 의존 범위를 보는 시험은 그 유입을 걸러 내지 못한다.
import { abbreviate } from './diagnostics.js';
import { OUTCOME_CALL } from './outcome-call.js';
/** 이름 형식. 접두사에 role 을 담지 않는다(01 §2-1). */
export const NAME_PATTERN = /^ade_[0-9a-f]{12}$/;
/** 값이 이름 형식을 지켰는가. 문자열이 아니면 정적으로 읽을 수 없는 값이라 거짓이다. */
export function isValidName(value) {
    return typeof value === 'string' && NAME_PATTERN.test(value);
}
const SITE_LABEL = {
    screen: 'data-ade-name',
    outcome: `${OUTCOME_CALL} 호출 인자의 name`,
};
/** 이름이 실리는 위치를 사람이 읽는 말로 적은 것. 진단 문구에 그대로 들어간다. */
export function nameSiteLabel(site) {
    return SITE_LABEL[site];
}
/**
 * 이름 규칙을 검사한다. 이름이 없으면 ADE-301 name 누락이다.
 * 형식이 어긋나거나 값이 리터럴이 아니면 ADE-302 name 형식 위반이다.
 *
 * 언제 검사할지는 부르는 쪽이 정한다.
 * 화면 선언은 data-ade-kind 가 있을 때만 부른다. kind 가 없으면 선언이 아니기 때문이다.
 * 직접 결과는 호출 자체가 선언이므로 언제나 부른다.
 * 검사는 값의 출처를 보지 않는다. FE 가 손으로 적은 이름도 같은 규칙으로 판정한다(01 §1).
 */
export function checkName(name, site) {
    const label = SITE_LABEL[site];
    if (name === undefined || name === null || name === '') {
        return [
            {
                code: 'ADE-301',
                severity: 'error',
                message: site === 'screen'
                    ? '추적 이름(data-ade-name)이 없습니다'
                    : `${OUTCOME_CALL} 호출 인자에 추적 이름(name)이 없습니다`,
                hint: '빠른 수정(Ctrl+.)의 「추적 이름 발급하기」로 이름을 넣으세요. 추적 이름은 손으로 적지 않습니다',
            },
        ];
    }
    if (isValidName(name)) {
        return [];
    }
    // 값이 소스에 있는데 문자열이 아니면 표현식이다.
    // 이름은 소스에 적힌 리터럴이어야 하므로 표현식도 형식 위반과 같은 코드로 막는다(ADR-002).
    // 형식이 어긋난 값에는 길이 제한이 없어 그대로 실으면 메시지 한 줄이 길어진다.
    // 그래서 메시지에 싣는 값은 축약한다(DA-251).
    // attr 을 채워야 workspace.ts 의 locate 가 그 속성의 실제 위치를 찾는다.
    // 화면 선언은 data-ade-name 을 가리킨다.
    // 직접 결과는 가리킬 DOM 속성이 없어 채우지 않는다(DA-251).
    return [
        {
            code: 'ADE-302',
            severity: 'error',
            message: typeof name === 'string'
                ? `추적 이름 형식이 아닙니다: "${abbreviate(name)}". 추적 이름은 ade_ 와 16진수 12자리로 이루어집니다`
                : '추적 이름이 변수나 식으로 적혀 있어 검사할 수 없습니다. 추적 이름은 따옴표로 감싼 문자열이어야 합니다',
            ...(site === 'screen' ? { attr: label } : {}),
            hint: '에디터 확장이 발급한 값으로 되돌리세요. 추적 이름은 손으로 고치지 않습니다',
        },
    ];
}
