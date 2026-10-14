// 선언 파서. 요소 하나의 data-ade-* 속성을 갈라 형식 오류를 진단한다(DA-94).
//
// 속성을 kind, role, name, 업무ID, 추가 속성으로 가르고 형식 위반을 ADE-1xx 로 알린다.
// 이 파싱 계층을 읽기 계약이 다시 쓰므로 파싱 코드를 두 벌 만들지 않는다(01 선언 계약 §1).
// 어휘 목록 대조는 작명 규칙이 맡는다. ADE-201, ADE-209, ADE-210 이 그 대상이다.
// 이 파일은 형식을 보고, 이미 유효한 role 에 한해 identity 충족 여부를 본다(01 §2, §7).
import { abbreviate } from './diagnostics.js';
import { checkName } from './name.js';
/** 속성 이름 접두사. 이 규칙이 정의하는 속성은 예외 없이 이 접두사로 시작한다(01 §1). */
const PREFIX = 'data-ade-';
/** kind 값은 셋으로 고정한다. 값이 늘어나지 않는다(01 §2-1). */
export const KINDS = ['object', 'control', 'input'];
/** data-ade-collect 가 인정하는 세 값(01 §2-4). 강한 값을 고르는 판정은 읽기 계약이 한다. */
export const COLLECT_VALUES = ['skip', 'deny', 'mask'];
/**
 * 정적으로 읽지 못한 속성 값을 나타내는 표식.
 *
 * HTML 속성 값은 문자열이지만 JSX 는 리터럴 숫자와 불리언도 넣을 수 있다.
 * `{p.id}` 같은 표현식은 값을 정적으로 알 수 없으므로 이 심볼로 둔다.
 */
export const DYNAMIC = Symbol('ade.dynamic');
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
export const UNSUPPORTED = Symbol('ade.unsupported');
/**
 * 업무ID 키와 props 키를 DOM 속성 이름으로 바꾼다. `item_id` 는 `data-ade-item-id` 다.
 * 진단은 위반한 속성 이름을 가리켜야 하므로 검사기가 든 키를 속성 이름으로 되돌린다(01 §7-3).
 * 자동완성이 삽입할 속성을 만들 때 쓰는 변환과 같아서 한 곳에 둔다.
 */
export function businessAttrName(key) {
    return `${PREFIX}${key.replace(/_/g, '-')}`;
}
/**
 * 진단 메시지에 값을 적을 때 쓰는 표기다. 값을 읽지 못했다는 사실만 적는다.
 * `Symbol(ade.dynamic)` 이 그대로 나가면 FE 는 소스에 없는 값을 자기 값으로 읽는다.
 * 속성의 위치는 줄 번호와 열 번호가 가리킨다. 상한을 넘는 값은 축약한다(DA-251).
 */
export function describeValue(value) {
    return value === DYNAMIC ? '표현식' : abbreviate(String(value));
}
/** DOM 표기 kebab-case 키를 원래 snake_case 업무ID 키로 되돌린다(01 §2-2). */
function kebabToSnake(local) {
    return local.replace(/-/g, '_');
}
/** role 메타에서 identity_attr 를 꺼낸다. 문자열 하나일 때만 판정 근거로 삼는다. */
function identityAttrOf(role) {
    const id = role?.identity_attr;
    return typeof id === 'string' ? id : undefined;
}
/**
 * 요소 하나의 `data-ade-*` 속성을 역할별로 가른다. 형식 검사는 하지 않는다.
 *
 * 빌드와 확장이 쓰는 선언 파서와 런타임이 쓰는 읽기 계약이 이 분해를 함께 쓴다.
 * 분해를 두 벌 만들면 빈 값을 어떻게 읽는지가 두 곳에서 갈릴 수 있다.
 * 그 갈림을 막는 것이 SDK 인계 계약의 요구다(03 §1-1).
 * 그래서 빈 문자열을 여기서 지우지 않고 그대로 담는다. 빈 문자열과 부재는 다른 상태다(R1).
 */
