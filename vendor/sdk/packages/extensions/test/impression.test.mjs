// node --test packages/impression/test/impression.test.mjs
//
//   판정 규칙을 **구현 파일에서 직접 읽어** 고정한다. contract.test.mjs 와 달리
//   규칙을 옮겨 적지 않는다 — core.js 가 .js 인 이유가 이것이다.
//
//   IntersectionObserver 배선(impression.ts)은 실브라우저 관문(§8)이 본다.
//   jsdom 은 IntersectionObserver 를 구현하지 않아 여기서 대신할 수 없다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_IMPRESSION,
  IO_THRESHOLDS,
  impressionKey,
  isImpressionTarget,
  meetsArea,
} from '../src/impression/core.js';

/** IntersectionObserverEntry 중 meetsArea 가 쓰는 네 값만 만든다. */
const entry = ({ ratio, box, seen, root = { width: 1000, height: 800 } }) => ({
  intersectionRatio: ratio,
  boundingClientRect: box,
  intersectionRect: seen,
  rootBounds: root,
});

const OPT = DEFAULT_IMPRESSION;

// ── 합의한 기본값 ───────────────────────────────────────────────────────────

test('기본값이 Amplitude 앵커와 같다', () => {
  assert.equal(OPT.areaRatio, 1, '면적 100%');
  assert.equal(OPT.durationMs, 150, '시간 150ms');
});

test('문턱 목록에 1.0 말고도 낮은 값이 있다', () => {
  // [1.0] 하나만 주면 화면보다 큰 요소에서 콜백이 아예 오지 않아 예외 판정을 할 수 없다.
  assert.ok(IO_THRESHOLDS.includes(1));
  assert.ok(IO_THRESHOLDS.some((t) => t > 0 && t < 1), '중간 문턱이 있어야 한다');
});

// ── 면적 판정 ───────────────────────────────────────────────────────────────

test('요소 전체가 보이면 인정한다', () => {
  const e = entry({ ratio: 1, box: { width: 300, height: 200 }, seen: { width: 300, height: 200 } });
  assert.equal(meetsArea(e, OPT), true);
});

test('전부 보이는데 비율이 0.9999… 로 오는 경우도 인정한다', () => {
  const e = entry({
    ratio: 0.99999995,
    box: { width: 300, height: 200 },
    seen: { width: 300, height: 200 },
  });
  assert.equal(meetsArea(e, OPT), true, '부동소수 오차로 노출을 잃으면 안 된다');
});

test('일부만 보이면 인정하지 않는다', () => {
  const e = entry({ ratio: 0.9, box: { width: 300, height: 200 }, seen: { width: 300, height: 180 } });
  assert.equal(meetsArea(e, OPT), false);
});

test('화면보다 큰 요소 — 화면을 절반 넘게 덮으면 인정한다', () => {
  // 세로가 화면(800)보다 긴 상세 영역. 비율은 영원히 1.0 이 될 수 없다.
  const e = entry({
    ratio: 0.4,
    box: { width: 1000, height: 2000 },
    seen: { width: 1000, height: 800 },
  });
  assert.equal(meetsArea(e, OPT), true, '이 예외가 없으면 한 건도 안 잡힌다');
});

test('화면보다 큰 요소라도 조금만 걸치면 인정하지 않는다', () => {
  const e = entry({
    ratio: 0.05,
    box: { width: 1000, height: 2000 },
    seen: { width: 1000, height: 100 }, // 화면의 12.5%
  });
  assert.equal(meetsArea(e, OPT), false);
});

test('예외는 화면보다 큰 요소에만 쓴다', () => {
  // 화면의 60% 를 덮지만 요소 자체는 화면보다 작다 → 100% 기준을 그대로 적용한다.
  // 이 문이 없으면 예외가 일반 요소로 새어 기준이 사실상 50% 가 된다.
  const e = entry({
    ratio: 0.6,
    box: { width: 900, height: 800 },
    seen: { width: 900, height: 540 },
  });
  assert.equal(meetsArea(e, OPT), false);
});

