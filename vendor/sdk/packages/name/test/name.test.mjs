// node --test packages/name/test/name.test.mjs
//   런타임 의존성이 없어야 중계 서버(Node)와 SDK(브라우저) 양쪽에서 같은 규칙이 도는 것을 확인할 수 있다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adeName, adeVendorMask, isVendorLeak } from '../src/index.js';

test('제품명이 있던 자리에 ade 가 들어간다', () => {
  assert.equal(adeName('$mp_click'), '$ade_click');
  assert.equal(adeName('$mp_rage_click'), '$ade_rage_click');
  assert.equal(adeName('$mp_dead_click'), '$ade_dead_click');
  assert.equal(adeName('$mp_input_change'), '$ade_input_change');
  assert.equal(adeName('$mp_submit'), '$ade_submit');
  assert.equal(adeName('$mp_scroll'), '$ade_scroll');
  assert.equal(adeName('$mp_web_page_view'), '$ade_web_page_view');
  assert.equal(adeName('$mp_page_leave'), '$ade_page_leave');
  assert.equal(adeName('$mp_autocapture'), '$ade_autocapture');
});

test('$ 없는 제품명도 바뀐다', () => {
  assert.equal(adeName('mp_lib'), 'ade_lib');
  assert.equal(adeName('mp_sent_by_lib_version'), 'ade_sent_by_lib_version');
});

test('$ 는 예약 표시이지 제품명이 아니므로 유지한다', () => {
  for (const n of ['$browser', '$os', '$device', '$insert_id', '$lib_version', '$current_url']) {
    assert.equal(adeName(n), n);
  }
});

test('제품명이 없는 이름은 그대로 둔다', () => {
  for (const n of ['distinct_id', 'time', 'token', 'utm_source', 'gclid', 'ade_lib']) {
    assert.equal(adeName(n), n);
  }
});

test('접두어만 본다 — 이름 가운데의 mp_ 는 건드리지 않는다', () => {
  assert.equal(adeName('foo_mp_bar'), 'foo_mp_bar');
  assert.equal(adeName('$el_attr__data-mp_x'), '$el_attr__data-mp_x');
});

test('문자열이 아니면 입력을 그대로 돌려준다', () => {
  for (const v of [null, undefined, 42, true, { a: 1 }, ['x']]) {
    assert.equal(adeName(v), v);
  }
});

test('이벤트명과 속성 키를 바꾸고 값은 건드리지 않는다', () => {
  const e = {
    event: '$mp_click',
    properties: { mp_lib: 'web', $mp_autocapture: true, $browser: 'Chrome', distinct_id: '$device:abc' },
  };
  adeVendorMask(e);
  assert.equal(e.event, '$ade_click');
  assert.deepEqual(Object.keys(e.properties).sort(), ['$ade_autocapture', '$browser', 'ade_lib', 'distinct_id']);
  assert.equal(e.properties.ade_lib, 'web');          // 값 불변
  assert.equal(e.properties.$ade_autocapture, true);  // 값 불변
});

test('배치 배열도 처리한다 — 중계 서버가 통째로 넘길 수 있다', () => {
  const batch = [{ event: '$mp_click', properties: { mp_lib: 'web' } }, { event: '$mp_scroll', properties: {} }];
  adeVendorMask(batch);
  assert.equal(batch[0].event, '$ade_click');
  assert.equal(batch[0].properties.ade_lib, 'web');
  assert.equal(batch[1].event, '$ade_scroll');
});

test('훅 규약 — 반환값이 있어야 Mixpanel 이 이벤트를 폐기하지 않는다', () => {
  const e = { event: '$mp_click', properties: {} };
  assert.equal(adeVendorMask(e), e);
});

test('깨진 입력에도 예외를 던지지 않는다 — 서비스 비중단', () => {
  assert.doesNotThrow(() => adeVendorMask(null));
  assert.doesNotThrow(() => adeVendorMask([null, undefined, 1, 'x']));
  assert.doesNotThrow(() => adeVendorMask({ event: 1, properties: null }));
});

test('규칙 적용 뒤 남은 벤더 제품명을 검출한다', () => {
  // 배치 flush 가 훅 이후에 주입하는 필드 — SDK 훅으로는 구조적으로 못 막는다(§1.2)
  assert.equal(isVendorLeak('mp_sent_by_lib_version'), true);
  assert.equal(isVendorLeak('$mp_new_field'), true);
  assert.equal(isVendorLeak('mp-foo'), true);
  assert.equal(isVendorLeak('ade_lib'), false);
  assert.equal(isVendorLeak('$ade_click'), false);
  assert.equal(isVendorLeak('$browser'), false);
  assert.equal(isVendorLeak(42), false);
});
