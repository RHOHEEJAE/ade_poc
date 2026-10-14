// 개발명세 §0 · §8-1 — 벤더 버전이 네 곳에서 같은 값인지 대조한다.
//   하나라도 어긋나면 관문이 무엇을 검사했는지 알 수 없어진다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
/**
 * 레포 루트 기준 경로의 JSON 파일을 읽는다.
 * @param {string} p 루트 기준 상대 경로.
 * @returns {any} 파싱한 객체. 없거나 깨졌으면 던진다 — 검사기는 그 자체로 실패해야 한다.
 */
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const declared = read('package.json').dependencies['mixpanel-browser'];

//   pnpm-lock.yaml 에 `mixpanel-browser@<버전>:` 줄이 있다.
//   YAML 파서를 들이지 않는다 — 볼 것이 이 한 줄뿐인데 의존성을 늘리면
//   검사기가 검사 대상보다 복잡해진다.
//
//   주의: 같은 줄이 **두 번** 나온다. pnpm 은 packages 절(무엇을 받았나)과
//      snapshots 절(무엇에 연결했나)에 같은 키를 각각 적는다. 중복을 지운 뒤
//      값이 하나로 모이는지를 본다 — 둘이 다르면 그것이야말로 잡아야 할 상태다.
const lockText = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
const lockHits = [...new Set(
  [...lockText.matchAll(/^ {2}mixpanel-browser@(\S+):$/gm)].map((m) => m[1]),
)];
const lock = lockHits.length === 1 ? lockHits[0] : null;

//   루트 package.json 이 곧 @adestack/sdk 라(DA-193) 설치본도 루트 node_modules 에 있다.
const installedAt = 'node_modules/mixpanel-browser/package.json';
const installed = fs.existsSync(path.join(root, installedAt)) ? read(installedAt).version : null;

const src = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');
const libVersion = /const LIB_VERSION = '([^']+)'/.exec(src)?.[1];

const rows = [
  ['package.json 의존성', declared],
  ['lock 파일', lock],
  ['실제 설치본', installed],
  ['lib_version', libVersion],
];
for (const [k, v] of rows) console.log(`  ${k.padEnd(22)} ${v ?? '(없음)'}`);

const errors = [];
if (/[\^~]/.test(declared ?? '')) errors.push(`캐럿·틸드가 있다: ${declared}`);
if (lockHits.length > 1) errors.push(`lock 에 버전이 여럿이다: ${lockHits.join(', ')}`);
const values = rows.map(([, v]) => v);
if (new Set(values).size !== 1) errors.push('네 곳의 값이 다르다');
if (values.some((v) => !v)) errors.push('읽지 못한 값이 있다');

//   A안(DA-279) — 코어가 벤더 대기열의 전송 함수 `request_batchers.events.flush()` 를 부른다. 공개 API 가
//   아니라 벤더 버전을 올리면 사라질 수 있다. 번들러가 읽는 빌드(`module`)에 그 자리가 있는지 본다.
const vendorModule = 'node_modules/mixpanel-browser/dist/mixpanel.module.js';
const vendorSrc = fs.existsSync(path.join(root, vendorModule)) ? fs.readFileSync(path.join(root, vendorModule), 'utf8') : '';
const flushHooks = [
  ['request_batchers.events 대입', /this\.request_batchers\s*=\s*\{\s*events:/],
  ['RequestBatcher.prototype.flush', /RequestBatcher\.prototype\.flush\s*=\s*function/],
];
for (const [what, re] of flushHooks) {
  const ok = re.test(vendorSrc);
  console.log(`  ${what.padEnd(30)} ${ok ? '있음' : '(없음)'}`);
  if (!ok) errors.push(`벤더 대기열 전송 자리가 없다: ${what} — src/index.ts flushQueue 를 다시 본다`);
}

//   DA-279 — 벤더 remove_group 결함(키 자리에 글자 `group_key` 를 register 하고 목록을 못 줄인다) 때문에 adesdk.remove_group 은
//   벤더 함수를 부르지 않고 공개 함수로 같은 일을 한다. 벤더가 고치면 이 줄이 사라진다 — 그때 관문을 멈춰 사람이 되돌리게 한다.
const removeGroupBug = 'this.register({group_key: old_value});';
const bugPresent = vendorSrc.includes(removeGroupBug);
console.log(`  ${'remove_group 결함 줄'.padEnd(30)} ${bugPresent ? '있음' : '(없음)'}`);
if (!bugPresent) {
  errors.push(
    `벤더 remove_group 결함 줄(${removeGroupBug})이 사라졌다 — 벤더가 고쳤으면 src/index.ts 의 adesdk.remove_group 을 ` +
      '벤더 inst.remove_group 호출로 되돌리고 이 검사를 지운다(compat.spec 의 add_group · remove_group 시험으로 확인)',
  );
}

if (errors.length) {
  console.error('\n버전 고정 검사 실패');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`\n버전 고정 OK — ${declared}`);
