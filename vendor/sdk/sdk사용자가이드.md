# ADE 웹 수집 SDK: JavaScript

`@adestack/sdk` 는 Mixpanel JavaScript SDK(`mixpanel-browser` 2.82.1, 정확 고정) 위에 ADE 수집 계약을 얹은 웹 수집 SDK 다. 이 문서는 [Mixpanel JavaScript SDK 문서](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript)와 절 제목 · 순서를 똑같이 두었다. Mixpanel 문서의 한 절을 보다가 같은 이름의 절을 여기서 찾으면, 우리 SDK 에서 무엇이 같고 무엇이 다른지 바로 알 수 있다. 제공하지 않는 기능도 절 제목은 남기고 이유와 대신 쓸 것을 적었다.

> **이름 규칙**
>
> - Mixpanel 문서의 `mixpanel.xxx()` 는 `adesdk.xxx()` 다. 인자 모양은 같다. `window.adesdk` 와 `import { adesdk } from '@adestack/sdk'` 는 같은 객체다.
> - 전역 이름이 `ade` 가 아니라 `adesdk` 인 까닭: 코드젠 VS Code 확장이 `ade.` 를 자동완성 트리거로 쓴다. `ade.identify` 를 칠 때 코드젠 목록이 끼어들지 않게 `adesdk` 로 했다(README 「로그인 · 로그아웃」).
> - 서버로 가는 이벤트 · 속성 이름은 `$ade_*` 다. 벤더 이름 `$mp_click` 은 전송 직전 `$ade_click` 으로 바뀐다.
> - 업무 이벤트는 `adesdk.track({ properties })` 다. Mixpanel 과 달리 이벤트 이름은 FE 가 쓰지 않고 빌드가 심는다(결정 2026-09-04-02).
> - 배포 순서: 코드젠이 `adesdk.track(` 에 이름을 심는 버전과 함께 배포한다 — 코드젠이 이름을 심지 않으면 SDK 가 그 호출을 버린다.

### Mixpanel 기능 대조표

| Mixpanel | ADE SDK | 상태 |
|---|---|---|
| `mixpanel.init(token, config)` | `adesdk.init(opts)` · `adesdk.init(token, config)` | 제공. 받는 설정은 토큰과 일곱 개, 나머지는 SDK 가 고정 |
| 스니펫 설치 | — | 미제공. npm 만 |
| 자동수집(`autocapture`) | 늘 켜짐 | 제공. 항목은 고정 |
| `mixpanel.track()` | `adesdk.track()` | 제공. 다른 모양: 이름은 빌드가 심고 FE 는 properties 만 |
| `mixpanel.time_event()` | `adesdk.time_event()` | 제공 |
| `mixpanel.track_pageview()` | `adesdk.track_pageview()` | 제공. 자동수집과 겹치지 않게 주의 |
| UTM 저장 | 벤더 기본 동작 | 제공 |
| `mixpanel.track_links()` · `track_forms()` | — | 만들지 않음. 자동수집이 클릭 · 제출을 기록 |
| 과거 이벤트 가져오기 | — | 해당 없음 |
| `mixpanel.register()` · `register_once()` · `unregister()` | `adesdk.register()` · `register_once()` · `unregister()` | 제공. 검사에 걸린 속성은 빠진다 |
| `mixpanel.identify()` | `adesdk.identify()` | 제공 |
| `mixpanel.reset()` | `adesdk.reset()` | 제공. **동작이 다르다**(기기 ID · 유입 정보 유지) |
| `mixpanel.people.*` | — | 미제공(DA-281) |
| `mixpanel.set_group()` · `add_group()` · `remove_group()` | `adesdk.set_group()` · `add_group()` · `remove_group()` | 제공 |
| `mixpanel.get_group()` | — | 미제공(DA-282) |
| `debug` | `debug` 옵션 | 제공 |
| `opt_out_tracking()` · `opt_in_tracking()` · `has_opted_out_tracking()` | `adesdk.opt_out_tracking()` · `opt_in_tracking()` · `has_opted_out_tracking()` | 제공 |
| `opt_out_tracking_by_default` | `optOutTrackingByDefault` 옵션 | 제공 |
| EU · 인도 데이터 저장 지역 | — | 해당 없음. 자체 수집 서버 |
| 위치 정보 끄기(`ip`) | 늘 꺼짐 | 고정 |
| `property_blacklist` | `propertyBlacklist` 옵션 | 제공. 식별 · SDK 필드는 지우지 않는다 |
| 쿠키 설정 | — | 해당 없음. localStorage 사용 |
| 프록시(`api_host`) | `apiHost` 옵션 | 제공 |
| 세션 리플레이 | — | 제공하지 않음(결정) |

---

## 시작하기 (Getting Started)

설치하고 앱 파일에서 `init` 을 한 번 부르면 자동수집이 시작되고, 기록은 우리 수집 서버로 간다. Mixpanel 프로젝트나 토큰은 없어도 된다.

