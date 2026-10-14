// node --test packages/contract/test/safety.test.mjs
//
//   직접 결과의 속성 키 판정(isSensitiveKey)을 고정한다. 요소 판정과 같은 낱말 목록을 쓰되 키는 토막 단위다 —
//   부분 문자열로 보면 author_id · hotel_id 같은 업무 키가 조용히 빠진다(DA-201 · DA-203). dist 를 import 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isSensitiveKey, isValidUserId, isValidGroupKey, isValidEventName, normalizeGroupIds } from '../dist/index.js';

test('인증 · 결제 · 신원 낱말이 토막으로 들어간 키는 민감하다', () => {
  for (const k of ['password', 'passwd', 'user_pwd', 'card_no', 'cvc', 'ssn', 'jumin', 'account_no', 'auth_token', 'otp', 'email', 'phone', 'birth', 'account_type']) {
    assert.equal(isSensitiveKey(k), true, k);
  }
});

test('camelCase 와 구분자 없이 붙여 쓴 것도 잡는다', () => {
  for (const k of ['cardNo', 'userEmail', 'cardno', 'accountno', 'phone2', 'birthDate', 'shippingAddress']) {
    assert.equal(isSensitiveKey(k), true, k);
  }
});

test('키에서만 더 보는 낱말 — 메일 · 주소', () => {
  assert.equal(isSensitiveKey('mail'), true);
  assert.equal(isSensitiveKey('addr'), true);
  assert.equal(isSensitiveKey('shipping_address'), true);
});

test('업무 키는 통과한다 — 낱말이 다른 낱말 안에 들어 있어도 토막이 다르면 아니다 (DA-203)', () => {
  for (const k of ['order_id', 'amount', 'currency', 'product_code', 'qty', 'hotel_id', 'author_id', 'scorecard', 'mailing_list', 'telecom_plan']) {
    assert.equal(isSensitiveKey(k), false, k);
  }
});

test('문자열이 아니거나 토막이 없으면 민감으로 본다 — 판정할 수 없으면 안전한 쪽', () => {
  assert.equal(isSensitiveKey(undefined), true);
  assert.equal(isSensitiveKey(3), true);
  assert.equal(isSensitiveKey('___'), true);
  assert.equal(isSensitiveKey('123'), true);
});

// ── 값 길이 — 벤더가 자르기 전에 뺀다 (DA-216) ─────────────────────────────────
import { dropLongDeclarationValues, VENDOR_MAX_STRING } from '../dist/safety.js';

test('dropLongDeclarationValues — 255 는 두고 256 은 그 값만 뺀다. 자르지 않는다', () => {
  const decl = {
    kind: 'object', role: 'product', name: 'ade_0000000000a1',
    identity: { item_id: 'M'.repeat(256) },
    props: { ok: 'L'.repeat(255), long: 'x'.repeat(300) },
    parent: { cat_id: 'c-1' },
    ancestor: {},
    placement: 'p'.repeat(256),
  };
  const dropped = dropLongDeclarationValues(decl);
  assert.deepEqual(dropped.sort(), ['identity.item_id', 'placement', 'props.long']);
  assert.equal('item_id' in decl.identity, false, '256자 업무ID 는 빠진다');
  assert.equal(decl.props.ok.length, VENDOR_MAX_STRING, '255자는 그대로');
  assert.equal('long' in decl.props, false);
  assert.equal(decl.parent.cat_id, 'c-1', '짧은 값은 손대지 않는다');
  assert.equal(decl.placement, null);
});

test('dropLongDeclarationValues — 선언이 아니거나 비어 있으면 아무것도 안 하고 던지지 않는다', () => {
  assert.deepEqual(dropLongDeclarationValues(null), []);
  assert.deepEqual(dropLongDeclarationValues('x'), []);
  assert.deepEqual(dropLongDeclarationValues({ identity: null, props: 3 }), []);
});

// ── 민감 요소 — 폼 판정 ────────────────────────────────────────────────────
//
//   폼 이름 · id · action · class 는 낱말이 다른 낱말 안에 들어 있어도(border 안의 order, scorecard 안의 card)
//   민감이 아니다. 부분 문자열로 보던 시절 Tailwind `border` · Bootstrap `card` 클래스 하나로 그 폼 안의
//   모든 클릭 · 입력 · submit 이 조용히 사라졌다. 키 판정(isSensitiveKey)과 같은 토막 단위로 본다.
import { isSensitiveElement } from '../dist/index.js';

/**
 * 최소 Element 스텁. `isSensitiveElement` 가 쓰는 표면(tagName · getAttribute · closest · querySelector)만 흉내 낸다.
 * @param {string} tag 태그 이름.
 * @param {Record<string, string>} attrs 속성.
 * @param {object|null} form 감싸는 폼 스텁. `closest('form')` 이 돌려준다.
 */
function stub(tag, attrs = {}, form = null) {
  const node = {
    tagName: tag.toUpperCase(),
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    closest: (sel) => (sel === 'form' ? (tag === 'form' ? node : form) : null),
    querySelector: () => null,
  };
  return node;
}
const formOf = (attrs) => stub('form', attrs);