export function splitAdeAttrs(attrs) {
    const split = {
        identityStatic: false,
        business: {},
        parent: {},
        ancestor: {},
    };
    for (const [attr, value] of Object.entries(attrs)) {
        if (!attr.startsWith(PREFIX)) {
            continue;
        }
        const local = attr.slice(PREFIX.length);
        switch (local) {
            case 'kind':
                split.rawKind = value;
                break;
            case 'role':
                if (typeof value === 'string') {
                    split.role = value;
                }
                break;
            case 'name':
                split.rawName = value;
                break;
            case 'id-key':
                if (typeof value === 'string') {
                    split.idKey = value;
                }
                break;
            case 'identity-static':
                split.identityStatic = true;
                break;
            case 'impression':
                split.rawImpression = value;
                break;
            case 'collect':
                split.rawCollect = value;
                break;
            case 'placement':
                if (typeof value === 'string') {
                    split.placement = value;
                }
                break;
            // 조상 잘림은 버려진 개수 하나이고 조상 슬롯이 아니다.
            // 조상 슬롯 키는 `_id` 로 끝나는데 `dropped` 는 그렇지 않다.
            // 그래서 슬롯 파서와 이름이 충돌하지 않는다(01 §2-3).
            case 'ancestor-dropped':
                split.ancestorDropped = value;
                break;
            // 관계 오류 표식도 조상 슬롯이 아니라 진단이다.
            // 갈래를 따로 두지 않으면 아래 default 가 이 값을 업무 속성에 넣는다.
            // 그러면 진단이 맥락 속성으로 파이프라인까지 나간다(DA-178).
            case 'relation-error':
                split.rawRelationError = value;
                break;
            // 임시 속성과 별칭 속성. 업무 속성으로 분류되면 안 된다.
            // `data-ade-pl` 은 빌드가 제거하고 `role-req` 는 작명 규칙이 본다(01 §2-5).
            case 'pl':
            case 'role-req':
                break;
            // 런타임 폴백이 자기가 부착한 속성 이름을 남긴 출처 표식이다(DA-228, 01 §2-3).
            // 업무 정보가 아니라 폴백의 기록이므로 읽기 결과에 담지 않는다.
            // 갱신은 폴백이 이 속성을 직접 읽어서 하고, 읽기 계약은 값을 쓰지 않는다.
            case 'fallback-slots':
                break;
            default:
                // 조상 슬롯에는 업무ID 만 담긴다. props 는 하위로 상속하지 않는다(01 §2-3 라).
                if (local.startsWith('parent-')) {
                    split.parent[kebabToSnake(local.slice('parent-'.length))] = value;
                }
                else if (local.startsWith('ancestor-')) {
                    split.ancestor[kebabToSnake(local.slice('ancestor-'.length))] = value;
                }
                else {
                    split.business[kebabToSnake(local)] = value;
                }
        }
    }
    return split;
}
/**
 * data-ade-id-key 값을 공백이나 쉼표로 나눈 키 목록.
 * 업무ID 키는 하나여야 하므로 조각이 둘 이상이면 이름 검사가 다중 업무ID 로 알린다.
 */
export function splitIdKey(idKey) {
    return idKey.split(/[\s,]+/).filter((piece) => piece !== '');
}
/**
 * 선언 신호가 하나라도 붙어 있는가. 신호는 kind, name, role, 업무 속성이다(01 §7-2).
 * 신호는 속성이 붙어 있는지로 판정하고 값의 형태는 보지 않는다.
 * `data-ade-role={r}` 처럼 표현식으로 적어도 선언하려 한 표시다.
 * data-ade-id-key 는 신호가 아니다.
 * 그 값이 가리키는 업무 속성이 없는 경우는 ADE-107 이 따로 알린다.
 * 선언 파서(ADE-101)와 지원 불가 검사(ADE-403)가 이 판정을 함께 쓴다.
 */
export function hasDeclarationSignal(attrs) {
    return (attrs[`${PREFIX}kind`] !== undefined ||
        attrs[`${PREFIX}name`] !== undefined ||
        attrs[`${PREFIX}role`] !== undefined ||
        Object.keys(splitAdeAttrs(attrs).business).length > 0);
}
/**
 * 선언 하나의 속성을 분해하고 형식 오류를 진단으로 돌려준다.
 * roles 는 identity 충족 여부를 볼 때만 참조한다. 미등록 role 판정은 하지 않는다.
 * 그 대상은 ADE-104 identity 누락과 ADE-105 identity 오매칭이다.
 */