```js
import { adesdk } from '@adestack/sdk';
import { impression, session, system } from '@adestack/extensions';

adesdk.init({ extensions: [impression(), session(), system()] });
```

그 뒤 서비스 코드가 부르는 것은 셋이다.

```js
adesdk.track({ properties: { order_id: 'o-1', amount: 1200 } }); // 업무 결과
adesdk.identify(res.memberNo);                                    // 로그인 성공 직후
adesdk.reset();                                                   // 로그아웃 직전
```

## 라이브러리 설치 (Installing the Library)

Mixpanel 은 HTML 스니펫과 NPM 두 가지를 안내한다. 우리 SDK 는 **NPM 만** 있다. CDN 스니펫은 배포하지 않는다.

### NPM

`.npmrc` 에 사내 그룹 레지스트리를 적고 설치한다.

```
@adestack:registry=https://gitlab.hectoai.co.kr/api/v4/groups/<그룹ID>/-/packages/npm/
```

```bash
npm i @adestack/sdk @adestack/extensions
```

```js
import { adesdk } from '@adestack/sdk';
```

시작은 `adesdk.init(...)` 하나다. 벤더를 정적으로 가져오므로 `init` 은 동기이고, 호출을 쌓아 두는 큐가 없다.

> **참고** 스니펫 방식이 없으니 `window.adesdk` 는 모듈이 평가되는 순간 선다. 그래서 Vue · JSP · 순수 HTML 에서도 번들이 한 번 실린 뒤에는 import 없이 전역으로 부를 수 있다.

## 라이브러리 설정 (Library Configuration)

`init` 은 두 모양을 받는다.

```js
// ADE 모양 — 객체 하나
adesdk.init({ apiHost: '/ade-collect', debug: true, extensions: [session()] });

// Mixpanel 모양 — 토큰과 설정
adesdk.init('ade-demo-token', { api_host: '/ade-collect', debug: true });
```

어느 모양으로 부르든 설정에서는 아래 표의 우리 이름과 Mixpanel 이름 넷(`api_host` · `debug` · `opt_out_tracking_by_default` · `property_blacklist`)을 모두 알아듣는다. 둘 다 주면 우리 이름이 이긴다. 그 밖의 Mixpanel 설정 키(`autocapture`, `persistence` 등)는 무시하고 진단 `init_ignored_option:<키>` 를 한 번 남긴다. 값은 싣지 않는다.

| 옵션 | Mixpanel 이름 | 뜻 | 기본값 |
|---|---|---|---|
| `apiHost` | `api_host` | 수집 서버 주소. 스테이징이나 자기 도메인 프록시일 때만 넘긴다 | `VITE_ADE_API_HOST`, 없으면 `https://ade-collector.vercel.app` |
| `token` | (첫 인자) | 벤더가 요구하는 자리. 수집 서버는 보지 않는다 | `VITE_ADE_TOKEN`, 없으면 `ade-demo-token` |
| `extensions` | — | 벤더에 없는 기능. 「자동수집」 절 참고 | 없음 |
| `applicationId` · `buildId` | — | 코드젠 빌드 플러그인이 없는 빌드(데모 · 시험)에서만 쓰는 대체값 | 플러그인이 번들에 심은 값 |
| `debug` | `debug` | 벤더 로그를 브라우저 콘솔에 낸다 | `false` |
| `optOutTrackingByDefault` | `opt_out_tracking_by_default` | `adesdk.opt_in_tracking()` 전까지 한 건도 보내지 않는다 | `false` |
| `propertyBlacklist` | `property_blacklist` | 모든 기록에서 뺄 속성 이름 | 없음 |

> ⚠️ **주의 — init 을 부르는 자리.** `init` 은 **코드젠 빌드 플러그인이 변환하는 앱 파일**(예: `main.ts`)에서 부른다. 플러그인은 변환한 파일 맨 앞에 앱 · 빌드 식별값(`__ADE_BUILD__`)을 심고, SDK 는 `init` 때 그 앱 식별값으로 브라우저 저장소 이름을 정한다. 변환되지 않는 모듈에서 부르면 저장소 이름이 대체값으로 떨어져 같은 출처의 앱끼리 저장소를 나눠 쓴다. 플러그인 설정은 README 「서비스팀이 쓰는 법」을 본다.

> ⚠️ **주의 — init 은 한 번.** 두 번째 `init` 은 벤더 설정을 바꾸지 않는다. 벤더가 같은 인스턴스의 처음 설정을 그대로 둔다.

SDK 가 고정하는 벤더 설정은 아래와 같다. 서비스가 바꿀 수 없다.

| 벤더 설정 | 고정값 | 이유 |
|---|---|---|
| `api_payload_format` · `api_transport` | `json` · `XHR` | 수집 서버가 받는 모양 |
| `batch_size` · `batch_flush_interval_ms` | 50건 · 5초 | 묶어 보내기. 업무 결과 · 로그인 · 로그아웃은 바로 보낸다 |
| `persistence` | `localStorage` | 쿠키를 쓰지 않는다 |
| `persistence_name` | 앱 식별값 | 한 도메인의 앱끼리 저장소가 섞이지 않게 |
| `ip` | `false` | 서버가 요청 주소를 직접 기록한다 |
| `record_sessions_percent` | `0` | 세션 리플레이를 하지 않는다 |
| `record_heatmap_data` | `false` | 켜면 페이지 이탈 · 스크롤 기록이 강제로 켜진다 |
| `remote_settings_mode` | `disabled` | 원격 설정을 받지 않는다 |

