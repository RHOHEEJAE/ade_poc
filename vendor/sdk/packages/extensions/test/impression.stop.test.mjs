// node --test packages/extensions/test/impression.stop.test.mjs
//
//   DOM 이 아직 안 만들어진 채(readyState 'loading') 세운 노출 관찰자를 stop() 하면, 뒤늦게 오는
//   DOMContentLoaded 가 그 관찰자를 다시 켜면 안 된다 — SPA 가 로드 중에 adesdk.init 을 두 번 부르면
//   멈춘 관찰자와 새 관찰자가 같은 카드에 노출을 두 건씩 낸다.
//   index.ts 는 window · document · IntersectionObserver 를 쓰므로 최소 가짜를 세우고 dist 를 읽는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** observe · disconnect 횟수만 센다. 콜백은 부르지 않는다 */
class FakeIO {
  static observed = 0;
  static disconnected = 0;
  observe() { FakeIO.observed += 1; }
  unobserve() {}
  disconnect() { FakeIO.disconnected += 1; }
}
const docListeners = new Map();
const card = { matches: () => true, querySelectorAll: () => [] };
globalThis.window = {};
globalThis.IntersectionObserver = FakeIO;
globalThis.document = {
  readyState: 'loading',
  body: {},
  addEventListener: (type, fn) => docListeners.set(type, fn),
  removeEventListener: (type) => docListeners.delete(type),
  querySelectorAll: () => [card],
  visibilityState: 'visible',
};

const { startImpressionObserver } = await import('../dist/index.js');

test('loading 중에 stop() 한 관찰자는 DOMContentLoaded 가 와도 켜지지 않는다', () => {
  const h = startImpressionObserver({ emit() {} });
  assert.equal(FakeIO.observed, 0, 'DOM 준비 전에는 아무것도 붙이지 않는다');
  assert.ok(docListeners.has('DOMContentLoaded'), 'DOMContentLoaded 를 기다린다');

  h.stop();
  docListeners.get('DOMContentLoaded')?.();

  assert.equal(FakeIO.observed, 0, '멈춘 관찰자가 DOMContentLoaded 로 되살아나 observe 를 불렀다');
  assert.equal(docListeners.has('visibilitychange'), false, '멈춘 관찰자가 탭 전환 리스너를 걸었다');
});