test('rootBounds 가 없으면 예외를 쓰지 않는다', () => {
  const e = entry({
    ratio: 0.4,
    box: { width: 1000, height: 2000 },
    seen: { width: 1000, height: 800 },
    root: null,
  });
  assert.equal(meetsArea(e, OPT), false, '판정 근거가 없으면 세지 않는다');
});

test('기준을 낮추면 그대로 따른다', () => {
  const e = entry({ ratio: 0.5, box: { width: 300, height: 200 }, seen: { width: 300, height: 100 } });
  assert.equal(meetsArea(e, OPT), false);
  assert.equal(meetsArea(e, { ...OPT, areaRatio: 0.5 }), true);
});

// ── 관찰 대상 ───────────────────────────────────────────────────────────────

test('object 만 본다 — control·input 은 보지 않는다', () => {
  assert.equal(isImpressionTarget({ kind: 'object', impressionOff: false }), true);
  assert.equal(isImpressionTarget({ kind: 'control', impressionOff: false }), false);
  assert.equal(isImpressionTarget({ kind: 'input', impressionOff: false }), false);
});

test('미선언 요소는 보지 않는다 (8/6 결정)', () => {
  assert.equal(isImpressionTarget({ kind: null, impressionOff: false }), false);
  assert.equal(isImpressionTarget(null), false);
});

test('data-ade-impression="off" 는 그 요소 하나를 끈다', () => {
  assert.equal(isImpressionTarget({ kind: 'object', impressionOff: true }), false);
});

// ── 재발화 열쇠 ─────────────────────────────────────────────────────────────

test('같은 선언·같은 업무ID 는 같은 열쇠다 — 다시 그려도 안 센다', () => {
  const a = { name: 'ade_0123456789ab', identity: { item_id: '7' } };
  const b = { name: 'ade_0123456789ab', identity: { item_id: '7' } };
  assert.equal(impressionKey(a), impressionKey(b));
});

test('업무ID 가 다르면 다른 열쇠다 — 목록 100건이 100건으로 센다', () => {
  const a = { name: 'ade_0123456789ab', identity: { item_id: '7' } };
  const b = { name: 'ade_0123456789ab', identity: { item_id: '8' } };
  assert.notEqual(impressionKey(a), impressionKey(b));
});

test('업무ID 키 순서가 달라도 같은 열쇠다', () => {
  const a = { name: 'ade_0123456789ab', identity: { b_id: '2', a_id: '1' } };
  const b = { name: 'ade_0123456789ab', identity: { a_id: '1', b_id: '2' } };
  assert.equal(impressionKey(a), impressionKey(b));
});

test('업무ID 가 없어도 identity-static 이면 이름만으로 센다 — 화면에 하나뿐인 배너', () => {
  assert.equal(impressionKey({ name: 'ade_0123456789ab', identity: {}, identityStatic: true }), 'ade_0123456789ab');
});

test('업무ID 가 없고 static 도 아니면 열쇠를 만들지 않는다 — 빈 값과 같은 문제다', () => {
  // data-ade-id-key 를 빠뜨린 상품 카드 100장(ADE-507)이 이름 하나로 뭉치면 첫 장만 세고 99장을 버린다.
  // 빈 값(아래)과 똑같이 요소 단위로 세도록 넘긴다.
  assert.equal(impressionKey({ name: 'ade_0123456789ab', identity: {}, identityStatic: false }), null);
  assert.equal(impressionKey({ name: 'ade_0123456789ab', identity: {} }), null);
});

test('업무ID 값이 비면 열쇠를 만들지 않는다 (R1)', () => {
  // 목록 100건이 전부 빈 값이면 한 열쇠로 뭉쳐 1건만 세게 되고,
  // 그러면 전환율의 분모가 100분의 1로 줄어든다. 요소 단위로 세도록 넘긴다.
  assert.equal(impressionKey({ name: 'ade_0123456789ab', identity: { item_id: '' } }), null);
});

test('이름이 없으면 열쇠를 만들지 않는다', () => {
  assert.equal(impressionKey({ name: '', identity: {} }), null);
  assert.equal(impressionKey(null), null);
});
