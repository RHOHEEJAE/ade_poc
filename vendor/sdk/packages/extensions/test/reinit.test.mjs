// node --test packages/session/test/reinit.test.mjs
//
//   SPA 가 adesdk.init 을 두 번 불러 session().init 이 두 번 돌아도 **같은 탭**이어야 한다(DA-203).
//   첫 init 이 「열려 있다」 표시를 세우므로, init 마다 상태를 새로 만들면 두 번째가 복제 탭으로 오판된다.
//   index.ts 는 window 를 쓰므로 가짜 window 를 세우고 dist 를 읽는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Storage 흉내 — getItem · setItem · removeItem 만 */
function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

globalThis.window = {
  localStorage: fakeStorage(),
  sessionStorage: fakeStorage(),
  addEventListener() {},
  removeEventListener() {},
};

const { session } = await import('../dist/index.js');
const ctx = { track() {}, report() {} };

test('같은 객체를 두 번 init — tab_id 유지, 순번 이어짐, 세션 유지', () => {
  const ext = session();
  const h1 = ext.init(ctx);
  const a = {};
  h1.stamp(a);
  const b = {};
  h1.stamp(b);

  const h2 = ext.init(ctx); // SPA 재init
  const c = {};
  h2.stamp(c);

  assert.equal(c.tab_id, a.tab_id, '재init 이 복제 탭으로 오판되면 여기서 갈린다');
  assert.equal(c.session_id, a.session_id);
  assert.deepEqual([a.sequence_no, b.sequence_no, c.sequence_no], [1, 2, 3]);
});

test('새 객체로 다시 init 해도 같은 페이지면 같은 탭이다', () => {
  const first = session().init(ctx);
  const a = {};
  first.stamp(a);
  const second = session().init(ctx);
  const b = {};
  second.stamp(b);
  assert.equal(b.tab_id, a.tab_id);
  assert.equal(b.sequence_no, a.sequence_no + 1);
});

test('reset() 은 어느 객체에서 불러도 같은 탭 상태를 바꾼다', () => {
  const ext = session();
  const h = ext.init(ctx);
  const before = {};
  h.stamp(before);
  const sid = ext.reset();
  const after = {};
  h.stamp(after);
  assert.equal(after.session_id, sid);
  assert.notEqual(after.session_id, before.session_id);
  assert.equal(after.tab_id, before.tab_id);
});
