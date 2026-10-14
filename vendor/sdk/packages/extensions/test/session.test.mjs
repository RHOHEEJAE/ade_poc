// node --test packages/session/test/session.test.mjs
//
//   세션 · 탭 · 순번 규칙을 **구현 파일에서 직접 읽어** 고정한다. core.js 가 저장소 · 시각 · ID 생성을
//   밖에서 받으므로 가짜로 30분 만료 · 로그인 전환 · 탭 복제 · 순번 · 저장소 차단을 돌린다.
//   브라우저 배선(index.ts — pagehide · sessionStorage 실물)은 실브라우저 관문(tests/browser)이 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSession, IDLE_MS, KEYS } from '../src/session/core.js';

/** 가짜 저장소. `broken` 이면 모든 접근이 던진다 — 사생활 모드 · 차단 흉내 */
function fakeStore(init = {}, broken = false) {
  const m = new Map(Object.entries(init));
  const guard = () => {
    if (broken) throw new Error('storage blocked');
  };
  return {
    get: (k) => (guard(), m.has(k) ? m.get(k) : null),
    set: (k, v) => (guard(), void m.set(k, v)),
    remove: (k) => (guard(), void m.delete(k)),
    dump: () => Object.fromEntries(m),
  };
}

/** 예측 가능한 ID — 접두어 + 순번. 파일 전체에서 하나를 쓴다 — 탭 둘이 같은 ID 를 받으면 시험이 안 된다 */
let idSeq = 0;
const newId = (prefix) => `${prefix}_${++idSeq}`;

function make({ local = fakeStore(), session = fakeStore(), t = 1_000_000, onStorageBlocked } = {}) {
  const clock = { t };
  const core = createSession({ local, session, now: () => clock.t, newId, onStorageBlocked });
  return { core, clock, local, session };
}

test('첫 이벤트 — 세션 · 탭을 새로 발급하고 순번은 1', () => {
  const { core } = make();
  const s = core.stamp();
  assert.match(s.session_id, /^s_/);
  assert.match(s.tab_id, /^t_/);
  assert.equal(s.sequence_no, 1);
  assert.equal(core.duplicated, false);
});

test('순번은 탭 안에서 1씩 는다. 세션 · 탭은 그대로', () => {
  const { core } = make();
  const a = core.stamp();
  const b = core.stamp();
  const c = core.stamp();
  assert.deepEqual([a.sequence_no, b.sequence_no, c.sequence_no], [1, 2, 3]);
  assert.equal(a.session_id, c.session_id);
  assert.equal(a.tab_id, c.tab_id);
});

test('30분 비활동이면 다음 이벤트부터 새 session_id. 29분은 아니다', () => {
  const { core, clock } = make();
  const first = core.stamp().session_id;
  clock.t += IDLE_MS - 60_000;
  assert.equal(core.stamp().session_id, first, '29분은 같은 세션');
  clock.t += IDLE_MS + 1;
  assert.notEqual(core.stamp().session_id, first, '30분 넘게 쉬면 새 세션');
});

test('활동이 이어지면 총 시간이 30분을 넘어도 같은 세션이다 — 비활동 기준이지 총 길이가 아니다', () => {
  const { core, clock } = make();
  const first = core.stamp().session_id;
  for (let i = 0; i < 10; i++) {
    clock.t += 10 * 60 * 1000; // 10분마다 한 번씩 100분
    assert.equal(core.stamp().session_id, first);
  }
});

test('reset() — 로그인 · 로그아웃은 그 자리에서 새 세션. 탭 · 순번은 그대로', () => {
  const { core } = make();
  const before = core.stamp();
  const sid = core.reset();
  const after = core.stamp();
  assert.notEqual(after.session_id, before.session_id);
  assert.equal(after.session_id, sid);
  assert.equal(after.tab_id, before.tab_id);
  assert.equal(after.sequence_no, before.sequence_no + 1);
});

test('같은 브라우저의 다른 탭 — session 은 공유(localStorage), tab · 순번은 따로(sessionStorage)', () => {
  const local = fakeStore();
  const tab1 = make({ local });
  const tab2 = make({ local }); // sessionStorage 는 각자
  const a = tab1.core.stamp();
  const b = tab2.core.stamp();
  assert.equal(a.session_id, b.session_id);
  assert.notEqual(a.tab_id, b.tab_id);
  assert.equal(b.sequence_no, 1, '새 탭은 순번이 1 부터');
});