**SDK 를 끄려면** 환경변수 `VITE_ADE_MIXPANEL=0` 으로 빌드한다. 기록은 한 건도 나가지 않고, 서비스 코드의 `adesdk.track()` · `adesdk.*()` 호출은 오류 없이 버려진다(`adesdk.has_opted_out_tracking()` 은 `false`).

> **참고** `init` 보다 먼저 부른 `adesdk.track()` · `adesdk.*()` 도 오류 없이 버려진다. 보존하지 않는다. `init` 때 진단 `outcome_before_init` · `identity_before_init` 을 한 번 남긴다.

## 자동수집 (Autocapture)

`init` 만 부르면 아래 기록이 자동으로 나간다. 항목을 켜고 끄는 설정은 받지 않는다.

| 기록 | 이벤트 이름 | 상태 |
|---|---|---|
| 페이지뷰(주소가 바뀔 때마다) | `$ade_web_page_view` | 켜짐 |
| 클릭 | `$ade_click` | 켜짐 |
| 연속 클릭 | `$ade_rage_click` | 켜짐 |
| 반응 없는 클릭 | `$ade_dead_click` | 켜짐 |
| 입력값 변경 | `$ade_input_change` | 켜짐 |
| 폼 제출 | `$ade_submit` | 켜짐 |
| 스크롤(25 · 50 · 75 · 100%) | `$ade_scroll` | 켜짐 |
| 페이지 이탈 | `$ade_page_leave` | 꺼짐 |

화면 문구(`$el_text`)도 싣는다. 개인정보가 보이는 문구는 FE 가 `data-ade-collect="mask"` 로 표시해야 빠진다.

#### 반응 없는 클릭 옵션 (Dead Click Options)

벤더 기본값을 쓴다. 바꾸는 설정은 받지 않는다.

#### 연속 클릭 옵션 (Rage Click Options)

벤더 기본값을 쓴다. 바꾸는 설정은 받지 않는다.

#### 기본으로 담는 HTML 속성 (HTML attributes captured by default)

벤더가 담는 속성에 더해, 코드젠이 심는 고정 이름 속성을 담는다: `data-ade-kind` · `data-ade-role` · `data-ade-name` · `data-ade-placement` · `data-ade-id-key` · `data-ade-impression` · `data-ade-collect` · `data-ade-identity-static`. 이 값은 보조 정보이고, 선언 전체는 `ade_declaration` 필드에 구조째 실린다.

#### 자동수집 기록의 기본 속성 (Default event properties on Autocapture events)

벤더가 싣는 속성(이름은 `$ade_*` 로 바뀜)에 더해 SDK 가 모든 기록에 아래 필드를 싣는다.

| 필드 | 뜻 |
|---|---|
| `application_id` · `build_id` · `rule_version` | 어느 앱의 어느 빌드에서 나왔는지(코드젠 빌드 플러그인이 심는다. `rule_version` 은 플러그인이 있을 때만) |
| `contract_version` | SDK 가 쓰는 계약 패키지 버전 |
| `record_type` · `collection_source` · `collection_grade` | 기록 의미 · 수집 경로 · 수집 증거 등급 |
| `verdict` · `verdict_reason` · `ade_declaration` | 코드젠 선언 판정과 선언 내용(요소가 있는 기록만) |
| `session_id` · `tab_id` · `sequence_no` | `session()` 확장을 붙였을 때 |

#### 자동수집 설정 (Autocapture Init Options)

모두 고정이다.

| 벤더 설정 | 고정값 |
|---|---|
| `click` · `rage_click` · `dead_click` · `input` · `submit` · `scroll` | `true` |
| `pageview` | `full-url` |
| `page_leave` | `false` |
| `scroll_depth_percent_checkpoints` | `[25, 50, 75, 100]` |
| `capture_text_content` | `true` |
| `block_selectors` | `[data-no-track]` 과 그 아래 전부 |

#### 수집에서 빼기 · 가리기

Mixpanel 의 `block_selectors` · `block_attrs` 설정 대신 요소에 아래 표시를 붙인다.

| 표시 | 효과 |
|---|---|
| `data-no-track` | 이 요소와 그 아래 전부를 기록하지 않는다 |
| `data-ade-collect="deny"` · `"skip"` | 이 요소와 그 아래의 기록을 만들지 않는다 |
| `data-ade-collect="mask"` | 기록은 남기고 화면 문구 · 주소 쿼리를 지운다 |

비밀번호 · 카드 입력, 결제 · 로그인 폼 안의 입력은 표시가 없어도 기록하지 않는다.

