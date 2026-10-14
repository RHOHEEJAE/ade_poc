# ADE 행동 수집 SDK

Mixpanel JavaScript SDK 위에 ADE 계약을 얹은 수집 SDK다. **벤더 소스는 한 줄도 고치지 않는다.**

- **개발명세**: `2607_tracking-plan` / `40-제품/PRD-1/개발명세/02-상세/01_SDK-구현-계약.md`
- **상위 계약**: 같은 저장소의 `01-상세/03_SDK-인계-계약.md` (선언을 읽는 규칙)

## 구성

```
.                 @adestack/sdk — 루트가 곧 SDK (mixpanel-js 처럼 src/ 가 루트에 있다)
├── src/
│   ├── index.ts        코어 — init · 훅 · 진단. 벤더를 import 하는 유일한 파일. 확장에 track 을 넘기고 init 을 부른다
│   ├── module.ts       확장이 코어에서 받는 것(ExtensionContext)과 돌려주는 것(Extension)의 정의
│   └── (직접 결과 adesdk.track 은 index.ts 의 mountEntry — 벤더 track() 을 한 번 감싼 것, DA-201)
├── packages/           ── 벤더에 없어서 따로 둔 것. 코어를 모르고 코어가 넘기는 track · report 만 쓴다 ──
│   ├── extensions/     @adestack/extensions — 벤더에 없는 기능 셋을 한 패키지로(DA-220). 서비스가 extensions 로 붙인다
│   │   ├── impression/   노출. 자기 이벤트($ade_impression)를 보낸다
│   │   ├── session/      세션 · 탭 · 순번. 모든 이벤트에 세 값을 더한다(stamp). 무활동 전환은 $ade_session_change
│   │   └── system/       통신 결과($ade_network) · 웹 성능($ade_web_vital). PerformanceObserver 로 읽기만 한다
│   ├── contract/       @adestack/contract — 선언 읽기 · 민감 요소 판정. 코드젠의 @adestack/core/contract 로 교체될 자리
│   └── name/           @adestack/name — 벤더 이름을 우리 이름으로 바꾸는 단일 규칙 (§1.1). 중계 서버가 같이 쓴다
│
└── tests/              ── 시험. mixpanel-js 의 tests/unit · tests/browser 와 같은 나눔. 패키지가 아니다 ──
    ├── unit/           코어 단위 시험 (Node)
    └── browser/        Playwright — 노출 관문 · Amplitude 동등성 · 장애 격리. dist 를 self-reference 로 읽는다
        ├── fixture/    노출 케이스 6개가 있는 시험 페이지
        └── specs/      시험 파일
```

**우리 SDK 는 Mixpanel SDK 다.** 루트가 곧 `@adestack/sdk` 이고, 이걸 설치하면 Mixpanel 기반 코어(자동수집 + 직접 결과)가 동작한다. **벤더가 주는 기능은 다시 만들지 않는다. 벤더에 없고 필요가 확인된 기능만 `packages/` 의 확장으로 두고**, 서비스가 붙인다(DA-193):

```js
import { adesdk } from '@adestack/sdk';
import { impression, session, system } from '@adestack/extensions';

adesdk.init({ extensions: [impression(), session(), system()] });
// apiHost 는 안 넘기면 우리 수집 서버(DEFAULT_API_HOST)다. 스테이징 · 자기 도메인 프록시일 때만 넘긴다
// 앱 · 빌드 식별자는 코드젠 빌드 플러그인이 번들 전역 __ADE_BUILD__ 에 박는다(DA-136). SDK 는 이벤트마다 읽는다
```

코어는 `mixpanel-core.js` 가 `new Autocapture(this)` 하듯 확장에 `track` · `report` 만 넘기고 `init` 을 부른다(`src/module.ts`). 확장은 두 종류다 — **자기 이벤트를 보내는 것**(impression, `ctx.track`)과 **모든 이벤트에 필드를 더하는 것**(session, 돌려준 `stamp` 를 코어의 `before_track` 이 이벤트마다 부른다). 그래서 확장 init 은 벤더 init **앞**이다 — 첫 페이지뷰가 벤더 init 안에서 나가서, stamp 가 그 한 건에도 돌아야 한다(DA-180 · DA-202). 확장은 코어 내부도 벤더도 모른다 — 코어를 import 하지 않고 같은 모양의 타입을 자기 안에 선언한다. 그래서 벤더 버전을 올릴 때 볼 곳이 `src/index.ts` 하나로 남고, 확장 하나를 빼거나 바꿔도 나머지가 안 흔들린다.

