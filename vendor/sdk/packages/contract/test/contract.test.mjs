// node --test packages/contract/test/contract.test.mjs   (pnpm build 가 선행되어야 한다)
//
//   주의: **이 파일은 `contract.ts` 의 실제 함수를 부른다.** 옆의 contract.rules.test.mjs 는 규칙을
//      옮겨 적어 문서와 대조하는 파일이라, 구현이 무엇을 하든 통과한다. 그래서 무한 재귀와
//      fail-open 같은 결함이 41건 전부 통과하는 상태에서 살아남았다.
//
//   TS 를 직접 import 할 수 없으므로 빌드 산출물을 읽는다. jsdom 을 들이지 않고, 계약이
//   실제로 쓰는 Element 표면(getAttribute · hasAttribute · attributes · parentElement ·
//   closest · tagName)만 흉내 내는 최소 스텁을 둔다. 계약은 이 여섯 개 밖을 쓰지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  readDeclaration,
  resolveCollect,
  resolveIdentityMode,
  resolveVerdict,
} from '../dist/index.js';

/** 최소 Element 스텁. 부모를 이어 붙이면 조상 순회도 그대로 돈다. */
function el(attrs = {}, parent = null) {
  const node = {
    tagName: 'DIV',
    parentElement: parent,
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    hasAttribute: (n) => n in attrs,
    // ade_poc: 코드젠 코어가 쓰는 브라우저 표면(getAttributeNames)을 더한다.
    getAttributeNames: () => Object.keys(attrs),
    get attributes() {
      return Object.entries(attrs).map(([name, value]) => ({ name, value }));
    },
    /** 자기 자신부터 조상까지 훑는다 — 브라우저 closest 와 같은 순서다. */
    closest(sel) {
      const name = /^\[([^\]=]+)\]$/.exec(sel)?.[1];
      if (!name) return null;
      for (let n = node; n; n = n.parentElement) if (n.hasAttribute(name)) return n;
      return null;
    },
  };
  return node;
}

const NAME = 'ade_0123456789ab';

// ── 모르는 kind ─────────────────────────────────────────────────────────────

/**
 * 재귀는 **호출 횟수로 잡아야 한다.**
 *
 * 스택이 터져도 `readDeclaration` 의 catch 가 `RangeError` 를 삼키고 빈 선언을 돌려주므로,
 * 반환값만 보면 정상과 구분되지 않는다. 실제로 이 시험을 처음 쓸 때 **버그가 있는 코드에서도
 * 통과했다.** 조용히 통과하는 시험은 없는 것만 못하다.
 */
function countingEl(attrs) {
  let reads = 0;
  const node = el(attrs);
  const raw = node.getAttribute;
  node.getAttribute = (n) => {
    if (n === 'data-ade-kind') reads++;
    return raw(n);
  };
  return { node, reads: () => reads };
}

test('모르는 kind 에서 무한 재귀하지 않는다', () => {
  // closest 는 값이 아니라 속성의 **존재**를 보므로 자기 자신을 잡는다.
  // 부모부터 찾지 않으면 readDeclaration → readUndeclared → readDeclaration 으로 스택이 터진다.
  const { node, reads } = countingEl({ 'data-ade-kind': 'section', 'data-ade-name': NAME });
  const decl = readDeclaration(node);

  assert.ok(decl, '판정 자체가 실패하면 안 된다');
  assert.equal(decl.kind, null);
  assert.ok(reads() < 5, `kind 를 ${reads()}번 읽었다 — 자기 자신으로 되돌아오고 있다`);
});

test('빈 문자열 kind 도 같은 경로다', () => {
  const { node, reads } = countingEl({ 'data-ade-kind': '' });
  const decl = readDeclaration(node);
  assert.equal(decl.kind, null);
  assert.ok(reads() < 5, `kind 를 ${reads()}번 읽었다`);
});

test('모르는 kind 는 미선언과 구분해 보고한다', () => {
  const known = readDeclaration(el({ 'data-ade-kind': 'section', 'data-ade-name': NAME }));
  const undeclared = readDeclaration(el({}));

  assert.equal(known.unknownKind, 'section', '어휘가 자랐다는 신호를 잃으면 안 된다');
  assert.equal(undeclared.unknownKind, undefined);

  // 둘이 같은 사유로 뭉치면 대시보드에서 갈리지 않는다
  const a = resolveVerdict(el({ 'data-ade-kind': 'section' }), known, false);
  const b = resolveVerdict(el({}), undeclared, false);
  assert.equal(a.verdict, 'needs_classification');
  assert.equal(b.verdict, 'needs_classification');
  assert.notEqual(a.reason, b.reason);
});

// ── collect — 모르는 값 ─────────────────────────────────────────────────────

test('collect 부재는 정상 수집이다', () => {
  assert.equal(resolveCollect(el({})), null);
});

test('모르는 collect 값은 막는다 (fail-open 금지)', () => {
  // 개인정보 지시를 읽는 유일한 함수다. 오타 하나에 열리면 수집 금지가 통째로 뚫린다.
  assert.equal(resolveCollect(el({ 'data-ade-collect': 'deney' })), 'deny');
  assert.equal(resolveCollect(el({ 'data-ade-collect': 'pseudonymize' })), 'deny');
});

test('collect 는 조상까지 훑어 강한 값이 이긴다', () => {
  const parent = el({ 'data-ade-collect': 'deny' });
  const child = el({ 'data-ade-collect': 'mask' }, parent);
  assert.equal(resolveCollect(child), 'deny', '안쪽에서 되살릴 수 없다');
});

