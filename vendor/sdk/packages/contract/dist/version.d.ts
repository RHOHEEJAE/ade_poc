/**
 * 실제 버전이 기대 버전과 호환되는지 판정한다(npm `^` 규칙).
 * @param required 기대 버전 — DOM 을 찍은 쪽이 요구하는 규칙 버전(번들의 `ruleVersion`).
 * @param actual 실제 버전 — DOM 을 읽는 쪽이 가진 버전(`CONTRACT_VERSION`).
 * @return 호환이면 true. 어느 한쪽이라도 `x.y.z` 로 읽을 수 없으면 false — 모르는 것은 호환으로 치지 않는다.
 */
export declare function isCompatibleVersion(required: string, actual: string): boolean;
