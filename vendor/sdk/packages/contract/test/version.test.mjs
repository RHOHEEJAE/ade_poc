// node --test packages/contract/test/version.test.mjs
//
//   인계 계약 §1-3 의 호환 규칙(npm `^`)을 고정한다. dist 를 import 해 실제 함수를 부른다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isCompatibleVersion } from '../dist/index.js';

test('1.x 대 — major 가 벽. minor · patch 는 실제가 낮지만 않으면 된다', () => {
  assert.equal(isCompatibleVersion('1.2.0', '1.2.0'), true);
  assert.equal(isCompatibleVersion('1.2.0', '1.3.0'), true);
  assert.equal(isCompatibleVersion('1.2.0', '1.2.5'), true);
  assert.equal(isCompatibleVersion('1.2.0', '1.0.0'), false); // 실제가 기대보다 낮다
  assert.equal(isCompatibleVersion('1.2.0', '2.0.0'), false); // 벽이 다르다
});

test('0.x 대 — minor 가 벽', () => {
  assert.equal(isCompatibleVersion('0.1.0', '0.1.0'), true);
  assert.equal(isCompatibleVersion('0.1.0', '0.1.9'), true);
  assert.equal(isCompatibleVersion('0.1.3', '0.1.2'), false);
  assert.equal(isCompatibleVersion('0.1.0', '0.2.0'), false);
  assert.equal(isCompatibleVersion('0.1.0', '1.1.0'), false);
});

test('0.0.x 대 — patch 가 벽. 정확히 같아야 한다', () => {
  assert.equal(isCompatibleVersion('0.0.3', '0.0.3'), true);
  assert.equal(isCompatibleVersion('0.0.3', '0.0.4'), false);
  assert.equal(isCompatibleVersion('0.0.0', '0.0.0'), true);
});

test('뒤에 붙은 식별자는 버리고, 읽을 수 없는 값은 호환으로 치지 않는다', () => {
  assert.equal(isCompatibleVersion('0.1.0', 'v0.1.2-beta.1'), true);
  assert.equal(isCompatibleVersion('0.1.0', '0.0.0-local-stub'), false);
  assert.equal(isCompatibleVersion('', '0.1.0'), false);
  assert.equal(isCompatibleVersion('0.1.0', undefined), false);
  assert.equal(isCompatibleVersion('abc', '0.1.0'), false);
});
