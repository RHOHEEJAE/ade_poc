// node --test packages/contract/test/contract.rules.test.mjs
//
//   계약 함수는 DOM 이 필요한데 이 저장소에 jsdom 이 없다.
//   Element 인터페이스 중 계약이 실제로 쓰는 것만 흉내 내는 최소 스텁을 둔다.
//   → 판정 로직(§3 두 조항 · §4 판정 트리)은 이걸로 고정하고,
//     실제 DOM 동작은 실브라우저 관문(§8)이 본다. jsdom 으로도 대체 불가다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// contract.ts 는 TS 라 여기서 직접 import 할 수 없다.
// 판정 규칙만 옮겨 놓은 것이 아니라 **같은 파일을 읽어 검증**해야 의미가 있으므로,
// 여기서는 규칙이 문서와 일치하는지 표로 고정하고 구현 대조는 관문에 맡긴다.
// (계약 패키지 정식 배포 뒤에는 그 패키지의 시험을 그대로 쓴다.)

/** 인계 계약 §3 ㉠ — object 에서 role 과 업무ID 가 짝을 이루는가. */
function pairOk({ role, identity, identityStatic }) {
  if (role && !identity && !identityStatic) return false; // 요구했는데 없다 (ADE-507)
  if (!role && identity) return false;                    // 제공했는데 해석할 수 없다 (ADE-204)
  return true;
}

test('§3 ㉠ — 네 조합의 판정이 문서와 일치한다', () => {
  assert.equal(pairOk({ role: 'product', identity: true, identityStatic: false }), true);
  assert.equal(pairOk({ role: null, identity: false, identityStatic: false }), true);
  assert.equal(pairOk({ role: 'banner', identity: false, identityStatic: true }), true);
  assert.equal(pairOk({ role: 'product', identity: false, identityStatic: false }), false);
  assert.equal(pairOk({ role: null, identity: true, identityStatic: false }), false);
});

/** 인계 계약 §3 ㉡ — 슬롯 값이 빈 문자열이면 observed. R1 이 여기서 걸린다. */
function hasEmptySlot(slots) {
  for (const slot of slots) for (const v of Object.values(slot)) if (v === '') return true;
  return false;
}

test('§3 ㉡ — 빈 문자열과 부재를 구분한다 (R1)', () => {
  // 조상이 아예 없다 = 요구가 없다 = 정상
  assert.equal(hasEmptySlot([{}, {}, {}]), false);
  // 조상은 있는데 값이 비었다 = 가려야 할 인스턴스가 있는데 못 가렸다
  assert.equal(hasEmptySlot([{}, { item_id: '' }, {}]), true);
  // 값이 찼다
  assert.equal(hasEmptySlot([{}, { item_id: '7' }, {}]), false);
  // ancestor 도 parent 와 같게 본다 (ADE-502)
  assert.equal(hasEmptySlot([{}, {}, { modal_id: '' }]), true);
  // '0' 은 빈 값이 아니다 — falsy 로 읽으면 여기서 틀린다
  assert.equal(hasEmptySlot([{ item_id: '0' }, {}, {}]), false);
});

test('§3 — ancestorDropped 가 0이 아니어도 guaranteed 다 (ADE-506)', () => {
  // 채워져야 할 슬롯은 다 찼다. 집계용이며 오류가 아니다.
  assert.equal(hasEmptySlot([{ item_id: '7' }, { modal_id: '42' }, {}]), false);
});

/** 선언 계약 §2-4 — 강한 값이 이긴다. 안쪽에서 되살리는 것은 허용하지 않는다. */
const RANK = { deny: 3, skip: 2, mask: 1 };
function strongest(chain) {
  let best = null;
  for (const v of chain) if (v && (!best || RANK[v] > RANK[best])) best = v;
  return best;
}

test('collect — 조상까지 훑어 강한 값이 이긴다', () => {
  assert.equal(strongest([null, 'mask', 'deny']), 'deny');
  assert.equal(strongest(['mask', 'skip']), 'skip');
  assert.equal(strongest([null, null]), null);
  assert.equal(strongest(['mask']), 'mask');
});