**벤더에 없어서 우리가 만든 것은 전부 `packages/` 다.** 노출(impression) · 세션 · 탭 · 순번과 무활동 전환(session) · 통신 결과 · 웹 성능(system) — 셋 다 같은 확장 모양이고 파일럿이 항상 같이 붙여서 `@adestack/extensions` 하나다(DA-220). 코어에는 없다. 한때 코어에서 뺐던 것들(DA-193 · DA-199)을 기능정의서 02 가 요구해 확장 패키지로 되살렸다(DA-202 · DA-206). 세션 전환은 세션이 갈리는 걸 아는 session 이 낸다.

**시험은 `tests/` 에만 둔다.** `src/` 에는 운영 코드만 있다. mixpanel-js 처럼 `tests/unit/`(Node) · `tests/browser/`(Playwright)
폴더 둘로 나누고, 시험 도구는 루트 devDependencies 에 둔다 — 시험은 패키지가 아니다(DA-194). `tests/browser/` 는
`@adestack/sdk` 와 `@adestack/extensions` 의 **빌드 결과물(`dist/`)** 을 패키지 이름으로 import 해(루트는 Node 의
self-reference, impression 은 workspace devDependency) 실제 서비스가 쓰는 모양 그대로 크롬 · 파이어폭스 · WebKit 에서 돌린다.
`packages/` 는 npm 으로 나가는 것만 둔다. `verify` 라는 이름은 `pnpm verify`(타입 + 단위 시험 + 버전 고정)에만 쓴다.

impression 의 `core.js` 를 `.js` 로 둔 것은 **시험이 빌드 없이 구현 파일을 그대로 읽게** 하기 위해서다.
규칙을 시험 파일에 옮겨 적으면 사본이 둘이 되고, 구현이 바뀌어도 시험은 통과한다 —
`contract.ts` 가 실제로 그 상태여서 무한 재귀가 시험 41건 통과 상태로 살아남았다.
`packages/contract/test/contract.test.mjs` 는 그래서 `dist/` 를 import 해 **실제 함수**를 부른다.

**npm 으로 나가는 것은 넷이다** — `@adestack/sdk`(루트) · `name` · `contract` · `impression`. `sdk` 가 `name` · `contract` 를, `impression` 이 `contract` 를 의존성으로 걸고 있어 CI 는 `packages/` 셋을 의존 순서대로 올린 뒤 루트를 올린다. `name` 이 별도인 이유는 중계 서버(collector)가 같은 규칙을 import 해야 해서고, `contract` 가 별도인 이유는 코드젠이 배포할 패키지로 교체될 자리라서다.

중계 서버(엔드포인트 + 원시 적재)는 **이 저장소가 아니라 `apps/adestack/collector` 에 있다**(§13.1).
저장소가 셋(`codegen` · `sdk` · `collector`)으로 나뉘어 파일을 직접 공유할 수 없기 때문에,
`name` 모듈을 패키지로 배포해서 양쪽이 받아 쓴다.

## 개입 지점은 네 곳뿐이다

| 훅 | 언제 | 무엇을 |
|---|---|---|
| `hooks.before_track` | 이벤트 생성 시점 | 세 축 · 판정 · 앱 식별을 붙이고 확장의 `stamp` 를 부른다 |
| `hooks.before_send_events` | 전송 직전 | 이름을 우리 것으로 바꾼다 |
| `autocapture.block_element_callback` | props 조립 이전 | 계약 함수를 부르는 유일한 자리 |
| 중계 서버 ingest | 수신 직후 | 이름 계약의 authority |

이 넷 밖의 개입(런타임 몽키패치·번들 후처리)은 금지다.

## 개발 환경

| 항목 | 값 |
|---|---|
| 패키지 매니저 | pnpm 12.3.4 — `packageManager` 로 고정하고 Corepack 으로 켠다 |
| Node.js | 24 LTS (`engines.node: >=24`) |
| TypeScript | 7 계열 |