#### 확장 — 벤더에 없는 자동 기록

`init` 의 `extensions` 로 붙인다.

```js
import { impression, session, system } from '@adestack/extensions';

adesdk.init({ extensions: [impression({ durationMs: 300 }), session(), system({ vitals: false })] });
```

| 확장 | 기록 | 옵션 |
|---|---|---|
| `impression()` | 코드젠이 선언한 요소가 화면에 보인 것(`$ade_impression`) | `areaRatio`(기본 1) · `oversizeViewportRatio`(0.5) · `durationMs`(150) · `kinds`(`['object']`) |
| `session()` | 모든 기록에 `session_id` · `tab_id` · `sequence_no`. 30분 무활동이면 새 세션(`$ade_session_change`) | 없음 |
| `system()` | 통신 결과(`$ade_network`) · 웹 성능(`$ade_web_vital`) | `network` · `vitals`(기본 켜짐, `false` 면 끔) |

## 이벤트 보내기 (Sending Events)

### 이벤트 기록 (Track Events)

`mixpanel.track('Purchase', {...})` 자리에는 `adesdk.track({ properties })` 를 쓴다. 이벤트 이름은 FE 가 쓰지 않고, 코드젠이 빌드 때 `ade_` + 16진수 12자 이름을 심는다. `adesdk.track('Purchase', {...})` 처럼 문자열을 넘기면 보내지 않고 진단(`track_name_argument`)만 남긴다.

> **배포 순서** 코드젠이 `adesdk.track(` 에 이름을 심는 버전과 함께 배포한다 — 코드젠이 이름을 심지 않으면 SDK 가 그 호출을 버린다.

```js
adesdk.track({ properties: { order_id: 'o-1', amount: 1200 } });
// 빌드 뒤: adesdk.track({ name: 'ade_3f2a91c4d5e6', properties: { ... } })
```

| 규칙 | 설명 |
|---|---|
| 이름 | `ade_` + 16진수 12자가 아니면 보내지 않는다(진단 `outcome_bad_name`) |
| 속성 값 | 문자열 · 숫자 · 불리언 · `null` 만. 객체 · 배열은 그 속성만 빠진다 |
| 문자열 길이 | 255자까지. 넘으면 자르지 않고 그 속성을 뺀다 |
| 민감한 키 | `card_no` · `email` · `password` 같은 키는 빠진다 |
| 예약된 키 | `event_name` · `service_id` · `verdict` 등은 빠지고, 세 축 · 앱 식별은 SDK 값으로 덮인다 |
| 전송 시점 | 묶지 않고 바로 보낸다(결제 완료 같은 기록을 잃지 않게) |

> **참고** 속성이 빠지면 진단을 남긴다. 진단(`/diag`)에는 종류(전송 실패 · 저장소 차단 · 내부 예외) · `lib_version` · `application_id` 셋만 실린다. 이 문서의 진단 이름(`register_dropped:<키>` · `identify_bad_user_id` 등)은 SDK 안의 구분 이름이고 서버로는 `internal_exception` 한 종류로 간다 — 키 이름 · 값 · 사유는 서버에 가지 않는다.

#### 소요 시간 기록 (Timing Events)

`adesdk.time_event(name)` 을 부르면 다음에 같은 이름으로 나가는 기록 한 건에 `$duration`(초)이 실린다. 이름은 255자 이하 문자열이다. 빈 문자열 · 공백만 있는 값은 받지 않는다(어기면 진단 `time_event_bad_name`). 업무 결과라면 빌드가 심은 이름을 넘긴다.

```js
adesdk.time_event('ade_3f2a91c4d5e6');
// … 결제 화면 …
adesdk.track({ properties: { order_id: 'o-1' } }); // 빌드 뒤 이름이 같으면 $duration 이 실린다
```

### 페이지뷰 기록 (Track Page Views)

자동수집이 주소가 바뀔 때마다(`full-url`) 페이지뷰를 보낸다. SPA 에서도 따로 부를 필요가 없다.

주소가 바뀌지 않는 화면 전환(모달 · 탭)에만 `adesdk.track_pageview(properties?)` 로 한 건을 더 보낸다. 자동수집 페이지뷰와 같은 기록(`$ade_web_page_view`, `collection_source: auto`, 등급 없음)이다.

#### 예시 (Example Usage)

```js
// 주소는 그대로이고 요금제 모달만 열렸다
adesdk.track_pageview({ page: 'pricing_modal' });
```

> ⚠️ **주의** 주소가 바뀐 직후에 부르면 자동수집 것과 두 건이 된다.

- 속성은 공통 속성과 같은 검사를 거친다(진단 `track_pageview_dropped:<키>`).
- 기록 이름을 바꾸는 Mixpanel 의 둘째 인자(`event_name`)는 받지 않는다.

### UTM 태그 기록 (Track UTM Tags)