export function parseDeclaration(attrs, roles = {}) {
    const diagnostics = [];
    // 분해는 읽기 계약과 공유한다. 조상 슬롯과 placement 도 함께 갈라져 나온다.
    // 빌드 시점에는 그 둘을 볼 일이 없어 이 함수가 쓰지 않는다. 읽기 계약이 쓴다(03 §1-1).
    const split = splitAdeAttrs(attrs);
    const businessAttrs = split.business;
    const { rawKind, role, rawName, idKey, identityStatic, rawImpression, rawCollect } = split;
    const name = typeof rawName === 'string' ? rawName : undefined;
    let impressionOff = false;
    let collect;
    // 플래그 값 검사(ADE-109 플래그 값 오류).
    // impression 은 끄는 값 off 하나만 인정하고, collect 는 세 값만 인정한다.
    if (rawImpression !== undefined) {
        if (rawImpression === 'off') {
            impressionOff = true;
        }
        else {
            diagnostics.push({
                code: 'ADE-109',
                severity: 'error',
                message: `data-ade-impression 에 쓸 수 없는 값입니다: "${describeValue(rawImpression)}". 쓸 수 있는 값은 "off" 하나입니다`,
                attr: `${PREFIX}impression`,
                hint: '노출 수집을 끄려면 "off" 로 바꾸세요. 켜려면 속성을 지우세요. 속성이 없으면 노출을 수집합니다',
            });
        }
    }
    if (rawCollect !== undefined) {
        if (typeof rawCollect === 'string' && COLLECT_VALUES.includes(rawCollect)) {
            collect = rawCollect;
        }
        else {
            diagnostics.push({
                code: 'ADE-109',
                severity: 'error',
                message: `data-ade-collect 에 쓸 수 없는 값입니다: "${describeValue(rawCollect)}"`,
                attr: `${PREFIX}collect`,
                hint: 'skip, deny, mask 중 하나로 바꾸세요',
            });
        }
    }
    // kind 검사. 값이 셋 밖이면 ADE-102 kind 값 오류다.
    // kind 가 없는데 선언 신호가 있으면 ADE-101 kind 누락이다.
    let kind;
    if (rawKind !== undefined) {
        if (typeof rawKind === 'string' && KINDS.includes(rawKind)) {
            kind = rawKind;
        }
        else {
            diagnostics.push({
                code: 'ADE-102',
                severity: 'error',
                message: `data-ade-kind 에 쓸 수 없는 값입니다: "${describeValue(rawKind)}"`,
                attr: `${PREFIX}kind`,
                hint: 'object, control, input 중 하나로 바꾸세요',
            });
        }
    }
    // kind 가 없는데 name, role, 업무 속성 중 하나가 있으면 ADE-101 이다.
    // role 만 있고 kind 가 없는 요소는 런타임에 선언으로 읽히지 않아 오류 없이 값만 빈다(01 §7-2).
    // 컴포넌트 태그는 이 판정에 오기 전에 ADE-403 으로 막힌다. 파서는 태그 이름을 모른다.
    if (rawKind === undefined && hasDeclarationSignal(attrs)) {
        diagnostics.push({
            code: 'ADE-101',
            severity: 'error',
            message: 'data-ade-kind 가 없습니다. 추적 이름, role, 업무 속성 중 하나를 적은 요소는 kind 를 선언해야 합니다',
            hint: 'data-ade-kind 를 object, control, input 중 하나로 적으세요',
        });
    }
    // ADE-301 name 누락과 ADE-302 name 형식 위반을 본다.
    // kind 를 선언했으면 예외 없이 이름이 붙는다(01 §2-1).
    // control 과 input 도 같은 검사를 받는다. 업무ID 를 갖지 않는 것과는 관계가 없다.
    // kind 값이 셋 밖이어서 ADE-102 가 난 요소도 kind 를 적었으므로 이름 누락을 함께 알린다.
    if (rawKind !== undefined) {
        diagnostics.push(...checkName(rawName, 'screen'));
    }
    // 업무 속성을 업무ID 와 추가 속성으로 가른다. idKey 가 가리키는 키가 업무ID 다.
    const props = {};
    let businessId;
    for (const [key, value] of Object.entries(businessAttrs)) {
        if (idKey !== undefined && key === idKey) {
            businessId = { key, value };
        }
        else {
            props[key] = value;
        }
    }
    // ADE-110 자료형 오류. 업무ID 값과 props 값은 문자열이나 숫자여야 한다(01 §6-4).
    // `{p.id}` 같은 표현식은 값을 정적으로 알 수 없으므로 자료형을 보지 않는다.
    // props 키에는 길이 규칙이 없어 key 를 그대로 실으면 상한 없이 길어진다(DA-251).
    for (const [key, value] of Object.entries(businessAttrs)) {
        if (value !== DYNAMIC && typeof value !== 'string' && typeof value !== 'number') {
            diagnostics.push({
                code: 'ADE-110',
                severity: 'error',
                message: `업무 속성 값이 문자열이나 숫자가 아닙니다: ${abbreviate(businessAttrName(key))}`,
                attr: businessAttrName(key),
                hint: '값을 문자열이나 숫자로 바꾸세요',
            });
        }
    }
    // role 과 업무ID 는 object 에만 붙는다(01 §2). control 과 input 에 있으면 위치 오류다.
    const isControlOrInput = kind === 'control' || kind === 'input';
    if (isControlOrInput && role !== undefined) {
        diagnostics.push({
            code: 'ADE-103',
            severity: 'error',
            message: `data-ade-role 은 kind 가 object 인 요소에만 쓸 수 있습니다. 이 요소의 kind 는 ${kind} 입니다`,
            attr: `${PREFIX}role`,
            hint: 'data-ade-role 을 지우세요. 이 요소에 role 이 필요하면 kind 를 object 로 바꾸세요',
        });
    }
    if (isControlOrInput && idKey !== undefined) {
        diagnostics.push({
            code: 'ADE-106',
            severity: 'error',
            message: `${kind} 요소에는 업무ID 를 적을 수 없습니다. 업무ID 는 kind 가 object 인 요소에만 적습니다`,
            attr: `${PREFIX}id-key`,
            hint: 'data-ade-id-key 와 업무ID 속성을 지우세요. 바깥 object 의 업무ID 는 빌드가 이 요소에 자동으로 붙입니다',
        });
    }
    // data-ade-identity-static 은 object 전용이다(01 §2-4).
    // control 과 input 은 자기 업무ID 가 없어 이 속성을 쓸 경우가 없다.
    if (isControlOrInput && identityStatic) {
        diagnostics.push({
            code: 'ADE-108',
            severity: 'error',
            message: `data-ade-identity-static 은 kind 가 object 인 요소에만 쓸 수 있습니다. 이 요소의 kind 는 ${kind} 입니다`,
            attr: `${PREFIX}identity-static`,
            hint: 'data-ade-identity-static 을 지우세요',
        });
    }
    // ADE-107 id-key 불일치. data-ade-id-key 가 가리키는 업무ID 속성이 붙어 있어야 한다.
    // control 과 input 은 idKey 가 있는 것 자체가 ADE-106 이라 여기서 겹쳐 보지 않는다.
    // role 유무와 무관하게 나오는 진단이라, 어느 경로도 idKey 값의 길이를 검사하지 않는다.
    // 그래서 메시지와 안내에 싣는 속성 이름은 축약한다(DA-251).
    // role 없이 키를 둘 이상 적은 값은 이름 검사가 ADE-205 로 알리므로 여기서 겹쳐 알리지 않는다.
    if (idKey !== undefined &&
        businessId === undefined &&
        !isControlOrInput &&
        (role !== undefined || splitIdKey(idKey).length <= 1)) {
        diagnostics.push({
            code: 'ADE-107',
            severity: 'error',
            message: `data-ade-id-key 가 가리키는 속성이 없습니다: ${abbreviate(businessAttrName(idKey))}`,
            attr: `${PREFIX}id-key`,
            hint: `${abbreviate(businessAttrName(idKey))} 속성에 업무ID 값을 적어 추가하세요`,
        });
    }
    // ADE-104 identity 누락. 업무ID 속성은 있는데 값이 비어 있다.
    // 가리킬 인스턴스를 알 수 없으므로 업무ID 가 없는 것과 같다.
    //
    // 값을 채우지 않고 나간 상태에는 이 진단이 그대로 남는다(01 §3-4).
    // 이 진단이 있어야 자동 수정을 붙일 대상이 생긴다.
    // 진단 없는 자동 수정은 에디터가 사용자에게 보여 주지 않아 FE 가 찾지 못한다.
    const emptyIdentity = businessId !== undefined &&
        typeof businessId.value === 'string' &&
        businessId.value.trim() === '';
    if (emptyIdentity && !identityStatic && !isControlOrInput) {
        diagnostics.push({
            code: 'ADE-104',
            severity: 'error',
            message: `업무ID 값이 비어 있습니다: ${abbreviate(businessAttrName(businessId.key))}`,
            attr: businessAttrName(businessId.key),
            hint: '업무ID 값을 채우세요. 이 요소가 가리킬 인스턴스가 없으면 data-ade-identity-static 을 추가하세요',
        });
    }
    // role 을 골랐고 그 role 이 어휘에 있으면 identity 가 충족됐는지 본다(01 §3-1).
    // 미등록 role 은 identity_attr 를 모르므로 판정하지 않는다.
    // 미등록 role 판정은 작명 규칙의 ADE-201 미등록 role 이 맡는다.
    const expectedIdentity = kind === 'object' && role !== undefined ? identityAttrOf(roles[role]) : undefined;
    if (expectedIdentity !== undefined && !identityStatic) {
        if (idKey === undefined) {
            if (expectedIdentity in props) {
                // 업무ID 속성은 붙였는데 data-ade-id-key 를 적지 않아 업무ID 로 읽히지 않는다.
                diagnostics.push({
                    code: 'ADE-107',
                    severity: 'error',
                    message: `data-ade-id-key 가 없습니다. 업무ID 속성 ${businessAttrName(expectedIdentity)} 는 id-key 와 함께 적어야 합니다`,
                    attr: businessAttrName(expectedIdentity),
                    hint: `data-ade-id-key="${expectedIdentity}" 를 추가하세요`,
                });
            }
            else {
                // role 이 요구하는 업무ID 를 아예 선언하지 않았다.
                diagnostics.push({
                    code: 'ADE-104',
                    severity: 'error',
                    message: `role 에 필요한 업무ID 가 없습니다: ${expectedIdentity} (role "${role}")`,
                    attr: `${PREFIX}role`,
                    hint: `data-ade-id-key="${expectedIdentity}" 와 ${businessAttrName(expectedIdentity)} 를 추가하세요. 가리킬 인스턴스가 없으면 data-ade-identity-static 을 추가하세요`,
                });
            }
        }
        else if (idKey !== expectedIdentity) {
            // role 이 요구하지 않는 업무ID 를 identity 키로 적은 선언이다(형태 ④).
            // role 과 expectedIdentity 는 어휘가 정한 값이라 길이가 짧다.
            // idKey 는 FE 가 손으로 적은 값이고 이 경로에서 길이를 검사하지 않아 그대로 축약한다(DA-251).
            diagnostics.push({
                code: 'ADE-105',
                severity: 'error',
                message: `role 에 맞지 않는 업무ID 키입니다: ${abbreviate(idKey)} (role "${role}", 필요한 키 ${expectedIdentity})`,
                attr: `${PREFIX}id-key`,
                candidates: [expectedIdentity],
                hint: `data-ade-id-key 를 "${expectedIdentity}" 로 바꾸세요. 업무ID 속성 이름도 ${businessAttrName(expectedIdentity)} 로 바꾸세요`,
            });
        }
    }
    // role 이 없는 object 선언은 업무ID 나 확인 표시가 있어도 정보로 남긴다(01 §7-2).
    // 빌드를 막지 않는다.
    //
    // 업무ID 가 있으면 identity 에 business-id 를, 없고 확인 표시만 있으면 static 을 담는다.
    // data-ade-id-key 만 있고 업무ID 로 읽히지 않는 선언도 business-id 로 둔다.
    // 키가 둘이거나 가리키는 속성이 없는 경우이며, 그 오류는 ADE-205 와 ADE-107 이 알린다.
    // 이 선언은 업무ID 를 적으려 한 선언이라 identity-static 을 붙이라는 안내가 맞지 않는다.
    // attr 은 어느 경우에도 비워 둔다. attr 을 채우면 에디터의 밑줄이 그 속성 줄로 옮겨진다.
    // 검증 CLI 는 identity 가 비어 있는 진단만 업무ID 없이 선언한 object 묶음에 센다(01 §3-4).
    // 업무ID 나 표시를 붙인 선언은 그래서 다음 검사부터 그 목록에서 빠진다.
    // role 을 골랐는데 업무ID 가 없는 경우는 ADE-104 identity 누락이 오류로 판정한다.
    // 그래서 role 이 있는 선언에는 여기서 겹쳐 내지 않는다.
    if (kind === 'object' && role === undefined) {
        const identity = businessId !== undefined || idKey !== undefined
            ? 'business-id'
            : identityStatic
                ? 'static'
                : undefined;
        diagnostics.push(identity === undefined
            ? {
                code: 'ADE-501',
                severity: 'info',
                message: '업무ID 없이 선언한 object 입니다. 빌드는 막지 않습니다',
                hint: '가리킬 인스턴스가 없으면 data-ade-identity-static 을 추가하세요. 추가하면 이 안내가 나오지 않습니다',
            }
            : {
                code: 'ADE-501',
                severity: 'info',
                message: 'role 없이 선언한 object 입니다. 빌드는 막지 않습니다',
                hint: '어휘에 맞는 role 이 있으면 data-ade-role 로 적으세요. 적으면 이 안내가 나오지 않습니다',
                identity,
            });
    }
    return {
        declaration: {
            kind,
            role,
            name,
            idKey,
            businessId,
            props,
            identityStatic,
            impressionOff,
            collect,
        },
        diagnostics,
    };
}