test('isSensitiveElement — 폼 속성에 인증 · 결제 낱말이 있으면 그 안의 요소는 민감하다', () => {
  for (const cls of ['checkout-form', 'login__form', 'loginForm', 'payment', 'order-form', 'signup', 'cardholder', 'authorization-form', 'oauth-callback']) {
    assert.equal(isSensitiveElement(stub('button', {}, formOf({ class: cls }))), true, cls);
  }
  assert.equal(isSensitiveElement(stub('button', {}, formOf({ id: 'card-form' }))), true, 'id 의 card');
  assert.equal(isSensitiveElement(stub('button', {}, formOf({ action: '/api/orders' }))), true, 'action 의 토막');
  assert.equal(isSensitiveElement(stub('button', {}, formOf({ id: 'authForm' }))), true, 'id 의 camelCase 토막');
});

test('isSensitiveElement — 소문자로 붙여 쓴 합성어도 민감하다 (부분 문자열이던 때와 같게)', () => {
  for (const id of ['forgotpassword', 'myaccount', 'giftcard', 'reorder-form', 'autopay', 'netbank', 'authn-form', 'preauth', 'registration', 'neworderform', 'usercardinfo', 'mypayinfo']) {
    assert.equal(isSensitiveElement(stub('button', {}, formOf({ id }))), true, id);
  }
});

test('isSensitiveElement — 프레임워크 유틸 클래스(card · card-body · order-2)는 폼 맥락이 아니다', () => {
  for (const cls of ['card p-3', 'card-body', 'card-header shadow', 'flex order-2', 'order-first', 'card order-last', 'mat-card']) {
    assert.equal(isSensitiveElement(stub('button', {}, formOf({ class: cls }))), false, cls);
  }
  // 같은 낱말이라도 class 가 아닌 id · name 에 있으면 업무 맥락이다
  assert.equal(isSensitiveElement(stub('button', {}, formOf({ id: 'card' }))), true, 'id=card');
  assert.equal(isSensitiveElement(stub('button', {}, formOf({ name: 'order' }))), true, 'name=order');
});

test('isSensitiveElement — 낱말이 다른 낱말 안에 들어 있으면 민감이 아니다 (border · scorecard · author · registry)', () => {
  for (const cls of ['flex flex-col border rounded', 'scorecard', 'author-form', 'border-top p-3', 'search-form', 'registry-search', 'authority-list', 'recorder', 'wildcard', 'discard-changes']) {
    assert.equal(isSensitiveElement(stub('button', {}, formOf({ class: cls }))), false, cls);
  }
  assert.equal(isSensitiveElement(stub('button', {}, formOf({ action: '/api/products' }))), false);
});

test('isSensitiveElement — 폼이 없거나 폼에 단서가 없으면 통과한다', () => {
  assert.equal(isSensitiveElement(stub('button', {})), false);
  assert.equal(isSensitiveElement(stub('button', {}, formOf({}))), false);
});

test('사용자 ID — 공백이 아닌 문자열 255자 이하, @ 없음, $device: 접두어 없음만 받는다(DA-279)', () => {
  for (const ok of ['M-100234', '1', 'x'.repeat(255), ' 앞뒤공백 ']) assert.equal(isValidUserId(ok), true, JSON.stringify(ok));
  for (const bad of ['', '   ', '\t', 'x'.repeat(256), 'a@b.com', '@', '$device:abc', 123, null, undefined, {}, ['M-1']]) {
    assert.equal(isValidUserId(bad), false, JSON.stringify(bad));
  }
});

test('그룹 키 — 형식만 본다: 문자열 · 공백 뺀 길이 1 이상 255 이하 · $ 로 시작 안 함 · 민감 키 아님(DA-279)', () => {
  for (const ok of ['company', 'team_id', ' team ']) assert.equal(isValidGroupKey(ok), true, JSON.stringify(ok));
  // '회사' · '123' — 알파벳 토막이 없어 판정할 수 없는 키는 민감으로 본다(isSensitiveKey 와 같은 안전한 쪽)
  for (const bad of ['', '   ', '$x', 'x'.repeat(256), 'email', 'card_no', '회사', '123', 123, null]) {
    assert.equal(isValidGroupKey(bad), false, JSON.stringify(bad));
  }
});

test('그룹 ID — 값 하나는 배열로 감싸고, 받을 수 없는 것은 null 이다(DA-279)', () => {
  assert.deepEqual(normalizeGroupIds('hecto'), ['hecto']);
  assert.deepEqual(normalizeGroupIds(7), [7]);
  assert.deepEqual(normalizeGroupIds(['a', 2]), ['a', 2]);
  for (const bad of ['', 'a@b.com', [], ['ok', ''], NaN, Infinity, {}, null, 'x'.repeat(256), [['nested']]]) {
    assert.equal(normalizeGroupIds(bad), null, JSON.stringify(bad));
  }
});

test('시간 잴 기록 이름 — 공백이 아닌 문자열 255자 이하만 받는다(DA-279 §10)', () => {
  for (const ok of ['ade_3f2a91c4d5e6', '$mp_click', 'x'.repeat(255), ' a ']) assert.equal(isValidEventName(ok), true, JSON.stringify(ok));
  for (const bad of ['', '   ', 'x'.repeat(256), 123, null, undefined, {}, ['a']]) {
    assert.equal(isValidEventName(bad), false, JSON.stringify(bad));
  }
});