주소의 UTM 값과 첫 유입 주소(`$initial_referrer`)를 벤더가 저장해 이후 기록에 싣는다. 벤더 기본 동작 그대로다. `adesdk.reset()` 으로 로그아웃해도 지워지지 않는다. UTM 키(`utm_source` 등)는 공통 속성 · 그룹 키로 쓸 수 없다.

> **참고** Mixpanel 은 UTM 을 사용자 프로필 속성으로도 적지만, 우리는 프로필(`people.*`)을 아직 제공하지 않는다.

### 그 밖의 기록 방법 (Other Tracking Methods)

`track_links()` · `track_forms()` 는 **만들지 않는다**. 이름을 FE 가 정하는 입구라서다(결정 2026-09-04-02). 링크 클릭과 폼 제출은 자동수집(`$ade_click` · `$ade_submit`)이 기록하고, 업무 결과는 `adesdk.track()` 을 쓴다.

### 과거 이벤트 가져오기 (Importing Historical Events)

해당 없음. SDK 는 지금 일어난 기록만 보낸다. 과거 기록은 수집 서버 뒤 단계에서 다룬다.

## 공통 속성 설정 (Setting Super Properties)

한 번 세우면 이후 모든 기록에 실린다. Mixpanel 과 같다.

```js
adesdk.register({ plan: 'pro' });                    // 이후 모든 기록에 plan: 'pro'
adesdk.register_once({ first_visit: '2026-09' });    // 이미 있으면 그대로 둔다
adesdk.unregister('plan');
adesdk.register({ tmp: 1 }, { persistent: false });  // 새로고침하면 사라진다(벤더와 같다)
```

| 대상 | 받는 것 | 어기면 |
|---|---|---|
| 키 | 문자열, 공백 뺀 길이 1 이상 255 이하. `$` 로 시작하지 않음, 민감한 이름 아님, SDK · 벤더 예약 키(`session_id` · `utm_source` 등, 벤더가 주소에서 싣는 클릭 ID `dclid` · `fbclid` · `gclid` · `ko_click_id` · `li_fat_id` · `msclkid` · `sccid` · `ttclid` · `twclid` · `wbraid` 와 페이지 키 `current_page_title` · `current_domain` · `current_url_path` · `current_url_protocol` · `current_url_search`) 아님, `mp_` · `ade_` · `__`(벤더 내부 키 `__mps` · `__alias` 등) 로 시작하지 않음 | 그 속성만 빠진다(진단 `register_dropped:<키>`) |
| 값 | 문자열(255자 이하) · 숫자 · 불리언 · `null` | 같음 |

- `adesdk.reset()` 이 세운 공통 속성을 모두 지운다. 로그인하지 않은 상태에서도 지운다. 세운 키를 브라우저 저장소(`ade.super_keys:<앱 식별값>`)에 적어 두므로 새로고침 뒤에도 지운다. `unregister` 한 키도 목록에 남겨 둔다 — 벤더 `unregister` 는 한 벌(기본은 저장소 쪽, `{ persistent: false }` 면 페이지 쪽)만 지우므로 남은 벌을 `reset` 이 지운다.
- 예약 키는 `unregister` 로 지울 수 없다(진단 `unregister_reserved`).

## 사용자 식별 관리 (Managing User Identity)

로그인 전 기록은 브라우저마다 만들어지는 익명 기기 ID(`$device:...`)로 나간다. 로그인한 뒤에는 서비스가 알려 준 사용자 ID 로 나간다.

### 사용자 식별 (Identify)

로그인에 성공한 직후 한 번 부른다.

```js
adesdk.identify(res.memberNo); // 회원번호 같은 내부 ID
```

> ⚠️ **주의** 이메일 · 전화번호를 넘기지 않는다. `@` 가 든 값, 공백만 있는 값, 255자를 넘는 값, `$device:` 로 시작하는 값은 받지 않고 진단 `identify_bad_user_id` 만 남긴다.

| 상황 | 동작 |
|---|---|
| 로그인 전 기록 | 익명 기기 ID 그대로 나간다 |
| 로그인 기록 | SDK 가 `$ade_login` 을 보낸다. 앞서 쌓인 기록보다 먼저 서버에 닿지 않는다 |
| 세션 | `session()` 을 붙였으면 새 세션이 시작된다 |
| 같은 ID 로 다시 호출 | 아무 일도 없다. 새로고침마다 부를 필요 없다 |
| 다른 ID 로 호출 | 그 사용자로 바뀐다. 기기 ID 는 그대로다. 앞 사용자가 세운 그룹 · 공통 속성도 그대로 남는다(Mixpanel 과 같다) — 지우려면 먼저 `adesdk.reset()` 을 부른다 |

Mixpanel `identify()` 가 스스로 보내는 `$identify` 기록은 보내지 않는다. `$ade_login` 이 같은 정보를 담는다.

### 로그아웃 때 reset 호출 (Call Reset at Logout)

로그아웃 직전, 서버 로그아웃 요청보다 먼저 부른다.

```js
adesdk.reset();
```

