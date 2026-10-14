// default-host.js — apiHost 를 안 넘기는 서비스를 재현한다(DA-238).
//
//   build-fixture.mjs 가 이 파일을 두 번 묶는다.
//     dist/default-host.js  env {}                                → DEFAULT_API_HOST(우리 수집 서버)로 나가야 한다
//     dist/env-host.js      env { VITE_ADE_API_HOST: '/ade-collect' } → 환경변수가 기본값보다 앞선다
//   app.js 는 apiHost 옵션을 명시하므로 옵션 > 환경변수 > 기본값의 첫 칸은 거기서 확인된다.

import mixpanel from 'mixpanel-browser';
import { adesdk } from '@adestack/sdk';

window.__verify = { flush: () => mixpanel.ade?.request_batchers?.events?.flush() };

adesdk.init({ token: 'verify-token' });
