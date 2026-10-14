// 읽기 계약 — 신뢰 등급을 판정한다(DA-103).
//
// 규칙은 두 조항이고 kind 별로 갈리지 않는다.
// 조상 정보가 요소에 이미 찍혀 있으므로 요소 자신만 보면 된다.
//
// 이 등급은 코드젠 판정 3종과 답하는 질문이 다르다.
// 판정은 이 이벤트를 쓸 수 있는지를 답하고, 등급은 그 값을 얼마나 믿을 수 있는지를 답한다.
// 둘을 하나로 합치면 수정할 것이 없는 상태와 배포가 필요한 상태를 구분하지 못한다.
//
// 두 조항의 전문은 docs/설계/계약-판정과-버전.md 에 있다.
/** 업무ID 슬롯 중 값이 빈 문자열인 것이 하나라도 있는가. 신뢰 등급 두 번째 조항(㉡)이다. */
function hasEmptySlot(decl) {
    // ancestor 와 parent 를 같게 본다.
    // ADE-502 조상 값 비어 있음이 둘을 구분하지 않는다.
    // 그 코드는 조상 슬롯 키는 있는데 값이 빈 문자열인 상태로 정의되어 있다.
    // 나누면 직속 조상만 빈 경우와 먼 조상만 빈 경우의 조합마다 이름을 붙여야 한다.
    const slots = [decl.identity, decl.parent, decl.ancestor];
    return slots.some((slot) => Object.values(slot).some((value) => value === ''));
}
/**
 * 신뢰 등급을 판정한다. 두 조항의 전문은 docs/설계/계약-판정과-버전.md 에 있다.
 *
 * 두 조항은 요구가 없으면 위반도 없다는 기준을 따른다.
 * role 없는 `object` 와 조상 키가 아예 없는 `control` 은 가릴 인스턴스가 없다는 점에서 같다.
 * 그래서 둘 다 `guaranteed` 다.
 */
export function resolveIdentityMode(decl) {
    try {
        return judge(decl);
    }
    catch {
        // 읽지 못한 값을 guaranteed 로 올리면 잘못된 확신이 데이터에 실린다(04 검증 전략 §3-8).
        return 'observed';
    }
}
function judge(decl) {
    if (decl === null || typeof decl !== 'object') {
        return 'observed';
    }
    // 첫 번째 조항(㉠). object 에서 role 과 업무ID 가 짝을 이루지 못하는가.
    //
    // control 과 input 은 이 조항을 건너뛴다.
    // ADE-103 role 위치 오류가 role 을 빌드에서 막는다.
    // ADE-106 업무ID 자리 오류가 자기 업무ID 를 빌드에서 막는다.
    // 미선언 요소도 자기 값이 없어 이 조항을 건너뛴다.
    // 셋 다 두 번째 조항(㉡)만 받는다.
    if (decl.kind === 'object') {
        const hasRole = decl.role !== null;
        // 값이 비었어도 키가 있으면 업무ID 를 제공한 것으로 본다.
        // 그 빈 값은 두 번째 조항이 따로 판정한다(㉡).
        const hasIdentity = Object.keys(decl.identity).length > 0;
        // identity_static 은 role 쪽 요구를 면제한다.
        // 업무ID 를 제공한 것으로 세지 않으므로 role 없는 선언에 붙어도 제공한 것이 되지 않는다.
        // role 없는 선언에는 원래 요구가 없어 면제할 것도 없다.
        // 이 예외를 role 유무와 관계없이 object 에 열기로 정했다(ADR-014).
        const exempt = hasRole && !hasIdentity && decl.identityStatic;
        if (!exempt && hasRole !== hasIdentity) {
            return 'observed';
        }
    }
    // 두 번째 조항(㉡). 이 요소에 붙은 업무ID 슬롯 중 값이 빈 문자열인 것이 하나라도 있는가.
    if (hasEmptySlot(decl)) {
        return 'observed';
    }
    return 'guaranteed';
}