> ⚠️ **주의 — Mixpanel `reset()` 과 동작이 다르다.** Mixpanel 은 기기 ID 를 새로 만들고 유입 정보까지 지운다. 결정 문서가 「로그아웃 뒤에도 기기 식별값과 유입 문맥은 유지한다」로 정해서 `adesdk.reset()` 은 **사용자 ID 만 지운다.**

| 항목 | 동작 |
|---|---|
| 로그아웃 기록 | SDK 가 `$ade_logout` 을 로그아웃하는 사용자 · 기존 세션으로 보낸다 |
| 로그아웃 뒤 기록 | 로그인 전과 같은 기기 ID 의 익명 기록 |
| 유입 정보 | `$initial_referrer` · UTM 그대로 |
| 세션 | `session()` 을 붙였으면 새 세션 |
| 그룹 · 공통 속성 | 지운다 |
| 로그인하지 않은 상태 | 기록 · 세션 전환 없이 그룹 · 공통 속성만 지운다 |

## 사용자 프로필 저장 (Storing User Profiles)

**제공하지 않는다.** `people.*` 는 없다. 수집 서버가 프로필 갱신(`/engage`)을 아직 반영하지 않고 격리하므로, SDK 입구와 서버 처리를 별도 작업(DA-281)으로 만든다. 그때까지 사용자에 따라 달라지는 값은 공통 속성(`adesdk.register`)으로 기록에 싣는다.

### 프로필 속성 설정 (Setting Profile Properties)

미제공(DA-281).

### 그 밖의 프로필 갱신 (Other Types Of Profile Updates)

`set_once` · `append` · `union` · `increment` 모두 미제공(DA-281).

## 그룹 분석 (Group Analytics)

사용자를 그룹에 넣으면 이후 모든 기록에 그 그룹이 실린다. `adesdk.reset()` 이 지운다. 그룹 프로필(`get_group()`)은 제공하지 않는다.

> **참고** 그룹 호출은 벤더가 사용자 프로필 갱신도 `/engage` 로 보낸다. 수집 서버는 이것을 아직 반영하지 않고 격리한다(DA-282). 기록에 실리는 그룹 값은 정상으로 쌓인다.

### 사용자를 그룹에 넣기 (Adding Users to a Group)

```js
adesdk.set_group('company', 'hecto'); // 이후 모든 기록에 company: ['hecto']
```

값은 배열로 실린다. 같은 키로 다시 부르면 값이 바뀐다. 기록(`$ade_*`)을 따로 보내지 않고 세션도 바꾸지 않는다.

| 대상 | 받는 것 | 어기면 |
|---|---|---|
| 키 | 문자열, 공백 뺀 길이 1 이상 255 이하. `$` 로 시작하지 않음. 민감한 이름 아님. SDK · 벤더 예약 키가 아님 — 공통 속성 표의 키 규칙과 같다(클릭 ID `gclid` 등 10개 · 페이지 키 `current_url_path` 등 5개 포함). `mp_` · `ade_` · `__`(벤더 내부 키 `__mps` · `__alias` 등) 로 시작하지 않음 | 아무것도 바꾸지 않고 진단 `set_group_bad_key` |
| ID | 값 하나 또는 1개 이상 배열. 원소는 유한한 숫자 또는 문자열(공백 뺀 길이 1 이상 255 이하, `@` 없음) | 아무것도 바꾸지 않고 진단 `set_group_bad_ids` |

#### 여러 그룹 (Multiple Groups)

```js
adesdk.set_group('team', ['a', 'b']);  // 여러 값
adesdk.add_group('team', 'c');         // ['a', 'b', 'c'] — 이미 있으면 그대로
adesdk.remove_group('team', 'a');      // ['b', 'c'] — 마지막 값을 빼면 키가 사라진다
```

- `add_group` · `remove_group` 은 값 하나만 받는다(배열이면 진단 `add_group_bad_id` · `remove_group_bad_id`). 키 검사는 `set_group` 과 같다.
- 벤더 2.82.1 의 `remove_group` 은 목록을 줄이지 못하고 `group_key` 속성을 남긴다. 그래서 SDK 가 같은 동작(목록에서 하나 빼기)을 벤더 공개 함수로 한다. 수집 거부 상태에서는 아무것도 바꾸지 않는다.
- 세운 그룹 키는 브라우저 저장소(`ade.group_keys:<앱 식별값>`)에 적어 두어 새로고침 뒤에도 `adesdk.reset()` 이 지운다. 저장소가 막힌 환경에서는 그 페이지 안에서만 지운다.
- 로그인 전에 부른 그룹 호출의 프로필 갱신(`/engage`)은 벤더 대기열에 남아 다음 로그인 사용자의 프로필에 붙을 수 있다. 수집 서버가 `/engage` 를 반영할 때 다룬다.

### 사용자 프로필에 그룹 식별값 넣기 (Adding Group Identifiers to User Profiles)

미제공. 벤더가 그룹 호출 때 보내는 프로필 갱신은 수집 서버가 격리한다(DA-282).

### 그룹 프로필 속성 설정 (Setting Group Profile Properties)

미제공(`get_group().set()` 등, DA-282).

