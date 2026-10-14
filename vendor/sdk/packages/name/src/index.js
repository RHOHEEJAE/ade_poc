// @adestack/name — 벤더 제품명을 우리 이름으로 바꾸는 규칙.
//
// SDK 는 전송 직전(hooks.before_send_events)에, 중계 서버는 받은 뒤에 같은 규칙을 한 번 더
// 적용한다. 두 곳이 같은 파일을 import 해야 규칙이 갈리지 않는다. 중계 서버가 Node 순수 ESM 이라
// 빌드 없이 바로 읽을 수 있도록 .ts 가 아니라 .js 로 둔다. 타입은 index.d.ts 가 준다.
//
// 규칙은 하나다 — 제품명 접두어 `mp_` 를 `ade_` 로 바꾼다. `$` 는 벤더의 예약 표시라 그대로 둔다.
//
//   $mp_click   -> $ade_click
//   mp_lib      -> ade_lib
//   $browser    -> $browser      (제품명이 아니다)
//   distinct_id -> distinct_id   (제품명이 없다)
//
// 매핑표를 두지 않는다. 접두어 규칙이라 벤더가 `$mp_` 로 새 필드를 추가해도 자동으로 바뀐다.

/** 벤더 제품명 접두어. `$` 는 살리고 `mp_` 만 바꾼다. */
const VENDOR_PREFIX = /^(\$?)mp_/;

/** 규칙 적용 뒤에도 남아 있으면 안 되는 이름. 중계 서버가 누출 플래그를 세울 때 쓴다. */
export const VENDOR_LEAK = /^\$?mp[_-]/;

/**
 * 이름 하나를 규칙에 따라 바꾼다. 제품명이 없으면 그대로 돌려준다.
 * @param {unknown} name 이벤트 이름 또는 속성 키.
 * @return {unknown} `$mp_` · `mp_` 접두어가 `$ade_` · `ade_` 로 바뀐 이름. 문자열이 아니면 입력 그대로.
 */
export const adeName = (name) =>
  typeof name === 'string' ? name.replace(VENDOR_PREFIX, '$1ade_') : name;

/**
 * 규칙을 적용한 뒤에도 벤더 제품명이 남아 있는지 본다.
 *
 * 벤더는 배치 전송 경로에서 `mp_sent_by_lib_version` 을 훅 다음에 끼워 넣는다. 그래서 SDK 훅만으로는
 * 0건이 되지 않고, 중계 서버가 이 함수로 다시 걸러 플래그를 남긴다.
 *
 * @param {unknown} name 검사할 이름.
 * @return {boolean} `mp_` · `mp-` 접두어(앞의 `$` 유무 무관)가 남아 있으면 true.
 */
export const isVendorLeak = (name) => typeof name === 'string' && VENDOR_LEAK.test(name);

/**
 * 이벤트의 이름과 속성 키를 전부 바꾼다. 속성 값은 건드리지 않는다.
 *
 * 벤더의 `hooks.before_send_events` 는 이벤트 객체 하나를 넘긴다. 배열도 받는 것은 중계 서버가
 * 배치를 통째로 넘길 수 있기 때문이다.
 *
 * @template T
 * @param {T} data `{event, properties}` 또는 그 배열.
 * @return {T} 같은 객체(제자리 수정). 벤더 훅 규약이 반환값을 요구한다.
 */
export function adeVendorMask(data) {
  const list = Array.isArray(data) ? data : [data];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    if ('event' in e) e.event = adeName(e.event);
    if (e.properties && typeof e.properties === 'object') {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const [k, v] of Object.entries(e.properties)) out[String(adeName(k))] = v;
      e.properties = out;
    }
  }
  return data;
}