`corepack enable` 은 한 번만 하면 된다. Windows 에서 권한 오류가 나면 관리자 터미널에서
한 번 실행하거나 `corepack pnpm <명령>` 으로 대신한다.

## 명령

```bash
pnpm install
pnpm test          # 단위 시험 (Node) — junit.xml 도 낸다
pnpm typecheck
pnpm verify        # 타입 + 단위 시험 + 버전 고정 검사
pnpm build         # dist 생성
pnpm browsers:install  # Playwright 브라우저 3종. 처음 한 번
pnpm test:e2e          # 실브라우저 시험 3종 (Playwright). 먼저 pnpm build
pnpm test:chromium     # 크롬만. 빠르게 볼 때
pnpm test:headed       # 크롬 창을 띄워 눈으로 본다
pnpm test:report       # 지난 브라우저 시험의 HTML 보고서
```

**시험 결과는 도구가 낸다.** 단위 시험은 Node 러너의 JUnit 리포터, 브라우저 시험은 Playwright 의
JUnit·HTML 리포터가 낸다. CI 가 JUnit 을 GitLab 시험 보고로 올려 MR 화면에 뜬다.
손으로 정리한 결과 문서는 두지 않는다.

**회사 Windows PC 에서는 파이어폭스 · WebKit 이 안 뜰 수 있다.** Application Control 정책이
Playwright 가 받은 `firefox.exe` · `Playwright.exe` 실행을 막으면 그 16건이 `spawn UNKNOWN` 으로
0ms 에 실패한다 — 시험이 깨진 게 아니라 브라우저가 못 뜬 것이다. 로컬은 `pnpm test:chromium` 으로
보고, 3종 판정은 CI 의 `browser` 잡(Linux 이미지)에 맡긴다.

## 벤더 버전

`mixpanel-browser` 를 **정확 고정**한다(캐럿·틸드 금지). 캐럿을 쓰면 `pnpm install` 만으로
벤더가 바뀌어 관문이 무엇을 검사했는지 알 수 없어진다.

`pnpm verify` 가 네 곳을 대조한다 — `package.json` · lock · 실제 설치본 · `lib_version`.

### 벤더 올리는 절차

벤더 올리기는 **별건 티켓**으로 한다(DA-175 댓글에서 정한 규칙: "올릴 때는 검증과 함께 별건으로").
브랜치는 `chore/DA-<n>`. 올릴 버전이 있는지는 `pnpm view mixpanel-browser version` 으로 본다.
정확 고정이 관문 전제라 "최신이 나왔다"는 이유만으로는 올리지 않는다 — DA-175 때 최신이 2.83.0 이었지만
그대로 두기로 했다. 아래는 2.82.1 → 2.82.2 를 예로 든 것이다.

1. **숫자 두 곳.** 의존성과 `lib_version` 을 같이 바꾼다.

   ```bash
   pnpm --filter @adestack/sdk add mixpanel-browser@2.82.2 --save-exact
   ```

   `package.json` 과 `pnpm-lock.yaml` 이 같이 바뀐다. 그리고 `src/index.ts` 의
   `const LIB_VERSION = '2.82.1'` 을 손으로 `'2.82.2'` 로 고친다.

2. **관문.** 네 곳 대조 + 타입 검사 + 단위 시험.

   ```bash
   pnpm verify
   ```

   `LIB_VERSION` 을 안 고쳤으면 여기서 바로 잡힌다.

3. **실브라우저 시험.** 벤더 내부 동작에 기대는 곳이 바뀌었는지 본다.

   ```bash
   pnpm test:chromium
   ```

   로컬은 크롬, MR 을 올리면 CI `browser` 잡이 3 브라우저로 돈다. 깨지면 이 넷 중 하나가 바뀐 것이다.

   | 시험 | 벤더가 바꿨을 가능성 |
   |---|---|
   | `common-fields.spec` 첫 페이지뷰 | `init()` 안에서 페이지뷰를 쏘는 순서 |
   | `click.spec` 실제 클릭 | `block_element_callback` 과 `track()` 호출 순서 |
   | collector `retry.spec` | 재시도 간격 · 413 처리 · `Retry-After` 읽기 |
   | (DA-144, 아직 없음) | 이벤트 · 속성 이름 목록 |