### 그 밖의 그룹 프로필 방법 (Other Group Profile Methods)

`set_once` · `unset` · `union` · `remove` 모두 미제공(DA-282).

## 디버그 모드 (Debug Mode)

```js
adesdk.init({ debug: true });
```

벤더 로그가 브라우저 콘솔에 나온다. 실제로 나간 기록은 개발자 도구 네트워크 탭의 `<apiHost>/track/` 요청 본문에서 본다. SDK 가 버린 호출은 `<apiHost>/diag` 로 진단을 남긴다. 진단(`/diag`)에는 종류(전송 실패 · 저장소 차단 · 내부 예외) · `lib_version` · `application_id` 셋만 실린다. 이 문서의 진단 이름(`register_dropped:<키>` · `identify_bad_user_id` 등)은 SDK 안의 구분 이름이고 서버로는 `internal_exception` 한 종류로 간다 — 키 이름 · 값 · 사유는 서버에 가지 않는다. 무엇이 왜 빠졌는지는 `debug` 로그와 요청 본문으로 본다.

## 개인정보를 지키는 수집 (Privacy-Friendly Tracking)

### 수집 거부 (Opt Out of Tracking)

```js
adesdk.opt_out_tracking();        // 이후 기록 0건
adesdk.has_opted_out_tracking();  // true
adesdk.opt_in_tracking();         // 다시 보낸다
```

- 거부하면 벤더 기본값대로 브라우저 저장소를 지운다. 같은 페이지 안에서 다시 동의하면 기기 ID 는 그대로다. **거부한 채 새로고침하면** 저장소가 비어 있어 **기기 ID 가 새로 생긴다**.
- 로그인 상태에서 거부하면 벤더가 사용자 프로필 삭제를 `/engage` 로 보낸다. 수집 서버는 이것을 아직 격리한다(DA-282).
- 동의하면 벤더가 `$opt_in` 기록을 한 건 보낸다. SDK 는 이것을 `$ade_login` 과 같은 문맥 기록(`record_type: context` · `collection_source: direct` · `collection_grade: guaranteed`)으로 싣는다. 이름 · 속성을 바꾸는 벤더 옵션(`track` · `track_event_name` · `track_properties`)은 받지 않는다(진단 `opt_in_ignored_option:<키>`).
- 진단(`/diag`)은 벤더 밖이라 거부 뒤에도 나간다. 종류 · `lib_version` · `application_id` 만 담고 개인정보는 없다.
- `init` 전 · SDK 를 끈 환경에서 `has_opted_out_tracking()` 은 `false` 다.

#### 기본으로 거부 (Opt Out by Default)

동의를 먼저 받는 서비스는 기본 거부로 시작한다. 동의 전에는 첫 페이지뷰도 나가지 않는다.

```js
adesdk.init({ optOutTrackingByDefault: true });
// 사용자가 동의하면
adesdk.opt_in_tracking();
```

### EU 데이터 저장 지역 (EU Data Residency)

해당 없음. 모든 기록은 자체 수집 서버 한 곳(`apiHost`)으로 간다. Mixpanel 클라우드로는 한 건도 나가지 않는다.

### 인도 데이터 저장 지역 (India Data Residency)

해당 없음. 위와 같다.

### 위치 정보 끄기 (Disable Geolocation)

SDK 가 늘 끈다(`ip: false`). 따로 설정할 것이 없다.

### 기본 속성 끄기 (Disable Default Properties)

```js
adesdk.init({ propertyBlacklist: ['$referrer', '$current_url'] });
```

이름은 벤더가 쓰는 이름으로 적는다. 전송 직전에 `$mp_*` 가 `$ade_*` 로 바뀌므로 그런 속성은 `$mp_*` 로 적는다.

> ⚠️ **주의** 아래 필드는 목록에 있어도 **지우지 않는다**(진단 `blacklist_protected_key`): `distinct_id` · `$insert_id` · `time` · `token` · `$device_id` · `$user_id` · `application_id` · `build_id` · `rule_version` · `contract_version` · `record_type` · `collection_source` · `collection_grade` · `verdict` · `verdict_reason` · `ade_declaration` · `session_id` · `tab_id` · `sequence_no` · `$mp_autocapture` · `$ade_autocapture`(자동수집 판별자). 배열이 아닌 값을 넘기면 무시하고 진단 `blacklist_not_array`.

## Mixpanel 쿠키 (Mixpanel Cookie)

해당 없음. 쿠키를 쓰지 않고 localStorage 에 기기 ID · 사용자 ID · 대기열을 둔다(저장소 이름은 앱 식별값에서 나온다). 세션 확장 · 그룹 · 공통 속성은 `ade.*` 로 시작하는 자기 키를 쓴다. 저장소를 못 쓰는 브라우저에서도 페이지는 멈추지 않고 진단 `storage_blocked` 만 남긴다.

### 호스팅 하위 도메인 (Hosted Subdomains)

해당 없음. 쿠키 도메인 설정(`cross_subdomain_cookie`)이 없다.

