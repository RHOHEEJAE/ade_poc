// node --test tests/unit/fixed-attrs.test.mjs
//   @adestack/contract 의 FIXED_ATTRS 와 코어 src/index.ts 의 capture_extra_attrs 가
//   한 목록인지 본다. 두 파일에 걸친 검사다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('고정 속성 목록이 단일 출처다', async () => {
  // 예전에는 contract.ts 의 STRUCTURAL 과 index.ts 의 capture_extra_attrs 에
  // 같은 이름을 각각 적어 두었다. 한쪽만 고쳐도 시험이 전부 통과했다.
  const { FIXED_ATTRS } = await import('@adestack/contract');
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8'),
  );

  assert.match(
    src,
    /capture_extra_attrs:\s*\[\.\.\.FIXED_ATTRS\]/,
    'index.ts 가 목록을 다시 적으면 안 된다 — FIXED_ATTRS 를 펼쳐 쓴다',
  );
  assert.ok(FIXED_ATTRS.length >= 10);
  assert.ok(FIXED_ATTRS.every((a) => a.startsWith('data-ade-')));
});

