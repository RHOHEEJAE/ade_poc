// node --test packages/extensions/test/session.userchanged.test.mjs
//
//   코어가 로그인 · 로그아웃 때 손잡이의 userChanged() 를 부르면 세션 확장은 세션을 새로 발급한다(DA-279).
//   탭 · 순번은 그대로다. index.ts 는 window 를 쓰므로 가짜 window 를 세우고 dist 를 읽는다.
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

test('userChanged — 세션만 새로 발급한다. 탭은 그대로, 순번은 이어진다', () => {
  const reports = [];
  const h = session().init({ track() {}, report: (r) => reports.push(r), apiHost: '/x' });
  const a = {};
  h.stamp(a);
  h.userChanged();
  const b = {};
  h.stamp(b);
  assert.notEqual(b.session_id, a.session_id, '새 세션이어야 한다');
  assert.equal(b.tab_id, a.tab_id);
  assert.equal(b.sequence_no, a.sequence_no + 1);
  assert.deepEqual(reports, []);
});