4. **벤더 줄 번호 주석.** 코드 주석에 `(request-batcher.js 169)` 처럼 벤더 줄 번호가 적혀 있다.
   올린 뒤 그 줄이 여전히 같은 코드인지 한 번 훑고, MR 설명에 "바뀐 것 없음" 또는 "이것이 바뀜"을 적는다.

5. **collector 도 맞춘다.** `apps/adestack/collector` 의 devDependencies 에 있는 `mixpanel-browser` 도
   같은 버전으로 올린다. DA-141 시험이 그것을 쓴다.

## 서비스팀이 쓰는 법

`.npmrc` 에 그룹 레지스트리를 지정한 뒤 설치한다.

```
@adestack:registry=https://gitlab.hectoai.co.kr/api/v4/groups/<그룹ID>/-/packages/npm/
```

```bash
npm i @adestack/sdk
```

```ts
import { adesdk } from '@adestack/sdk';

adesdk.init({
  // apiHost 를 안 넘기면 우리 수집 서버(https://ade-collector.vercel.app)로 간다.
  // 우선순위: apiHost 옵션 > VITE_ADE_API_HOST > 기본값. 스테이징이나 자기 도메인 프록시일 때만 넘긴다.
  // applicationId · buildId 는 넘기지 않는다 — 코드젠 빌드 플러그인이 globalThis.__ADE_BUILD__ 에
  // { applicationId, buildId, ruleVersion } 을 박고(DA-136), SDK 가 이벤트를 만드는 시점에 읽는다
  // (인계 계약 R6). 플러그인 없는 빌드(데모 · 시험)에서만 대체값으로 넘긴다.
});
```

모든 이벤트에 `application_id` · `build_id` · `contract_version`(계약 패키지) 이 실리고, `rule_version` 은 코드젠 플러그인이 번들에 박았을 때만 실린다.
`rule_version` 과 `contract_version` 을 맞춰 보는 함수 `isCompatibleVersion` 은 `@adestack/contract` 에 있다
(인계 계약 §1-3). SDK 안에서의 검사 · 진단은 진단 `kind` 가 셋으로 고정이라 아직 붙이지 않았다.

### 업무 결과 (adesdk.track)

결제 완료 같은 업무 결과는 `adesdk.track({ properties })` 로 보낸다. 이벤트 이름은 FE 가 쓰지 않는다 — 코드젠 빌드가 `name`(`ade_` + 16진수 12자)을 심는다(결정 2026-09-04-02).

```ts
adesdk.track({ properties: { order_id: 'o-1', amount: 1200 } });
// 빌드 뒤: adesdk.track({ name: 'ade_3f2a91c4d5e6', properties: { ... } })
```

**배포 순서.** 코드젠이 `adesdk.track(` 에 이름을 심는 버전과 함께 배포한다 — 코드젠이 이름을 심지 않으면 SDK 가 그 호출을 버린다.
`adesdk.track('Purchase', { ... })` 처럼 첫 인자가 문자열인 Mixpanel 모양은 보내지 않고 진단(`track_name_argument`)만 남긴다.

### 로그인 · 로그아웃 (DA-279)

로그인 성공 직후와 로그아웃 직전에 한 줄씩 부른다. Mixpanel 과 같은 모양이고, `adesdk.track` 처럼 전역 입구라 import 가 필요 없다.

```ts
window.adesdk.identify(res.memberNo); // 로그인 성공 직후 — 회원번호 같은 내부 ID
window.adesdk.set_group('company', 'hecto'); // 소속 회사 같은 그룹 — 이후 모든 기록에 실린다
window.adesdk.reset();                // 로그아웃 직전 — 서버 로그아웃 요청보다 먼저
```

번들을 쓰는 곳은 `import { adesdk } from '@adestack/sdk'` 로 같은 객체를 쓸 수 있다.

**이름이 `ade` 가 아니라 `adesdk` 인 까닭.** 코드젠 VS Code 확장이 `ade.` 를 자동완성 트리거로 쓴다(codegen
`packages/core/src/position.ts` 의 `DEFAULT_TRIGGER`). 전역을 `ade` 로 하면 FE 가 `ade.identify` 를 칠 때 코드젠
목록이 끼어들고, `ade.o` 에서 업무 결과 항목을 확정하면 `ade.` 가 `adesdk.track(...)` 으로 바뀐다. 코드젠 코드는
다른 담당 영역이라 고치지 않고 SDK 이름을 `adesdk` 로 했다 — `adesdk.` 에는 `ade.` 글자가 없다. 규칙은 하나다:
Mixpanel 문서의 `mixpanel.xxx()` → `adesdk.xxx()`. 서버로 가는 이벤트 · 속성 이름은 여전히 `$ade_*` 다.

