// build-fixture.mjs — fixture/app.js 를 브라우저가 바로 실행할 수 있게 한 파일로 묶는다.
//
//   @adestack/sdk 와 Amplitude 패키지가 bare specifier 로 서로를 import 해서,
//   묶지 않으면 브라우저가 경로를 못 찾는다.
//   @adestack/sdk 는 루트 package.json 의 name 이라 Node self-reference 로 루트 dist/ 에 닿고,
//   @adestack/extensions 는 루트 devDependency(workspace) 로 닿는다. 둘 다 배포되는 빌드 결과물이다.

import { build } from 'esbuild';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/**
 * fixture 진입 파일 하나를 묶는다.
 * @param {string} entry fixture/ 아래 파일 이름.
 * @param {Record<string, string>} env SDK 가 읽을 import.meta.env. 브라우저엔 없으니 여기서 박는다.
 * @param {string} [out] 결과 파일 이름. 같은 진입 파일을 env 만 다르게 두 번 묶을 때 준다.
 */
const bundle = (entry, env, out = entry) =>
  build({
    entryPoints: [path.join(ROOT, 'fixture', entry)],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outfile: path.join(ROOT, 'fixture', 'dist', out),
    sourcemap: true,
    logLevel: 'info',
    define: { 'import.meta.env': JSON.stringify(env) },
  });

await bundle('app.js', {});
// SDK 를 끈 환경(DA-197). 같은 SDK 를 env 만 다르게 묶는다 — isolation 시험이 /off.html 로 연다.
await bundle('off.js', { VITE_ADE_MIXPANEL: '0' });
// apiHost 를 안 넘긴 서비스(DA-238). 같은 진입 파일을 env 만 다르게 두 번 묶는다 — api-host 시험이 연다.
await bundle('default-host.js', {});
await bundle('default-host.js', { VITE_ADE_API_HOST: '/ade-collect' }, 'env-host.js');