test('새로고침 — 「열려 있다」 표시를 지우고 떠났으면 같은 tab_id 를 잇고 순번도 이어진다', () => {
  const session = fakeStore();
  const first = make({ session });
  const tabId = first.core.stamp().tab_id;
  first.core.stamp();
  first.core.closing(); // pagehide
  const again = make({ session }); // 같은 sessionStorage 로 다시 뜸
  const s = again.core.stamp();
  assert.equal(s.tab_id, tabId);
  assert.equal(s.sequence_no, 3);
  assert.equal(again.core.duplicated, false);
});

test('bfcache 복원 — 떠나며 지운 「열려 있다」 표시를 되살아날 때 다시 세운다. 안 세우면 그 뒤 복제가 같은 tab_id 를 잇는다', () => {
  const session = fakeStore();
  const { core: a } = make({ session });
  a.stamp();
  a.closing(); // 다른 페이지로 이동 — pagehide
  assert.equal(session.get(KEYS.open), null);
  a.reopened(); // 뒤로가기 — pageshow(persisted). 같은 JS 상태가 그대로 살아난다
  assert.equal(session.get(KEYS.open), '1', '표시가 다시 서야 한다');

  // 이 상태에서 탭을 복제하면 표시가 있으므로 복제로 판정돼 새 tab_id 를 받는다
  const { core: b } = make({ session: fakeStore(session.dump()) });
  assert.notEqual(b.stamp().tab_id, a.stamp().tab_id);
});

test('탭 복제 — 표시가 남은 채 sessionStorage 가 베껴지면 새 tab_id, 순번은 1 부터 (벤더와 같은 요령)', () => {
  const session = fakeStore();
  const original = make({ session });
  const tabId = original.core.stamp().tab_id;
  original.core.stamp();
  // 원본은 아직 열려 있다 → closing() 이 안 불렸다 → ade.tab_open 이 '1' 인 채로 복제된다
  const copied = fakeStore(session.dump());
  const dup = make({ session: copied });
  const s = dup.core.stamp();
  assert.equal(dup.core.duplicated, true);
  assert.notEqual(s.tab_id, tabId);
  assert.equal(s.sequence_no, 1);
  // 원본 탭은 영향 없다
  assert.equal(original.core.stamp().tab_id, tabId);
});

test('저장소가 막혀도 한 탭 안에서는 값이 일관되고, 차단은 한 번만 알린다', () => {
  let warned = 0;
  const { core, clock } = make({
    local: fakeStore({}, true),
    session: fakeStore({}, true),
    onStorageBlocked: () => warned++,
  });
  const a = core.stamp();
  clock.t += 1000;
  const b = core.stamp();
  assert.equal(a.session_id, b.session_id, '메모리 대체가 저장소와 같아야 매 이벤트 만료로 안 뜬다');
  assert.equal(a.tab_id, b.tab_id);
  assert.deepEqual([a.sequence_no, b.sequence_no], [1, 2]);
  assert.equal(warned, 1);
});

test('키 이름은 ade. 접두어 — 벤더 mp_ 와 섞이지 않는다', () => {
  for (const k of Object.values(KEYS)) assert.match(k, /^ade\./);
});

test('무활동 만료로 갈리면 onSessionExpired 가 이전 · 현재 ID 를 받는다. 처음 발급과 reset 은 알리지 않는다 (DA-206)', () => {
  const { core, clock } = make();
  const seen = [];
  core.onSessionExpired((c) => seen.push(c));
  const first = core.stamp().session_id; // 처음 발급 — 전환이 아니다
  assert.equal(seen.length, 0);
  core.reset(); // 로그인 — 부르는 쪽이 안다
  assert.equal(seen.length, 0);
  const afterReset = core.stamp().session_id;
  clock.t += IDLE_MS + 1;
  const next = core.stamp().session_id;
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { previous: afterReset, current: next });
  assert.notEqual(first, next);
});
