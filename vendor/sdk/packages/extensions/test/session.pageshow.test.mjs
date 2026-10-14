// node --test packages/extensions/test/session.pageshow.test.mjs
//
//   session/index.ts 가 pagehide 뿐 아니라 pageshow(persisted) 도 건다 — bfcache 로 되살아난 페이지가
//   「열려 있다」 표시를 다시 세워야 그 뒤의 탭 복제가 같은 tab_id 를 잇지 않는다.
//   index.ts 는 window 를 쓰므로 가짜 window 를 세우고 dist 를 읽는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/** window 리스너를 이름별로 모아 시험이 직접 부른다 */
const listeners = new Map();
globalThis.window = {
  localStorage: fakeStorage(),
  sessionStorage: fakeStorage(),
  addEventListener: (type, fn) => listeners.set(type, fn),
  removeEventListener() {},
};

const { session } = await import('../dist/index.js');

test('pagehide 로 지운 표시를 pageshow(persisted) 가 다시 세운다', () => {
  session().init({ track() {}, report() {} });
  const ss = window.sessionStorage;
  assert.equal(ss.getItem('ade.tab_open'), '1', 'init 이 표시를 세운다');

  listeners.get('pagehide')?.({});
  assert.equal(ss.getItem('ade.tab_open'), null, 'pagehide 가 지운다');

  assert.ok(listeners.has('pageshow'), 'pageshow 리스너가 없다');
  listeners.get('pageshow')({ persisted: false });
  assert.equal(ss.getItem('ade.tab_open'), null, '새로 뜬 페이지(persisted=false)는 init 이 세우므로 여기서는 안 한다');
  listeners.get('pageshow')({ persisted: true });
  assert.equal(ss.getItem('ade.tab_open'), '1', 'bfcache 복원이면 다시 세운다');
});