- 사용자 ID 는 빈 문자열 · 공백만 있는 값, 255자 넘는 값, `@` 가 든 값(이메일), `$device:` 로 시작하는 값은 받지 않고 진단만 남긴다.
- 로그인 전에 쌓인 기록은 익명 기기 ID 로, 로그인 뒤 기록은 사용자 ID 로 나간다. `$ade_login` · `$ade_logout` 은 SDK 가 보낸다.
- `adesdk.reset()` 은 Mixpanel `reset()` 과 달리 기기 ID · 유입 정보를 지우지 않는다 — 사용자 ID 만 지우고 세션을 새로 시작한다. 로그인하지 않은 상태면 기록 · 세션 전환 없이 그룹과 공통 속성만 지운다.
- `adesdk.set_group(key, ids)` 는 Mixpanel 과 같다: 이후 모든 기록에 `key: [ids]` 가 실린다. `adesdk.reset()` 이 지운다. 사용자 프로필(`/engage`)로도 가지만 수집 서버는 아직 반영하지 않는다.
- 사용자 속성(`people.set`)은 아직 없다 — 별도 작업.
- 세션 확장(`session()`)을 붙였으면 `identify` · `reset` 때 세션이 새로 시작된다. 새로고침마다 다시 부를 필요는 없다.

### Mixpanel 문서의 입구 (DA-279 §10)

Mixpanel JS 문서의 `mixpanel.xxx()` 를 `adesdk.xxx()` 로 쓴다. 인자 모양은 벤더와 같고, 모두 던지지 않는다. init 전 호출은
버리고 진단 `identity_before_init` 한 번, SDK 를 끈 환경 · 벤더 init 실패에서는 받아서 버린다(`has_opted_out_tracking()` 은 `false`).

```ts
adesdk.init({ apiHost: '/ade-collect' });            // 우리 모양 — 설정 객체 하나
adesdk.init('ade-demo-token', { api_host: '/ade-collect', debug: true }); // Mixpanel 모양도 받는다
adesdk.register({ plan: 'pro' });                    // 이후 모든 기록에. register_once · unregister 도 있다
adesdk.time_event('ade_3f2a91c4d5e6');               // 다음 같은 이름 기록에 $duration
adesdk.track_pageview({ page: 'pricing' });          // 자동수집 페이지뷰와 같은 기록 — 같은 주소면 두 건이 된다
adesdk.add_group('team', 'c');                       // remove_group 도 있다
adesdk.opt_out_tracking();                           // opt_in_tracking · has_opted_out_tracking
```

- 공통 속성의 키는 그룹 키와 같은 검사, 값은 직접 결과 값과 같은 검사를 받는다. 걸린 속성만 빠진다(진단 `register_dropped:<키>`).
  세운 키는 localStorage `ade.super_keys:<앱>` 에 적고 `adesdk.reset()` 이 그룹(`ade.group_keys:<앱>`)과 함께 지운다(로그인하지 않은 상태도).
  `<앱>` 은 벤더 보관소 이름과 같은 앱 식별값이다. `unregister` 는 목록에서 빼지 않는다 — 벤더가 한 벌만 지우므로 남은 벌을 `reset` 이 지운다.
- `track_pageview` 는 자동수집 페이지뷰와 같은 필드(`collection_source: auto`, 등급 없음)로 싣는다. 이름을 바꾸는 둘째 인자(`event_name`)는 받지 않는다.
- `remove_group` 은 벤더 함수를 부르지 않는다 — 2.82.1 의 벤더 `remove_group` 은 목록을 줄이지 못하고 `group_key` 속성을 남긴다(`mixpanel.cjs.js:29994`).
  문서의 동작을 벤더 공개 함수(`get_property` · `register` · `unregister` · `people.remove`)로 한다.