> ⚠️ **주의** localStorage 는 출처(하위 도메인)마다 따로다. `a.example.com` 과 `b.example.com` 을 오가면 **기기 ID 가 따로 잡힌다.** 같은 사람은 로그인 뒤 사용자 ID 로 이어진다.

## 프록시로 수집 (Tracking Via Proxy)

광고 차단기 등으로 수집 서버 주소가 막히면, 자기 도메인 경로를 수집 서버로 넘기는 프록시를 둔다.

SDK 가 실제로 부르는 경로는 셋이다.

| 경로 | 내용 | 수집 서버 |
|---|---|---|
| `/track/` | 기록(이벤트) | 받는다 |
| `/engage/` | 그룹 호출 · 로그인 상태 수집 거부의 프로필 갱신 | 지금은 격리한다(DA-282) |
| `/diag` | SDK 진단 | 받는다 |

`/record/`(세션 리플레이) · `/flags/`(기능 플래그) · `/settings/`(원격 설정)는 모두 꺼져 있어 SDK 가 부르지 않는다. 수집 서버도 이 경로에는 404 로 답한다.

### 1단계: 프록시 서버 준비 (Step 1: Set up a proxy server)

자기 도메인 경로(예: `/ade-collect`)에 온 요청을 수집 서버(`https://ade-collector.vercel.app`)로 넘긴다. **`/track/` · `/engage/` · `/diag` 세 경로를 모두 넘겨야 한다.** 요청 본문과 `Origin` 헤더를 그대로 전달한다.

### 2단계: SDK 를 프록시로 (Step 2: Point the JavaScript SDK at your proxy)

```js
adesdk.init({ apiHost: '/ade-collect' });
// 또는 Mixpanel 모양
adesdk.init('ade-demo-token', { api_host: '/ade-collect' });
// 또는 빌드 환경변수 VITE_ADE_API_HOST=/ade-collect
```

| 순위 | 값 |
|---|---|
| 1 | `apiHost` 옵션(Mixpanel 모양이면 `api_host`) |
| 2 | 환경변수 `VITE_ADE_API_HOST` |
| 3 | 기본 주소 `https://ade-collector.vercel.app` |

> **참고** SDK 는 CDN 에서 받지 않으므로 `lib_base_path` 같은 스크립트 주소 설정은 없다.

### 문제 해결 (Troubleshooting)

| 증상 | 확인할 것 |
|---|---|
| 기록이 안 나간다 | 네트워크 탭에 `/track/` 요청이 있는지. 없으면 `VITE_ADE_MIXPANEL=0` 로 빌드됐는지, 수집 거부 상태인지(`adesdk.has_opted_out_tracking()`) |
| 콘솔에 CORS 오류 | 수집 서버에 서비스 출처(Origin)가 등록됐는지. 프록시가 `Origin` 을 넘기는지 |
| 요청은 성공인데 조회에 안 보인다 | 토큰이 출처에 등록된 값과 같은지. 다르면 서버가 격리 테이블로 보낸다 |
| 진단이 안 온다 | 프록시가 `/diag` 를 넘기는지 |
| `/engage/` 요청이 보인다 | 정상. 그룹 호출 · 로그인 상태 수집 거부 때 벤더가 보낸다. 서버는 지금 격리한다 |
| `/record/` · `/flags/` · `/settings/` 404 | 정상. 이 SDK 는 이 경로를 부르지 않는다. 요청이 이 SDK 에서 나온 것이 아니다 |
| 기록이 5초 늦게 보인다 | 정상. 50건 또는 5초마다 묶어 보낸다. 업무 결과 · 로그인 · 로그아웃은 바로 보낸다 |

## 세션 리플레이 (Session Replay)

**제공하지 않는다.** 결정 문서가 세션 리플레이를 수집 범위에서 뺐다. SDK 가 `record_sessions_percent: 0` 으로 고정하고, 녹화 경로(`/record/`)를 부르지 않는다. 화면 흐름은 자동수집 기록과 `session()` 확장의 세션 · 순번으로 본다.

## 버전 기록 (Release History)

| SDK | 벤더 | 변경 |
|---|---|---|
| 0.1.0 | `mixpanel-browser` 2.82.1(정확 고정) | 자동수집 · 업무 결과(`adesdk.track`) · 노출 · 세션 · 통신 결과 · 웹 성능 |
| 0.1.0(DA-279) | 같음 | `adesdk.identify()` · `reset()` · `set_group()` · `add_group()` · `remove_group()` · `register()` · `register_once()` · `unregister()` · `time_event()` · `track_pageview()` · `opt_out_tracking()` · `opt_in_tracking()` · `has_opted_out_tracking()` 추가. `adesdk.init()` 이 Mixpanel 모양 `init(token, config)` 도 받는다. init 옵션 `debug` · `optOutTrackingByDefault` · `propertyBlacklist` 추가 |

벤더 버전은 캐럿 없이 고정한다. 올리는 절차는 [README](README.md) 「벤더 올리는 절차」에 있다.
