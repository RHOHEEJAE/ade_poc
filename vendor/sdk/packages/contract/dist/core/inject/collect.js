// 런타임 폴백 — DOM 조상 체인에서 조상 목록을 만든다.
//
// 빌드 플러그인은 컴포넌트 경계를 넘는 prop 으로 조상 목록을 쌓는다(DA-104).
// Babel 을 쓸 수 없는 스택에는 그 통로가 없어 같은 목록을 DOM 에서 만든다(02 빌드 주입 §7-1).
// 목록을 만드는 방법만 다르고 접는 규칙은 같다. 접기는 두 경로가 `foldSlots` 정본 하나를 쓴다.
//
// 조상을 훑는 것은 읽기 규칙 위반이 아니다(R2).
// 그 규칙은 빌드가 이미 기록한 업무ID 조상 슬롯을 다시 계산하는 일을 막는다(03 §2).
// 폴백이 도는 스택에서는 빌드가 조상 슬롯을 하나도 기록하지 않았다.
//
// 조상 목록을 만드는 규칙과 배경은 docs/설계/주입-시점과-폴백.md 에 있다.
import { readDeclaration, DECLARED_SELECTOR } from '../contract/read.js';
/** 조상이 자기 업무ID 로 무엇을 선언했는지 가리키는 속성(01 선언 계약 §2-2). */
const ID_KEY_ATTR = 'data-ade-id-key';
/**
 * 한 조상에서 프레임 하나를 만든다. 만들 것이 없으면 `null` 이다.
 *
 * 키를 요소의 업무ID 속성이 아니라 `data-ade-id-key` 에서 읽는다.
 * 업무ID 값이 서버 응답으로 채워지는 이상 속성 자체가 없는 상태도 정상 경로다.
 * 그 상태를 알리는 코드가 `ADE-503` 실측 identity 비어 있음이다.
 * 업무ID 속성만 보면 값이 없을 때 키까지 함께 사라져 조상이 없는 것으로 읽힌다.
 * 선언 계약은 값이 비어도 키는 붙이라고 정했다(01 §2-3 의 규칙 마).
 */
function frameOf(ancestor) {
    const idKey = ancestor.getAttribute?.(ID_KEY_ATTR) ?? null;
    // 업무ID 키가 없는 조상이다. 담을 값이 없으므로 프레임을 만들지 않는다.
    // role 도 업무ID 도 없는 object 선언이 여기에 해당한다(01 §3-1 의 형태 ③).
    if (idKey === null || idKey === '') {
        return null;
    }
    // 선언을 읽지 못한 조상도 프레임은 만든다.
    // 값을 `undefined` 로 두면 접을 때 빈 값이 되고 신뢰 등급이 observed 로 내려간다.
    // 검증 전략은 읽지 못한 값을 guaranteed 로 올리지 않는 것을 기준으로 정했다(04 검증 전략 §3-8).
    const declaration = readDeclaration(ancestor);
    const value = declaration === null ? undefined : declaration.identity[idKey];
    return { key: idKey, value };
}
/**
 * 요소의 선언된 DOM 조상을 훑어 조상 목록을 만든다. 가까운 조상이 앞이다.
 *
 * 깊이 상한을 두지 않고 문서 최상단까지 올라간다. 탐색을 최상단까지 잇는 규칙이 (가) 다.
 * 담는 것은 `data-ade-id-key` 가 가리키는 키 하나이고 맥락 속성(props)은 담지 않는다(규칙 (라)).
 * 같은 키의 중복 제거와 잘린 개수 세기는 여기서 하지 않고 접기가 맡는다(규칙 (다)).
 * 탐색은 shadow 경계에서 멈춘다. `parentElement` 가 shadow root 에서 `null` 이 되기 때문이다.
 *
 * 다섯 규칙의 전문과 배경은 docs/설계/주입-시점과-폴백.md 에 있다(01 선언 계약 §2-3, 02 §7-3).
 */
export function collectCtx(el) {
    const ctx = [];
    // 자기 자신은 조상이 아니므로 부모에서 시작한다. `closest` 는 자기 자신부터 본다.
    // 여기서 한 칸 올려 두지 않으면 선언된 요소가 자기 자신을 조상 목록에 넣는다.
    let cursor = el.parentElement ?? null;
    while (cursor !== null) {
        const found = cursor.closest?.(DECLARED_SELECTOR) ?? null;
        if (found === null) {
            break;
        }
        const frame = frameOf(found);
        // 프레임을 만들지 못해도 탐색은 계속한다.
        // 여기서 멈추면 프레임을 만들지 못한 중간 조상 하나 때문에 그 위의 조상이 전부 빠진다.
        // 탐색을 최상단까지 잇는 규칙이 (가) 다(01 §2-3, 기능정의서 §5).
        if (frame !== null) {
            ctx.push(frame);
        }
        cursor = found.parentElement ?? null;
    }
    return ctx;
}