// ── 조상 슬롯 ───────────────────────────────────────────────────────────────

test('조상 슬롯은 _id 로 끝나는 키만 받는다', () => {
  const decl = readDeclaration(
    el({
      'data-ade-kind': 'object',
      'data-ade-name': NAME,
      'data-ade-parent-modal-id': '42',
      'data-ade-parent-company': 'acme', // 업무ID 가 아닌 맥락 속성
    }),
  );
  assert.equal(decl.parent['modal_id'], '42');
  assert.equal(decl.parent['company'], undefined, '조상 슬롯에는 업무ID 만 담는다(§2-3 라)');
  assert.equal(decl.props['parent_company'], 'acme', '버리지 않고 props 로 간다');
});

test('R1 — 빈 문자열 슬롯이 살아남고 등급을 강등시킨다', () => {
  const decl = readDeclaration(
    el({
      'data-ade-kind': 'object',
      'data-ade-role': 'product',
      'data-ade-name': NAME,
      'data-ade-id-key': 'item_id',
      'data-ade-item-id': '7',
      'data-ade-parent-modal-id': '', // 조상은 있는데 값이 비었다
    }),
  );
  assert.equal(decl.parent['modal_id'], '', '빈 문자열을 떨어뜨리면 등급이 잘못 올라간다');
  assert.equal(resolveIdentityMode(decl), 'observed');
});

test('업무ID 는 data-ade-id-key 가 가리키는 것 하나뿐이다', () => {
  const decl = readDeclaration(
    el({
      'data-ade-kind': 'object',
      'data-ade-role': 'product',
      'data-ade-name': NAME,
      'data-ade-id-key': 'item_id',
      'data-ade-item-id': '7',
      'data-ade-dom-id': 'x', // _id 로 끝나지만 업무ID 가 아니다
    }),
  );
  assert.deepEqual(decl.identity, { item_id: '7' });
  assert.equal(decl.props['dom_id'], 'x', '추정하지 않는다 — props 로 간다');
});

// ── 판정 트리 ───────────────────────────────────────────────────────────────

test('§4 ① 안전 검사가 의미·관계보다 먼저다 (R4)', () => {
  const node = el({ 'data-ade-kind': 'object', 'data-ade-collect': 'deny' });
  const { verdict, reason } = resolveVerdict(node, readDeclaration(node), false);
  assert.equal(verdict, 'collection_failed');
  assert.match(reason, /ADE-601/);
});

test('§4 ③ name 형식 위반은 수집 실패다', () => {
  const node = el({ 'data-ade-kind': 'object', 'data-ade-name': 'ade_XYZ' });
  const { verdict, reason } = resolveVerdict(node, readDeclaration(node), false);
  assert.equal(verdict, 'collection_failed');
  assert.match(reason, /ADE-605/, '§12.1 표에 없는 번호를 발급하면 안 된다');
});

test('§4 ④ role 없는 object 는 분류 필요이고 ADE-501 이다', () => {
  const node = el({ 'data-ade-kind': 'object', 'data-ade-name': NAME });
  const { verdict, reason } = resolveVerdict(node, readDeclaration(node), false);
  assert.equal(verdict, 'needs_classification');
  assert.match(reason, /ADE-501/);
});

test('§4 ⑦ 완전한 선언은 사용 가능이다', () => {
  const node = el({
    'data-ade-kind': 'object',
    'data-ade-role': 'product',
    'data-ade-name': NAME,
    'data-ade-id-key': 'item_id',
    'data-ade-item-id': '7',
  });
  const decl = readDeclaration(node);
  assert.equal(resolveVerdict(node, decl, false).verdict, 'usable');
  assert.equal(resolveIdentityMode(decl), 'guaranteed');
});

test('role 은 자유 문자열이다 — 어휘가 자라도 SDK 를 안 고친다', () => {
  const node = el({
    'data-ade-kind': 'object',
    'data-ade-role': '데이터실이_어제_만든_role',
    'data-ade-name': NAME,
    'data-ade-id-key': 'brand_new_key',
    'data-ade-brand-new-key': '1',
  });
  const decl = readDeclaration(node);
  assert.equal(decl.role, '데이터실이_어제_만든_role');
  assert.deepEqual(decl.identity, { brand_new_key: '1' });
  assert.equal(resolveVerdict(node, decl, false).verdict, 'usable');
});

// ── 고정 이름 속성 목록 ─────────────────────────────────────────────────────

test('고정 목록에 data-ade-pl 은 없다', async () => {
  // 빌드가 제거하므로 런타임에 존재하지 않는다(선언 계약 §2-5).
  // props 파싱에서는 막아야 하지만 벤더에게 알릴 이름은 아니다.
  const { FIXED_ATTRS } = await import('../dist/index.js');
  assert.ok(!FIXED_ATTRS.includes('data-ade-pl'));
});

test('고정 이름이 조상 슬롯 접두어와 부딪히지 않는다', async () => {
  // data-ade-ancestor-dropped 는 접두어가 겹치는 **고정 이름**이다.
  // 슬롯 파서와 안 부딪히는 근거는 「조상 슬롯 키는 반드시 _id 로 끝난다」는
  // 불변식이다(선언 계약 §2-3 다 각주). 그래서 접두어가 아니라 끝자리를 본다.
  const { FIXED_ATTRS } = await import('../dist/index.js');
  for (const a of FIXED_ATTRS) {
    if (a.startsWith('data-ade-parent-') || a.startsWith('data-ade-ancestor-')) {
      assert.ok(!a.endsWith('-id'), `${a} 는 조상 업무ID 로 오분류된다`);
    }
  }
});