- `opt_out_tracking()` 은 벤더 기본값대로 보관소를 지운다. 같은 페이지 안에서 다시 동의하면 기기 ID 는 그대로다(벤더가 메모리 값을 다시 저장한다). 거부한 채 새로고침하면 보관소가 비어 있어 기기 ID 가 새로 생긴다(`mixpanel.cjs.js:28429` · `:28521`). 로그인 상태에서 거부하면 벤더가 프로필 삭제(`$delete`)를
  `/engage` 로 보내는데, 수집 서버는 아직 `/engage` 를 격리한다(DA-282). `opt_in_tracking()` 이 보내는 `$opt_in` 은 `$ade_login` 처럼
  `context/direct/guaranteed` 로 싣고, 이름 · 속성을 바꾸는 벤더 옵션(`track_event_name` · `track_properties` · `track`)은 받지 않는다.
- init 옵션: `debug`(벤더 `debug`), `optOutTrackingByDefault`(벤더 `opt_out_tracking_by_default`), `propertyBlacklist`(벤더 `property_blacklist`,
  벤더 이름 `$mp_*` 로 적는다). 식별 · 순서 필드와 SDK 필드(`distinct_id` · `$insert_id` · `time` · `token` · `$device_id` · `$user_id` ·
  `application_id` · `build_id` · `rule_version` · `contract_version` · 세 축 · `verdict` · `verdict_reason` · `ade_declaration` · `session_id` ·
  `tab_id` · `sequence_no` · 자동수집 판별자 `$mp_autocapture` · `$ade_autocapture`)는 목록에 있어도 빼고 넘긴다(진단 `blacklist_protected_key`).
- 공통 속성 · 그룹 · 수동 페이지뷰 속성의 키로 벤더가 주소에서 싣는 키(클릭 ID `gclid` · `fbclid` … 10개, 페이지 키 `current_url_path` 등 5개)는 쓸 수 없다 — 덮으면 유입 · 페이지 정보가 틀어진다.
- 수집 거부 입구(`opt_out_tracking` · `opt_in_tracking` · `has_opted_out_tracking`)의 저장소 · 쿠키 옵션(`persistence_type` · `cookie_*` · `*_cookie`)은 받지 않는다 — 거부 상태는 localStorage 에만 적는다(진단 `<입구>_ignored_option:<키>`).
- `adesdk.init(token, config)` · `adesdk.init(opts)` 둘 다 설정에서 우리 이름과 Mixpanel 이름 넷(`api_host` · `debug` · `opt_out_tracking_by_default` · `property_blacklist`)만 읽는다.
  둘 다 주면 우리 이름이 이긴다. 나머지 벤더 설정은 SDK 가 고정하므로 무시하고 진단만 남긴다.
- 옛 시작 함수 `initAdeMixpanel(opts)` 는 `adesdk.init(opts)` 와 같은 함수로 남아 있다. 이미 import 한 데모 · 검증 앱이 깨지지 않게 둔 것이고, 새 코드는 쓰지 않는다 — 이름의 Mixpanel 때문에 벤더를 직접 쓰는 것으로 오해한다.
- 진단(`/diag`)에는 종류(전송 실패 · 저장소 차단 · 내부 예외) · `lib_version` · `application_id` 셋만 실린다. 이 문서의 진단 이름(`register_dropped:<키>` · `identify_bad_user_id` 등)은 SDK 안의 구분 이름이고 서버로는 `internal_exception` 한 종류로 간다 — 키 이름 · 값 · 사유는 서버에 가지 않는다.
  벤더는 같은 인스턴스를 다시 init 해도 처음 설정을 그대로 둔다 — init 은 페이지에서 한 번 부른다.
- 만들지 않는 것: `track_links` · `track_forms`(이름은 FE 가 정하지 않는다 — 업무 결과는 `adesdk.track`, 결정 2026-09-04-02),
  `people.*` · `get_group()`(프로필 — 별도 작업), 쿠키 · 데이터 저장 지역 · 세션 리플레이 설정(고정).

**SDK 를 끄려면 `VITE_ADE_MIXPANEL=0`.** 수집은 한 건도 나가지 않지만 `window.adesdk.track` 입구는 서 있다 —
받아서 버린다. 서비스 코드에 박힌 `adesdk.track()` 호출이 SDK 유무에 따라 터지면 안 되기 때문이다(DA-197).

## 라이선스

`mixpanel-browser` 는 Apache-2.0 이다. LICENSE·저작권 헤더·의존성명을 유지한다.
