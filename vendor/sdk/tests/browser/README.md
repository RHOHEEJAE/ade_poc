# tests/browser — 실브라우저 시험

`@adestack/sdk` 를 **실제 브라우저**에서 검증한다. 단위 시험이 못 보는 것 — IntersectionObserver 가
정말 콜백을 주는지, 브라우저마다 다르게 도는지, SDK 오류가 페이지를 멈추는지 — 을 본다.
개발명세 §8 관문의 「3 실브라우저 관문」이다.

mixpanel-js 의 `tests/browser/` 에 해당한다. 패키지가 아니라 **폴더**다 — Playwright · esbuild · Amplitude 는
루트 devDependencies 에 있고, 명령은 전부 저장소 루트에서 친다(DA-194).

`@adestack/sdk` 와 `@adestack/extensions` 의 impression 을 **패키지 이름으로** import 해 시험한다. 루트 `package.json` 의
`name` 이 `@adestack/sdk` 라 Node self-reference 로 루트 `dist/` 에 닿고, impression 은 루트의 workspace
devDependency 로 닿는다. 진입점이 `dist/` 이므로 소스가 아니라 실제로 배포되는 빌드 결과물이 검증 대상이다.
`files: ["dist"]` 라 이 폴더는 배포물에 들어가지 않는다.

## 시험 셋

| 시험 | 답하는 질문 | 파일 |
|---|---|---|
| **실브라우저 관문** | 노출 케이스 6개가 기대한 건수로 잡히는가 | `specs/gate.spec.ts` |
| **Amplitude 동등성** | 같은 대상에 대해 Amplitude 와 같은 판정을 내리는가 | `specs/equivalence.spec.ts` |
| **장애 격리** | SDK 가 기대는 기능을 망가뜨려도, SDK 를 꺼도(`off.html`) 페이지가 멀쩡한가 | `specs/isolation.spec.ts` |
| **공통 필드** | 보낸 모든 이벤트에 앱 식별자·세션 필드가 있는가 — 첫 페이지뷰도 | `specs/common-fields.spec.ts` |
| **로그인 식별** | `adesdk.identify` · `reset` · `set_group` 이 사용자 · 세션 · 그룹을 싣고 지우며 순서를 지키는가 | `specs/identity.spec.ts` |
| **Mixpanel 호환 입구** | `adesdk.*`(register · time_event · track_pageview · add_group · opt_out · init 옵션 …)가 벤더와 같은 모양으로 돌고 기준 밖 입력은 버리는가 | `specs/compat.spec.ts` |

크롬 · 파이어폭스 · 사파리(WebKit) 세 브라우저에서 돈다.

## 명령

전부 저장소 루트에서:

```bash
pnpm build                      # 먼저. 시험은 dist/ 를 읽는다
pnpm browsers:install           # 브라우저 3종. 한 번만. 합쳐서 500MB 안팎
pnpm test:e2e                   # 3종 전부. 2분 안팎
pnpm test:chromium              # 크롬만
pnpm test:headed                # 크롬 창을 띄워 눈으로 본다
pnpm test:report                # 지난 실행의 HTML 보고서
```

SDK 를 고친 뒤에는 루트에서 `pnpm build` 를 다시 한다. 빌드 없이 돌리면 옛 `dist/` 를 시험한다.

## 구조

```
playwright.config.ts   testDir · 리포터 · webServer. 경로는 이 폴더 기준
fixture/index.html     케이스 6개가 있는 시험 페이지. 랩 「노출」 탭을 옮긴 것
fixture/app.js         우리 SDK 와 Amplitude 판정을 같은 DOM 에 세운다
scripts/build-fixture  app.js 를 esbuild 로 묶는다 (bare import 때문에 필요)
scripts/serve.mjs      fixture/ 를 내보내는 최소 서버
specs/                 시험 파일. helpers.ts 는 요청 가로채기 · 스크롤 · 배치 비우기
```

**SDK 가 보내는 요청은 Playwright 가 가로챈다.** 수집 서버 없이 돌고, 네트워크로는 한 건도
안 나간다. 응답은 항상 200 이다 — 다른 코드를 주면 SDK 가 배치를 버리거나 재시도해서
결과가 SDK 동작이 아니라 응답 코드에 좌우된다.

## 동등성의 뜻

같은 DOM · **같은 관찰 대상** · 같은 스크롤에서 두 판정기가 노출로 판정한 요소 집합이 같다.

Amplitude 쪽에도 우리 선택자(`[data-ade-kind="object"]:not([data-ade-impression="off"])`)를
준다. 관찰 대상까지 Amplitude 기본값으로 두면 `a`·`button` 전부가 잡혀 비교가 안 된다.
판정 로직만 떼어 비교하는 것이다.

**의도적 차이는 등록해 두고, 그 차이가 실제로 나는지도 확인한다.**

| 요소 | 우리 | Amplitude | 이유 |
|---|---|---|---|
| 화면보다 큰 배너 | 노출 | 안 잡힘 | Amplitude 는 100% 보일 때만 신호를 받는데 큰 요소는 100% 가 될 수 없다 |

Amplitude 가 이 동작을 바꾸면 시험이 실패해서 알려 준다.

## 결과물

시험 결과는 **도구가 낸다.** 손으로 정리한 결과 문서를 두지 않는다.

| 산출물 | 형식 | 누가 읽나 |
|---|---|---|
| `test-results/junit.xml` | JUnit XML (표준) | GitLab — MR 과 파이프라인 화면에 자동 표시 (`.gitlab-ci.yml` 의 `browser` 잡) |
| `playwright-report/` | HTML | 사람. 실패한 시험의 추적 기록(trace)까지 있다. CI 산출물로도 남는다 |
| `test-results/<시험>/sdk-impressions.json` · `sdk-all-events.json` | JSON | SDK 가 실제로 내보낸 이벤트 본문. 시험마다 첨부되어 HTML 보고서 Attachments 에서 열린다 |

`pnpm test:report` 로 HTML 을 연다. 처리 상태만 보려면 터미널의 `list` 출력이면 된다.

**리포터를 더 얹지 않는다.** 공식 결과물을 다시 가공하면 보는 사람마다 결과물이 달라지고
유지 부담이 생긴다. 도구 생태계가 내는 그대로를 본다.

## 주의

**헤드리스도 실제로 그린다.** 각 시험은 `visibilityState === 'visible'` 을 먼저 확인한다.
렌더링이 멈추면 IntersectionObserver 가 계산을 안 해서 관문이 「0건」으로 조용히 통과한다
(hecto_edp 6a24209 에서 확인한 함정).

**`fixture/app.js` 의 선택자는 `packages/impression/src/core.js` 의 `targetSelector()` 와
같아야 한다.** 패키지가 그 함수를 내보내지 않아 옮겨 적었다. 관찰 대상 규칙이 바뀌면 여기도 바꾼다.
