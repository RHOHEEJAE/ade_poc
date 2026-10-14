// version.ts — 규칙 버전 호환 판정.
//
// DOM 에 선언을 찍은 쪽(코드젠 빌드 플러그인)의 규칙 버전과, 그 선언을 읽는 쪽(이 계약 패키지)의
// 버전이 맞는지 본다. 읽는 쪽이 찍은 쪽보다 낮으면 없는 규칙을 부르게 된다.
//
// npm `^` 와 같게 본다. `[major, minor, patch]` 중 왼쪽에서 첫 번째 0 이 아닌 자리가 벽이고,
// 벽까지는 같아야 하며 그 뒤는 실제가 기대보다 낮지 않아야 한다.
// `0.x` 대에서는 부 버전이, `0.0.x` 에서는 패치가 벽이다.
//
// 코드젠 정본 패키지가 같은 이름으로 내보낼 함수다. 그 패키지로 교체되면 이 파일은 사라진다.
/**
 * 버전 문자열을 숫자 셋으로 읽는다. `1.2.3-beta` 처럼 뒤에 붙은 식별자는 버린다.
 * @param v 버전 문자열.
 * @return `[major, minor, patch]`. 세 자리를 숫자로 읽을 수 없으면 null.
 */
function parse(v) {
    const m = /^\s*v?(\d+)\.(\d+)\.(\d+)/.exec(v ?? '');
    if (!m)
        return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}
/**
 * 실제 버전이 기대 버전과 호환되는지 판정한다(npm `^` 규칙).
 * @param required 기대 버전 — DOM 을 찍은 쪽이 요구하는 규칙 버전(번들의 `ruleVersion`).
 * @param actual 실제 버전 — DOM 을 읽는 쪽이 가진 버전(`CONTRACT_VERSION`).
 * @return 호환이면 true. 어느 한쪽이라도 `x.y.z` 로 읽을 수 없으면 false — 모르는 것은 호환으로 치지 않는다.
 */
export function isCompatibleVersion(required, actual) {
    const r = parse(required);
    const a = parse(actual);
    if (!r || !a)
        return false;
    // 벽: 왼쪽에서 첫 0 이 아닌 자리. 전부 0 이면 패치 자리.
    let wall = r.findIndex((n) => n !== 0);
    if (wall < 0)
        wall = 2;
    for (let i = 0; i <= wall; i++)
        if (r[i] !== a[i])
            return false;
    for (let i = wall + 1; i < 3; i++) {
        if (a[i] > r[i])
            return true;
        if (a[i] < r[i])
            return false;
    }
    return true;
}
