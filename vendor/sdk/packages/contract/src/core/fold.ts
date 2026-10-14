// 조상 목록을 슬롯 속성으로 접는다(DA-101, 02 §4-2).
//
// prop 으로 전달받은 조상 목록을 거리에 따라 접어 DOM 속성 객체로 만든다.
// 목록은 가까운 조상이 앞에 온다.
// 요소 자신을 가리키는 슬롯은 요소의 속성이므로 여기서 만들지 않는다(01 §2-3).
//
// 접는 규칙은 이 함수 하나만 담는다.
// 목록을 만드는 경로는 둘이다. 빌드 플러그인의 prop 전달과 런타임 폴백의 DOM 조상 탐색이다.
// 두 경로의 접는 규칙이 달라지면 스택마다 신뢰 등급이 달라진다(02 §7-1).
//
// 이 함수는 `@adestack/placement` 에 있다가 이 패키지로 옮겨 왔다(DA-104).
// 폴백이 빌드 플러그인에 의존하면 빌드 도구가 서비스팀의 런타임 의존성이 된다(ADR-023 ①, ④).
//
// 이 함수는 바깥 식별자를 참조하지 않아야 한다.
// 빌드 플러그인이 이 함수의 소스를 그대로 대상 파일에 삽입하기 때문이다(ADR-023).
// 밑줄을 붙임표로 바꾸는 규칙을 공용 함수로 빼지 않고 여기에 직접 적은 이유가 그것이다.

import type { Ctx } from './ctx.js';

export function foldSlots(ctx: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  let parentUnused = true; // 직속 슬롯을 아직 채우지 않았는가
  let dropped = 0;

  for (const { key, value } of ctx) {
    // 같은 키는 가장 가까운 조상 하나만 남기고 나머지는 버리되 버린 개수를 센다(02 §4-2 다).
    if (seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);

    // 처음 채택한 키가 직속 조상이고 나머지는 그보다 먼 조상이다.
    // 반복 인덱스로 고르면 안 된다. 반복문에 continue 가 있다.
    // 그래서 몇 번째로 검사했는지와 몇 번째로 채택했는지가 달라진다(02 §4-2).
    const prefix = parentUnused ? 'data-ade-parent-' : 'data-ade-ancestor-';
    parentUnused = false;

    // 값이 비어도 키는 붙인다. 신뢰 등급 판정이 그 키를 본다(02 §4-2 마).
    out[prefix + key.replace(/_/g, '-')] = value ?? '';
  }

  if (dropped > 0) {
    out['data-ade-ancestor-dropped'] = String(dropped);
  }
  return out;
}