/** 인계 계약 §4 — 판정 트리. 순서가 곧 규칙이다. */
function verdict({ collect, elementUnsafe, kind, name, role, identity, identityStatic }) {
  if (collect === 'deny' || collect === 'skip') return 'collection_failed'; // ①
  if (elementUnsafe) return 'collection_failed';                            // ①
  if (!kind) return 'needs_classification';                                 // ②
  if (!name || !/^ade_[0-9a-f]{12}$/.test(name)) return 'collection_failed'; // ③
  if (kind === 'object') {
    if (!role) return 'needs_classification';                               // ④
    if (!identity && !identityStatic) return 'needs_classification';        // ⑤
  }
  return 'usable';                                                          // ⑦
}

const NAME = 'ade_3f2a91c4d5e6';

test('§4 — 안전 검사가 의미·관계 검사보다 먼저다 (R4)', () => {
  // 비밀번호 입력을 다른 Kind 로 잘못 선언해도 값과 행동을 만들지 않는다
  const base = { kind: 'object', name: NAME, role: 'product', identity: true, identityStatic: false };
  assert.equal(verdict({ ...base, collect: 'deny' }), 'collection_failed');
  assert.equal(verdict({ ...base, collect: 'skip' }), 'collection_failed');
  assert.equal(verdict({ ...base, elementUnsafe: true }), 'collection_failed');
});

test('§4 — mask 는 이벤트를 없애지 않는다', () => {
  const r = verdict({ collect: 'mask', kind: 'object', name: NAME, role: 'product', identity: true });
  assert.equal(r, 'usable');
});

test('§4 — 미선언 요소는 분류 필요이지 실패가 아니다', () => {
  assert.equal(verdict({ kind: null }), 'needs_classification');
});

test('§4 — name 형식이 깨지면 수집 실패다', () => {
  assert.equal(verdict({ kind: 'control', name: '' }), 'collection_failed');
  assert.equal(verdict({ kind: 'control', name: 'ade_XYZ' }), 'collection_failed');
  assert.equal(verdict({ kind: 'control', name: 'ade_3f2a91c4d5e' }), 'collection_failed'); // 11자
  assert.equal(verdict({ kind: 'control', name: NAME }), 'usable');
});

test('§4 ④⑤ — role 없는 object 는 ④에서 빠지고 ⑤에 걸리지 않는다', () => {
  assert.equal(verdict({ kind: 'object', name: NAME, role: null, identity: false }), 'needs_classification');
  assert.equal(verdict({ kind: 'object', name: NAME, role: 'product', identity: false }), 'needs_classification');
  assert.equal(
    verdict({ kind: 'object', name: NAME, role: 'banner', identity: false, identityStatic: true }),
    'usable',
  );
});

test('§4 — control·input 은 ④⑤ 를 건너뛴다', () => {
  assert.equal(verdict({ kind: 'control', name: NAME }), 'usable');
  assert.equal(verdict({ kind: 'input', name: NAME }), 'usable');
});

test('등급과 판정은 다른 축이다 — 합치면 구분이 사라진다', () => {
  // 상품 ID 가 그날 안 온 경우: 코드는 옳다(usable) 인데 값은 못 믿는다(observed)
  const dayEmpty = {
    verdict: verdict({ kind: 'object', name: NAME, role: 'product', identity: true }),
    grade: hasEmptySlot([{ item_id: '' }, {}, {}]) ? 'observed' : 'guaranteed',
  };
  // 선언이 빠진 경우: FE 가 코드를 고쳐야 한다
  const declMissing = {
    verdict: verdict({ kind: 'object', name: NAME, role: 'product', identity: false }),
    grade: 'observed',
  };
  assert.deepEqual(dayEmpty, { verdict: 'usable', grade: 'observed' });
  assert.deepEqual(declMissing, { verdict: 'needs_classification', grade: 'observed' });
  // 등급만 보면 둘 다 observed 라 같아 보인다 — 판정이 있어야 손댈 것이 있는지 갈린다
  assert.equal(dayEmpty.grade, declMissing.grade);
  assert.notEqual(dayEmpty.verdict, declMissing.verdict);
});
