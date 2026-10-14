// src/index.ts — 코어. Mixpanel SDK 위에 코드젠 선언 규칙과 우리 필드를 얹은 SDK.
//
// 벤더 소스는 한 줄도 고치지 않는다. 벤더가 열어 둔 콜백 자리 셋에 우리 함수를 꽂는다:
//
//   ① autocapture.block_element_callback   adeBlockElement      요소 검사 · 선언 읽기 · 판정. 클릭마다 대상과 조상에 대해 불린다
//   ② hooks.before_track                   adeStampAtCreation   이벤트가 만들어지는 시점. 세 축 · 판정 · 선언 · 마스킹 · 앱 식별 · 확장 필드를 붙인다
//   ③ hooks.before_send_events             adeVendorMask        전송 직전. 벤더 이름(`$mp_*`)을 우리 이름(`$ade_*`)으로 바꾼다
//
// 클릭 한 번의 길: 벤더가 클릭을 잡음 → ① 로 요소를 물어봄(판정 결과를 이벤트 키로 보관) → 벤더가
// 속성을 조립 → ② 가 보관한 판정을 꺼내 붙임 → 벤더 큐 → ③ → POST /track.
//
// 우리 SDK 는 Mixpanel SDK 다. 이 파일이 코어이고, 벤더가 주는 기능은 다시 만들지 않는다. 벤더에 없는
// 기능만 packages/ 의 확장 패키지로 두고 서비스가 붙인다:
//
//   import { adesdk } from '@adestack/sdk';
//   import { impression, session, system } from '@adestack/extensions';
//   adesdk.init({ ..., extensions: [impression()] });
//
// 코어는 확장에 track · report 만 넘기고 init 을 부른다(module.ts). 확장은 벤더를 모르므로 벤더 버전이
// 올라가도 그쪽은 건드릴 것이 없다.
//
//   @adestack/contract     선언 읽기 · 판정(코드젠 정본으로 교체될 자리) + 민감 요소 · 마스킹 · 길이 같은 값 안전 규칙
//   @adestack/name         벤더 이름 → 우리 이름. 중계 서버도 같은 파일을 쓴다
//   @adestack/extensions   노출 · 세션 · 시스템 — 벤더에 없는 기능 셋
//
// 직접 결과 `adesdk.track` 은 벤더 track() 을 한 번 감싼 것이다(아래 mountEntry). 업무 결과 입구는 이것 하나다 —
// 예전 이름 `tracking.outcome` · 전역 `window.tracking` 은 없앴다(2026-09-29 결정, DA-279). 벤더 이름을
// 서비스 코드에 내지 않는 입구 + 민감 키 제외 — 그것뿐이다. 이름 형식은 수집 서버가 다시 본다.
// 로그인 사용자 식별과 그 밖의 Mixpanel 문서 입구는 같은 모양의 `adesdk.xxx()` 다 — `adesdk.identify(userId)` ·
// `adesdk.reset()` · `adesdk.register(...)` …(DA-279 §10). 업무 결과도 `adesdk.track({ properties })` 다(2026-09-29 결정) —
// 다만 Mixpanel 과 달리 이름은 빌드(코드젠)가 심는다. 진단 이름 `outcome_*` 은 안에서 쓰는 구분 이름이라 그대로 둔다.

import mixpanel from 'mixpanel-browser';
import { adeVendorMask } from '@adestack/name';
import {
  readDeclaration,
  resolveCollect,
  resolveIdentityMode,
  resolveVerdict,
  CONTRACT_VERSION,
  FIXED_ATTRS,
  isSensitiveElement,
  isSensitiveKey,
  applyMask,
  dropLongDeclarationValues,
  isValidUserId,
  isValidGroupKey,
  isValidEventName,
  normalizeGroupIds,
  VENDOR_MAX_STRING,
  type Declaration,
  type IdentityMode,
  type Verdict,
} from '@adestack/contract';
import type { Extension, ExtensionContext, ExtensionHandle } from './module.js';

export { adeName, adeVendorMask, isVendorLeak } from '@adestack/name';
export type { Extension, ExtensionContext, ExtensionHandle };

/**
 * 코드젠 빌드 플러그인이 번들에 박는 빌드 식별자.
 * 변환하는 파일마다 `globalThis.__ADE_BUILD__ = {…}` 를 그 파일 맨 앞에 심는다.
 */
type AdeBuild = {
  /** CI 의 ADE_APP_ID. 한 빌드 산출물이 한 앱을 이룬다. */
  applicationId?: string;
  /** CI 의 ADE_BUILD_ID(커밋 해시). 배포 증명 대조 키의 일부다. */
  buildId?: string;
  /** DOM 을 찍은 플러그인의 규칙 버전(RULE_VERSION). 계약 패키지 버전과 맞춰 본다. */
  ruleVersion?: string;
};

/**
 * 수집 서버 기본 주소. SDK 가 알고 있어야 서비스는 `adesdk.init({ token })` 만 부르면 된다 —
 * 벤더 SDK 들이 `api_host` 를 다루는 방식과 같다. 우선순위는 `opts.apiHost` > `VITE_ADE_API_HOST` > 이 값.
 * 사내 서버로 옮기면 이 한 줄만 바꾼다(DA-238).
 */
export const DEFAULT_API_HOST = 'https://ade-collector.vercel.app';

/** `adesdk.init` 에 넘기는 설정. */
type AdeOpts = {
  /**
   * 앱 식별자. 번들 전역 `__ADE_BUILD__.applicationId` 가 있으면 그것이 이긴다 — 값의 출처는 CI 환경
   * 변수 하나여야 어긋날 방법이 없다. 여기 값은 플러그인 없이 도는 빌드(데모 · 시험)의 대체값이다.
   */
  applicationId?: string;
  /** 빌드 식별자 대체값. 위와 같다. */
  buildId?: string | null;
  /**
   * 자체 수집 서버. Mixpanel 클라우드로는 한 건도 나가지 않는다.
   * 기본은 `DEFAULT_API_HOST`(우리 수집 서버). 스테이징이나 자기 도메인 프록시로 돌릴 때만 넘긴다.
   */
  apiHost?: string;
  /** 벤더가 요구하는 자리. 수집 서버는 이 값을 보지 않는다. 기본은 `ade-demo-token`. */
  token?: string;
  /**
   * 벤더에 없어서 따로 만든 확장. 예: `[impression()]`.
   * 벤더 init 앞에서 순서대로 `init` 을 부른다. 없으면 코어(자동수집 + 직접 결과)만 돈다.
   */
  extensions?: Extension[];
  /** 벤더 `debug` — 벤더 로그를 콘솔에 낸다. 기본 false. */
  debug?: boolean;
  /** 벤더 `opt_out_tracking_by_default` — `adesdk.opt_in_tracking()` 전까지 한 건도 보내지 않는다. 기본 false. */
  optOutTrackingByDefault?: boolean;
  /**
   * 벤더 `property_blacklist` — 모든 기록에서 뺄 속성 이름. 벤더가 쓰는 이름(전송 직전 바꾸기 전, `$mp_*`)으로 적는다.
   * 식별 · 순서 필드와 SDK 가 싣는 필드(`PROTECTED_FIELDS`)는 목록에 있어도 지우지 않는다(결정 f1-a002).
   */
  propertyBlacklist?: string[];
};

/** `adesdk.register` · `register_once` · `unregister` 의 마지막 인자. 벤더와 같다 — 숫자면 쿠키 만료 일수, 객체면 `{ days, persistent }`. */
type RegisterOptions = number | { days?: number; persistent?: boolean };
/** 그룹 ID 하나. 벤더와 같다. */
type GroupId = string | number;

/**
 * `window.adesdk` · `import { adesdk }` — Mixpanel 문서의 `mixpanel.xxx()` 를 `adesdk.xxx()` 로 쓴다(DA-279 §10).
 * 인자 모양은 벤더와 같다. 모두 던지지 않는다. init 전 · SDK 를 끈 환경에서는 받아서 버린다.
 * `track_links` · `track_forms` 는 없다. `track` 이 업무 결과의 유일한 입구다 — 이름은 빌드가 심고 FE 는 `properties` 만 쓴다.
 * Mixpanel 모양 `track('이름', {...})` 은 보내지 않는다(FE 는 이벤트 이름을 짓지 않는다, 결정 2026-09-04-02).
 * `people.*` · `get_group()` 도 없다(프로필 — 별도 아이템).
 */
export type AdesdkApi = {
  /**
   * SDK 를 시작한다. 설정 객체 하나를 받고, Mixpanel 모양 `init(token, config)` 도 받는다 — config 에서 우리 이름(`apiHost` …)과
   * Mixpanel 이름(`api_host` · `debug` · `opt_out_tracking_by_default` · `property_blacklist`)만 읽고 나머지는 무시한다(진단).
   */
  init: {
    (opts?: AdeOpts): void;
    (token: string, config?: Record<string, unknown>): void;
  };
  /**
   * 업무 결과 한 건. `{ name?, properties? }` — `name` 은 코드젠이 빌드 때 심는 리터럴(`ade_` + 16진수 12자), FE 는 `properties` 만 쓴다.
   * 첫 인자가 문자열이면(Mixpanel 모양) 보내지 않고 진단(`track_name_argument`)만 남긴다.
   * 문자열도 타입이 받는 것은 그 호출이 컴파일 오류 없이 지나가 런타임에 진단으로 잡히게 하려는 것이다.
   */
  track: (call?: TrackCall | string, properties?: unknown) => void;
  /** 로그인 성공 직후. 회원번호 같은 내부 ID — 이메일 · 전화번호는 받지 않는다(DA-279) */
  identify: (userId: string) => void;
  /** 로그아웃 직전. 사용자 ID 만 지우고 기기 ID · 유입 정보는 둔다(벤더 reset() 과 다르다). 그룹 · 공통 속성도 지운다 */
  reset: () => void;
  /** 이후 모든 기록에 `key: [ids]` 를 싣는다. Mixpanel `set_group` 과 같다. `adesdk.reset()` 이 지운다(DA-279) */
  set_group: (key: string, ids: GroupId | GroupId[]) => void;
  /** 그룹 값 하나를 더한다. Mixpanel `add_group` 과 같다. `adesdk.reset()` 이 지운다 */
  add_group: (key: string, id: GroupId) => void;
  /** 그룹 값 하나를 뺀다. 마지막 값이면 키가 사라진다. Mixpanel `remove_group` 과 같다 */
  remove_group: (key: string, id: GroupId) => void;
  /** 이후 모든 기록에 싣는 공통 속성. 검사에 걸린 속성만 빼고 싣는다. `adesdk.reset()` 이 지운다 */
  register: (props: Record<string, unknown>, days_or_options?: RegisterOptions) => void;
  /** 이미 있는 키는 두고 없는 키만 싣는다. Mixpanel `register_once` 와 같다 */
  register_once: (props: Record<string, unknown>, default_value?: unknown, days_or_options?: RegisterOptions) => void;
  /** 공통 속성 하나를 지운다. 예약 키는 무시한다 */
  unregister: (key: string, options?: RegisterOptions) => void;
  /** 다음에 같은 이름으로 나가는 기록에 `$duration`(초)을 싣는다 */
  time_event: (name: string) => void;
  /** 페이지뷰 한 건. 자동수집이 주소가 바뀔 때마다 이미 보내므로 같은 주소에서 부르면 두 건이 된다 */
  track_pageview: (properties?: Record<string, unknown>) => void;
  /** 수집 거부. 벤더 기본값대로 보관소를 지운다 — 같은 페이지에서 다시 동의하면 기기 ID 는 그대로, 거부한 채 새로고침하면 새로 생긴다 */
  opt_out_tracking: (options?: Record<string, unknown>) => void;
  /** 수집 거부 해제. 벤더가 `$opt_in` 기록을 한 건 보낸다 */
  opt_in_tracking: (options?: Record<string, unknown>) => void;
  /** 거부 상태인가. init 전 · SDK 를 끈 환경에서는 false */
  has_opted_out_tracking: (options?: Record<string, unknown>) => boolean;
};

/** FE 가 `adesdk.track()` 에 넘기는 것. `name` 은 빌드 변환이 심은 리터럴, `properties` 만 FE 가 쓴다. */
type TrackCall = { name?: unknown; properties?: unknown };

declare global {
  // eslint-disable-next-line no-var
  var adesdk: AdesdkApi | undefined;
}

/** 계약 함수의 판정 결과. block_element_callback 이 만들고 before_track 이 회수한다. */
type ContractResult = {
  decl: Declaration | null;
  grade: IdentityMode | null;
  verdict: Verdict;
  reason: string | null;
  mask: boolean;
};

// ─────────────────────────────────────────────────────────────────────────────
// ① 요소 검사 — 클릭 경로에서 계약 함수를 부르는 자리
// ─────────────────────────────────────────────────────────────────────────────
//
// before_track 은 properties 만 받고 Element 를 못 본다. block_element_callback 만 (element, event) 를
// 받는다. 그래서 여기서 판정하고 결과를 이벤트 키로 보관했다가 before_track 이 꺼낸다.
// 호출 위치가 props 조립 이전이라 순서(수집 제한 → 요소 검사 → 의미 · 관계)도 자연히 지켜진다.
//
// 이 콜백은 target 과 body 까지의 모든 조상에 대해 불린다. 어느 조상에서든 true 를 반환하면 이벤트
// 자체가 만들어지지 않으므로, mask 에는 절대 true 를 반환하면 안 된다.

/** DOM 이벤트 → 판정 결과. WeakMap 이라 이벤트가 사라지면 같이 사라진다. */
const contractByEvent = new WeakMap<Event, ContractResult>();

/**
 * 버린 사유를 진단으로 알리는 통로. init 이 채운다.
 *
 * 버리기만 하고 보고하지 않으면 「선언이 안 붙었다」와 「SDK 가 형식을 못 알아본다」를 구분할 신호가
 * 사라진다. 사유만 보내고 값은 절대 담지 않는다.
 */
let reportCollectionFailure: ((reason: string) => void) | null = null;
/** 같은 사유로 매 클릭마다 보내지 않는다. 사유 하나당 한 번이면 관측에 충분하다. */
const reportedFailures = new Set<string>();

/**
 * 버린 사유를 진단으로 보낸다. 같은 사유는 페이지에서 한 번만.
 * @param reason 사유. null 이면 `unknown`.
 */
function reportFailed(reason: string | null): void {
  try {
    const key = reason ?? 'unknown';
    if (reportedFailures.has(key)) return;
    reportedFailures.add(key);
    reportCollectionFailure?.(key);
  } catch {
    /* 진단 실패가 수집을 멈추게 하지 않는다 */
  }
}

/**
 * 선언을 읽을 요소를 고른다. 사람은 버튼 안의 글자 · 아이콘을 누르므로 클릭의 target 은 대개 미선언 자식이다.
 * 그 클릭은 버튼(선언)의 클릭이다 — 가장 가까운 선언 조상이 control · input 이면 그 조상을 읽는다.
 * object 는 안에 다른 선언을 품는 그릇이라 그 안의 미선언 클릭은 그대로 미선언으로 둔다.
 *
 * @param el 클릭의 target.
 * @return 선언을 읽을 요소. target 이 선언됐거나, 감싸는 선언이 없거나 object 면 target 자신.
 */
function declarationSubject(el: Element): Element {
  try {
    if (el.hasAttribute('data-ade-kind')) return el;
    const owner = el.parentElement?.closest('[data-ade-kind]') ?? null;
    const kind = owner?.getAttribute('data-ade-kind');
    return owner && (kind === 'control' || kind === 'input') ? owner : el;
  } catch {
    return el;
  }
}

/**
 * 벤더 `autocapture.block_element_callback`. 요소마다 불려 이 요소를 수집에서 뺄지 답한다.
 *
 * 계약 함수를 부르는 유일한 자리다 — 판정 결과는 `contractByEvent` 에 남겨 `adeStampAtCreation` 이 회수한다.
 * 던지지 않는다. 판정할 수 없으면 true(차단).
 *
 * @param el 벤더가 검사 중인 요소. target 과 그 조상이 차례로 온다.
 * @param ev 지금 처리 중인 DOM 이벤트. 같은 이벤트의 조상 호출은 첫 판정을 재사용한다.
 * @return true 면 벤더가 이 이벤트를 만들지 않는다.
 */
function adeBlockElement(el: Element, ev: Event): boolean {
  try {
    // 「지금 처리 중인 DOM 이벤트」는 여기서 잡는다. 벤더는 이 콜백을 track() 직전 같은 호출 스택에서
    // 부르므로(getPropsForDOMEvent → track) 그 사이에 아무것도 끼어들지 못한다.
    // 리스너로 잡으면 안 되는 이유는 currentDomEvent 주석에 있다.
    currentDomEvent = ev;
    // 벤더가 이 요소를 차단해 track() 을 안 부르면 여기서 비운다. 신뢰된 이벤트에서 이
    // 마이크로태스크는 벤더 리스너(→ track())가 끝난 뒤에 돈다 — 읽기 전에 비우지 않는다.
    queueMicrotask(() => {
      if (currentDomEvent === ev) currentDomEvent = null;
    });

    // 1. 서브트리 수집 제한 — deny · skip 은 이벤트를 만들지 않는다
    const collect = resolveCollect(el);
    if (collect === 'deny' || collect === 'skip') return true;

    // 2. 민감 요소 검사 — 비밀번호 · 카드 입력, 결제 · 인증 폼
    const elementUnsafe = isSensitiveElement(el);

    // 3. 선언 읽기 · 판정. target 첫 호출만 기록한다 — 조상 순회 호출은 건너뛴다.
    if (!contractByEvent.has(ev)) {
      // 버튼 안의 글자를 눌렀으면 버튼을 읽는다. 수집 제한 · 민감 검사는 위에서 target 으로 이미 봤다
      const subject = declarationSubject(el);
      const decl = readDeclaration(subject);
      // 실행 중 DOM 값의 길이는 판정 앞에서 뺀다 — identity 유무로 등급 · 판정이 갈리니 판정 뒤에 지우면 모순된 기록이 된다
      for (const at of dropLongDeclarationValues(decl)) reportFailed(`declaration_value_too_long:${at}`);
      const { verdict, reason } = resolveVerdict(subject, decl, elementUnsafe);

      // `collection_failed` 는 이벤트를 만들지 않는다. 노출 경로(impression 확장)가 이미 그렇게 하고 있어,
      // 여기서 통과시키면 같은 판정에 대해 클릭은 싣고 노출은 버리는 비대칭이 생긴다. 건수는 진단으로만 남긴다.
      if (verdict === 'collection_failed') {
        reportFailed(reason);
        return true;
      }

      contractByEvent.set(ev, {
        decl,
        grade: decl ? resolveIdentityMode(decl) : null,
        verdict,
        reason,
        mask: collect === 'mask',
      });
    }

    return elementUnsafe;
  } catch {
    return true; // 판정할 수 없으면 안전한 쪽 — 이벤트를 만들지 않는다
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ② 제품 필드 부착 — 이벤트 생성 시점
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 현재 처리 중인 DOM 이벤트. adeBlockElement 가 채우고 adeStampAtCreation 이 읽은 뒤 비운다.
 * 자동수집은 블록 콜백과 track() 을 같은 디스패치 안에서 동기로 부르므로 이 값이 유효하다.
 *
 * 읽는 즉시 비운다. 안 비우면 그 뒤의 track() 이 마지막 클릭의 계약 결과를 집어 든다 — 요소가 없는
 * `$ade_scroll` · `$ade_web_page_view` 에 직전 클릭의 `ade_declaration` 이 붙고, 민감 요소로 차단된
 * 이벤트의 `collection_failed` 판정까지 다음 이벤트가 물고 나간다. 콜백은 돌았는데 벤더가 track() 을
 * 안 부른 경우(요소가 차단됨)를 위해 마이크로태스크로도 한 번 더 비운다.
 *
 * 캡처 리스너 + queueMicrotask 로 잡지 않는다. 브라우저가 직접 디스패치하는 신뢰된 이벤트는 리스너
 * 하나가 끝날 때마다 마이크로태스크 체크포인트가 돌아, 벤더 리스너가 track() 을 부르기 전에 이미
 * 비워진다. 스크립트가 만든 이벤트(el.click())는 스택이 비지 않아 뒤로 밀리므로 시험은 통과하고
 * 실제 사용자 클릭만 선언 · 등급 · 판정 · 마스킹을 잃었다.
 */
let currentDomEvent: Event | null = null;

/**
 * 지금 도는 `track()` 이 우리 입구에서 온 것인가, 그렇다면 기록 의미는 무엇인가. 입구가 track 직전에 세우고
 * before_track 이 읽는 즉시 비운다 — track → before_track 은 동기라 그 사이에 다른 것이 끼지 않는다.
 * `behavior` 는 직접 결과(`adesdk.track`), `context` 는 `adesdk.identify` · `adesdk.reset` · `adesdk.opt_in_tracking`(DA-279). 둘 다 세 축 · 앱 식별을
 * 덮는다 — FE 가 넘긴 값이 우리 스탬프를 대신하면 안 된다.
 */
let currentDirect: 'behavior' | 'context' | null = null;

/**
 * 확장이 돌려준 손잡이. before_track 이 이벤트마다 `stamp` 를 순서대로 부른다.
 * `initAde` 가 비우고 다시 채운다 — SPA 재init 에서 앞 확장의 stamp 가 남지 않게.
 */
let handles: ExtensionHandle[] = [];

/**
 * 확장들의 `stamp` 를 부른다. 하나가 던져도 나머지는 돈다 — 그 확장의 필드만 빠지고 이벤트는 나간다.
 * @param props 이벤트 속성. 제자리에서 고친다.
 */
function stampExtensions(props: Record<string, unknown>): void {
  for (const h of handles) {
    try {
      h.stamp?.(props);
    } catch {
      reportFailed('extension_stamp');
    }
  }
}

/** 확장들에 사용자가 바뀌었다고 알린다(세션 확장이 새 세션을 발급한다). 하나가 던져도 나머지는 돈다. */
function notifyUserChanged(): void {
  for (const h of handles) {
    try {
      h.userChanged?.();
    } catch {
      reportFailed('extension_user_changed');
    }
  }
}

/**
 * 벤더 대기열을 지금 보낸다(A안). 벤더에 공개 전송 함수가 없어 벤더가 페이지를 떠날 때 부르는 것과 같은
 * `request_batchers.events.flush()` 를 부른다(`mixpanel.cjs.js:29074`). 벤더 버전 고정 관문이 이 자리가
 * 있는지 본다(scripts/check-version-pin.mjs).
 *
 * 없으면 진단만 남긴다 — 다음 주기(최대 5초)에 나가고 순서는 그대로다. 이 함수는 빨리 보내는 역할뿐이다.
 * 다른 배치가 이미 전송 중이면 벤더가 건너뛴다(`:21950`). 그때도 다음 주기에 나간다.
 *
 * @param inst 벤더 인스턴스.
 */
function flushQueue(inst: any): void {
  try {
    const batchers = inst?.request_batchers;
    // 저장소를 못 써 벤더가 배치를 끄면 `events` 만 없다(`:29047`–`:29053`) — 모든 기록이 즉시 나가므로 보낼 대기열이 없다.
    if (batchers && !batchers.events) return;
    if (typeof batchers?.events?.flush !== 'function') {
      reportFailed('flush_unavailable');
      return;
    }
    void Promise.resolve(batchers.events.flush()).catch(() => {});
  } catch {
    reportFailed('flush_unavailable');
  }
}

/**
 * 로그인 · 로그아웃 기록을 대기열 끝에 넣고, 들어간 뒤 대기열 전체를 보낸다.
 *
 * 즉시 전송(`send_immediately`)은 대기열을 건너뛰어(`:29786`) 앞서 쌓인 기록보다 먼저 닿을 수 있다.
 * 벤더 대기열은 먼저 넣은 것부터 배치를 채우고 배치 요청은 한 번에 하나라, 이렇게 하면 먼저 닿을 수 없다.
 * 네 번째 인자(콜백)는 배치 모드에서 대기열 저장이 끝나면 불린다(`:29788`) — 그 전에 보내면 이 기록이 빠진다.
 * 사용자 · 세션은 track() 이 부른 순간 before_track 에서 박힌다 — 부른 뒤에 사용자를 바꿔도 이 기록은 그대로다.
 *
 * @param inst 벤더 인스턴스.
 * @param name 기록 이름.
 */
function trackSwitch(inst: any, name: '$ade_login' | '$ade_logout'): void {
  currentDirect = 'context';
  try {
    inst.track(name, {}, undefined, () => flushQueue(inst));
  } finally {
    currentDirect = null;
  }
}

/**
 * 자동수집 이벤트인지 본다. `$ade_autocapture`(이름 치환 전이면 `$mp_autocapture`) 유무가 유일한 판별자다.
 * @param p 이벤트 속성.
 * @return 자동수집이면 true. 직접 결과 · 노출은 false.
 */
const isAutocapture = (p: Record<string, unknown>): boolean =>
  p['$mp_autocapture'] === true || p['$ade_autocapture'] === true;

/** init 인자로 받은 앱 · 빌드 식별 대체값. 번들 전역이 비었을 때만 쓴다. */
let identityFallback: { applicationId?: string; buildId?: string | null } = {};

/**
 * 번들에 박힌 빌드 식별자를 지금 읽는다. 모듈 최상위에서 한 번 읽어 두지 않는다.
 *
 * ESM 은 import 한 모듈을 importer 보다 먼저 평가한다. 이 SDK 는 node_modules 에 있어 앱 파일보다
 * 항상 먼저 평가되므로, 최상위에서 `globalThis.__ADE_BUILD__` 를 읽으면 아직 아무것도 없다 —
 * 세 값이 전부 비는데 빌드도 페이지도 정상이라 아무도 눈치채지 못한다. 함수 안에서 읽으면
 * 앱 코드가 이미 돈 뒤라 값이 차 있다.
 *
 * @return 이벤트 필드 이름으로 바꾼 값. 번들 전역이 이기고, 없는 값만 init 인자로 채운다.
 *   `rule_version` 은 플러그인이 박았을 때만 있다.
 */
function readBuildIdentity(): { application_id?: string; build_id?: string; rule_version?: string } {
  const b = ((globalThis as any).__ADE_BUILD__ ?? {}) as AdeBuild;
  const out: { application_id?: string; build_id?: string; rule_version?: string } = {};
  const app = b.applicationId ?? identityFallback.applicationId;
  const build = b.buildId ?? identityFallback.buildId;
  if (app) out.application_id = app;
  if (build) out.build_id = build;
  if (b.ruleVersion) out.rule_version = b.ruleVersion;
  return out;
}

/**
 * 앱 식별 값을 이벤트에 붙인다. 모든 이벤트에 실린다. 이미 실린 값은 덮지 않는다.
 *
 * `application_id` · `build_id` · `rule_version` 은 번들에서, `contract_version` 은 이 SDK 가 쓰는 계약
 * 패키지에서 온다. 넷이 한 이벤트에 같이 실려야 「DOM 을 찍은 규칙」과 「읽은 규칙」을 나중에 맞춰 볼 수 있다.
 *
 * 벤더 `register()` 로 붙이지 않는다. 벤더는 `init()` 안에서 자동수집을 켜며 첫 페이지뷰를 동기로
 * 보내서, init 뒤에 register 하면 세션의 첫 이벤트만 앱 식별자 없이 나간다. before_track 은 그 첫 건에도 돈다.
 *
 * @param props 이벤트 속성. 제자리에서 고친다.
 * @param overwrite 직접 결과면 true — 실려 온 값을 우리 것으로 덮는다.
 */
function stampIdentity(props: Record<string, unknown>, overwrite = false): void {
  const id = { ...readBuildIdentity(), contract_version: CONTRACT_VERSION };
  for (const [k, v] of Object.entries(id)) {
    if (overwrite || props[k] == null) props[k] = v;
  }
}

/**
 * 벤더 `hooks.before_track`. 이벤트가 만들어지는 시점에 제품 필드를 붙인다 —
 * 세 축(record_type · collection_source · collection_grade), 판정 · 선언, 마스킹, 앱 식별, 확장 필드.
 *
 * 이미 실려 온 값은 덮지 않는다 — 확장이 판정해 넘긴 값이라서. 우리 입구에서 온 것만 예외로 덮는다(currentDirect).
 * 던지지 않는다. 실패하면 받은 그대로 돌려준다 — 훅이 유효값을 안 주면 벤더가 이벤트를 버린다.
 *
 * @param eventName 벤더가 만든 이벤트 이름(치환 전, `$mp_click` 등).
 * @param properties 벤더가 조립한 속성. 제자리에서 고친다.
 * @return 벤더 훅 규약대로 `[이름, 속성]`.
 */
function adeStampAtCreation(
  eventName: string,
  properties: Record<string, unknown>,
): [string, Record<string, unknown>] {
  try {
    const props = properties ?? {};
    const auto = isAutocapture(props);
    const ev = currentDomEvent;
    currentDomEvent = null; // 읽는 즉시 비운다 — 다음 track() 이 물려받지 않게
    const c = ev ? contractByEvent.get(ev) : undefined;
    const direct = currentDirect;
    currentDirect = null;

    if (direct) {
      // 우리 입구 — FE 속성이 무엇을 담았든 세 축과 앱 식별은 우리 값이다.
      props['record_type'] = direct;
      props['collection_source'] = 'direct';
      props['collection_grade'] = 'guaranteed';
      stampIdentity(props, true);
      stampExtensions(props);
      return [eventName, props];
    }

    // 세 축을 각각 따로 싣는다. 합치지 않는다.
    props['record_type'] = props['record_type'] ?? 'behavior';
    props['collection_source'] =
      props['collection_source'] ?? (auto ? (c?.decl?.kind ? 'codegen' : 'auto') : 'direct');

    // 등급은 계약 패키지가 판정한다. 자동수집 여부로 계산하지 않는다.
    //
    // 이미 실려 온 값은 덮지 않는다. 노출 관찰자는 DOM 이벤트 없이 track() 을 부르므로 c 가 없고,
    // 그쪽이 판정해 넘긴 값을 여기서 지우면 안 된다.
    //
    // `auto ? 'observed' : 'guaranteed'` 로 만들어내지 않는다. 등급은 선언 규칙으로만 정해진다.
    // `decl` 이 없어 판정할 수 없으면 등급을 만들지 않고 비운 채 둔다. 요소가 없는 `$ade_scroll` ·
    // `$ade_web_page_view` 가 근거 없이 observed 로 적재되는 것을 막는다.
    if (props['collection_grade'] == null) {
      if (c?.grade) props['collection_grade'] = c.grade;
      else if (!auto) props['collection_grade'] = 'guaranteed'; // 직접 결과
    }

    if (c) {
      if (props['verdict'] == null) props['verdict'] = c.verdict;
      if (c.reason && props['verdict_reason'] == null) props['verdict_reason'] = c.reason;
      // 구조 그대로. 평탄화하지 않는다
      if (c.decl && props['ade_declaration'] == null) props['ade_declaration'] = c.decl;
      if (c.mask) applyMask(props);
    }
    // 뒷막이 — 판정 앞(adeBlockElement · 노출 확장)에서 이미 뺐다. 다른 경로로 실려 온 선언이 있어도 벤더에 잘린 값이 닿지 않게
    if (props['ade_declaration'] != null) {
      for (const at of dropLongDeclarationValues(props['ade_declaration'])) reportFailed(`declaration_value_too_long:${at}`);
    }

    // 앱 식별 — 첫 페이지뷰를 포함한 모든 이벤트에. 생성 시점에 번들에서 읽는다.
    stampIdentity(props);

    // 확장이 더하는 필드(세션 · 탭 · 순번) — 생성 시점에 붙여야 값이 맞다. 첫 페이지뷰에도 돈다.
    stampExtensions(props);

    return [eventName, props];
  } catch {
    // 훅이 유효값을 반환하지 않으면 벤더가 이벤트를 폐기한다.
    return [eventName, properties ?? {}];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// init
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 진단 전송 함수를 만든다. 진단은 정상 원시와 다른 엔드포인트(`/diag`)로 보내고 허용 3필드
 * (`kind` · `lib_version` · `application_id`)뿐이다. 버린 키 이름 · 값 · 사유 문자열은 싣지 않는다.
 *
 * @param apiHost 수집 서버 주소.
 * @return 사유 종류 하나를 받아 보내는 함수. 실패해도 던지지 않는다.
 */
function makeReporter(apiHost: string) {
  /** @param kind 진단 종류 — 전송 실패 · 저장소 차단 · 내부 예외. 저장소 차단은 session 확장이 알린다. */
  return (kind: 'transmission_failure' | 'storage_blocked' | 'internal_exception') => {
    try {
      // 앱 식별자도 보내는 시점에 읽는다. 진단은 이벤트가 아니지만 같은 이유로 비면 안 된다.
      const application_id = readBuildIdentity().application_id ?? '';
      void fetch(`${apiHost}/diag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, lib_version: LIB_VERSION, application_id }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* 진단조차 못 보내는 경우는 관측 불가로 별도 집계한다 */
    }
  };
}

/** 빌드 변환이 심는 직접 결과 이름의 형식 — `ade_` + 16진수 12자. */
const TRACK_NAME = /^ade_[0-9a-f]{12}$/;

/**
 * 직접 결과 속성으로 실을 수 있는 값인지 본다. null · 문자열 · 숫자 · 불리언만. 객체 · 배열 · 함수는 안이 뭔지 알 수 없다.
 * @param v FE 가 넘긴 값.
 * @return 실을 수 있으면 true.
 */
const isTrackValue = (v: unknown): boolean =>
  v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/**
 * FE 입력으로 받지 않는 키. 여기의 `name` 은 빌드가 심는 이벤트 이름(call.name)이지 속성 키가 아니다 —
 * properties.name(상품명 등)은 흔한 업무 키라 받는다.
 *
 * 세 축 · 앱 식별은 before_track 이 덮으므로 여기 없다. 이건 덮을 우리 값이 없어 버리는 것들이다 —
 * 분석 이름(event_name)은 기획자가 나중에 붙이고, 판정 · 선언은 요소가 있어야 생긴다.
 */
const TRACK_RESERVED = new Set(['event_name', 'record_name', 'service_id', 'verdict', 'verdict_reason', 'ade_declaration']);

/**
 * `adesdk.set_group` 의 키로 못 쓰는 이름(DA-279). 벤더 `set_group` 은 `register({[key]: ids})` 를 하므로(`mixpanel.cjs.js:29938`)
 * 우리 · 벤더 속성과 겹치면 이후 모든 기록의 그 값을 덮는다. `TRACK_RESERVED` 와 겹치는 것은 펼쳐 쓴다.
 * `mp_` · `ade_` · `__`(벤더 내부 키 `__mps` · `__alias` …)로 시작하는 키는 접두어로 따로 막는다.
 */
const GROUP_RESERVED = new Set([
  ...TRACK_RESERVED,
  'distinct_id', 'token', 'time', 'application_id', 'build_id', 'rule_version', 'contract_version',
  'record_type', 'collection_source', 'collection_grade', 'session_id', 'tab_id', 'sequence_no',
  // 벤더가 유입 정보로 직접 register 하는 키(`mixpanel.cjs.js:20431` CAMPAIGN_KEYWORDS 그대로) · 검색어 갱신 키(`update_search_keyword`)
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_id', 'utm_source_platform',
  'utm_campaign_id', 'utm_creative_format', 'utm_marketing_tactic', 'search_engine',
  // 벤더가 주소에서 싣는 클릭 ID(`mixpanel.cjs.js:20432` CLICK_IDS 그대로) — 페이지뷰(`clickParams`)와 유입 정보에 실린다
  'dclid', 'fbclid', 'gclid', 'ko_click_id', 'li_fat_id', 'msclkid', 'sccid', 'ttclid', 'twclid', 'wbraid',
  // 벤더가 페이지뷰에 싣는 페이지 키(`mixpanel.cjs.js:20674` mpPageViewProperties 그대로) — 수동 페이지뷰 속성 · 공통 속성이 덮으면 안 된다
  'current_page_title', 'current_domain', 'current_url_path', 'current_url_protocol', 'current_url_search',
]);

/**
 * `adesdk.*` 가 속성 · 그룹 키로 받을 수 있는 이름인가 — `set_group` · `add_group` · `remove_group` · `register` ·
 * `register_once` · `unregister` · `track_pageview` 가 같이 쓴다(DA-279 §9 · §10).
 * 형식(`isValidGroupKey` — 문자열 · 길이 · `$` · 민감 키) + 예약 키(`GROUP_RESERVED`) + 접두어(`mp_` · `ade_` · `__`).
 * 예약 · 접두어 비교는 앞뒤 공백을 뗀 이름으로 한다. 저장 · 등록되는 키는 호출자가 준 그대로다.
 *
 * @param key 서비스가 넘긴 키.
 * @return 받을 수 있으면 true.
 */
function isSettableKey(key: unknown): key is string {
  if (!isValidGroupKey(key)) return false;
  const bare = key.trim();
  return !GROUP_RESERVED.has(bare) && !/^(mp_|ade_|__)/.test(bare);
}

/** 속성을 뺀 까닭. 직접 결과의 진단 이름(`outcome_<까닭>:<키>`)이 이 낱말을 쓴다. `outcome_` 접두는 안에서 쓰는 구분 이름이라 입구 이름이 `track` 이 된 뒤에도 그대로 둔다. */
type DropReason = 'dropped' | 'reserved' | 'value_unsupported' | 'value_too_long';

/**
 * FE 가 넘긴 속성에서 실을 수 있는 것만 고른다 — 직접 결과 · 공통 속성 · 수동 페이지뷰가 같이 쓴다.
 * 순서: 민감 키 → 예약 키 → 값 형식(null · 문자열 · 숫자 · 불리언) → 255자. 걸린 속성만 빼고 나머지는 싣는다.
 * 255자를 넘는 문자열은 벤더가 조용히 자르므로 자르지 않고 속성째 뺀다 — 잘린 값이 멀쩡한 값처럼 남지 않게.
 *
 * @param src 객체인 속성(부르는 쪽이 객체인지 먼저 본다).
 * @param isReserved 이 입구가 받지 않는 키인가. 직접 결과는 `TRACK_RESERVED`(세 축은 before_track 이 덮는다),
 *   공통 속성 · 페이지뷰는 `isSettableKey` 의 반대(before_track 이 덮지 않는 경로라 우리 · 벤더 속성을 모두 막는다).
 * @param onDrop 뺀 속성마다 한 번. 진단 사유를 짓는다 — 값은 넘기지 않는다.
 * @return 실을 속성. 새 객체다.
 */
function filterProperties(
  src: Record<string, unknown>,
  isReserved: (key: string) => boolean,
  onDrop: (why: DropReason, key: string) => void,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    // 민감해 보이는 키는 싣지 않는다 — 요소 판정과 같은 낱말 목록(contract)
    if (isSensitiveKey(k)) onDrop('dropped', k);
    else if (isReserved(k)) onDrop('reserved', k);
    // 객체 · 배열 · 함수는 무엇이 들었는지 알 수 없어 싣지 않는다
    else if (!isTrackValue(v)) onDrop('value_unsupported', k);
    // 빌드 때 길이를 아는 값은 코드젠이 막고, 서버 응답처럼 실행 중 들어오는 값만 여기 닿는다
    else if (typeof v === 'string' && v.length > VENDOR_MAX_STRING) onDrop('value_too_long', k);
    else out[k] = v;
  }
  return out;
}

/**
 * 객체인 인자만 속성으로 본다. 문자열 · 배열이면 `Object.entries` 가 인덱스를 키로 내놓는다.
 * @param raw FE 가 넘긴 값.
 * @return 객체면 그것, 아니면 null.
 */
const asObject = (raw: unknown): Record<string, unknown> | null =>
  raw != null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

/**
 * `propertyBlacklist` 로 지울 수 없는 필드(결정 f1-a002) — 중복 판정 · 식별 필드와 SDK 가 싣는 필드.
 * 벤더는 before_track 뒤에 목록의 속성을 지우므로(`mixpanel.cjs.js:29892`) 목록에 남기면 우리 필드까지 지워진다.
 */
const PROTECTED_FIELDS = new Set([
  'distinct_id', '$insert_id', 'time', 'token', '$device_id', '$user_id',
  'application_id', 'build_id', 'rule_version', 'contract_version',
  'record_type', 'collection_source', 'collection_grade', 'verdict', 'verdict_reason', 'ade_declaration',
  'session_id', 'tab_id', 'sequence_no',
  // 자동수집 판별자 — 지우면 before_track 이 자동수집을 직접 결과로 읽는다(isAutocapture). 전송 직전 이름도 같이 막는다
  '$mp_autocapture', '$ade_autocapture',
]);

/**
 * `propertyBlacklist` 를 벤더 `property_blacklist` 로 넘길 모양으로 만든다. 보호 필드는 빼고 진단 한 번.
 * @param list FE 가 넘긴 값.
 * @return 벤더에 넘길 목록. 배열이 아니면 빈 목록(진단 `blacklist_not_array`).
 */
function vendorBlacklist(list: unknown): string[] {
  if (list == null) return [];
  if (!Array.isArray(list)) {
    reportFailed('blacklist_not_array');
    return [];
  }
  const names = list.filter((k): k is string => typeof k === 'string');
  const kept = names.filter((k) => !PROTECTED_FIELDS.has(k));
  if (kept.length !== names.length) reportFailed('blacklist_protected_key');
  return kept;
}

/** Mixpanel 모양 `init(token, config)` 의 config 에서 읽는 Mixpanel 이름 → 우리 이름. 나머지 벤더 설정은 SDK 가 고정한다. */
const MIXPANEL_INIT_KEYS: Record<string, keyof AdeOpts> = {
  api_host: 'apiHost',
  debug: 'debug',
  opt_out_tracking_by_default: 'optOutTrackingByDefault',
  property_blacklist: 'propertyBlacklist',
};
/** config 에서 그대로 읽는 우리 이름. `token` 은 첫 인자가 정한다. */
const ADE_INIT_KEYS = new Set<string>([
  'applicationId', 'buildId', 'apiHost', 'extensions', 'debug', 'optOutTrackingByDefault', 'propertyBlacklist',
]);

/**
 * init 설정 객체 하나를 우리 설정으로 맞춘다 — `adesdk.init(opts)` · `adesdk.init(token, config)` 가 같이 쓴다.
 * 우리 이름(`ADE_INIT_KEYS` · `token`)은 그대로, Mixpanel 이름(`MIXPANEL_INIT_KEYS`)은 우리 이름으로 옮긴다. 둘 다 있으면 우리 이름이
 * 이긴다. 나머지 키는 무시하고 이름만 돌려준다 — 벤더 설정은 SDK 가 고정한다(부르는 쪽이 진단 `init_ignored_option:<키>`).
 *
 * @param cfg 서비스가 넘긴 설정.
 * @return `opts` 와 무시한 키 이름 `ignored`.
 */
function normalizeInitOptions(cfg: Record<string, unknown>): { opts: AdeOpts; ignored: string[] } {
  const opts: Record<string, unknown> = {};
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (k === 'token' || ADE_INIT_KEYS.has(k)) opts[k] = v;
    else if (k in MIXPANEL_INIT_KEYS) {
      const ours = MIXPANEL_INIT_KEYS[k];
      if (!(ours in cfg)) opts[ours] = v;
    } else ignored.push(k);
  }
  return { opts: opts as AdeOpts, ignored };
}

/**
 * `adesdk.init` 의 두 모양을 설정 객체 하나로 맞춘다. 검사 · 이름 옮기기는 `initAde` 가 한다(normalizeInitOptions).
 *   `init(opts)`            — 그대로.
 *   `init(token, config?)`  — Mixpanel 모양. 첫 인자가 토큰이다. config 안의 `token` 은 무시한다(이름을 돌려준다).
 *                             빈 · 공백 토큰은 토큰이 없는 것과 같다 — 대체값(`VITE_ADE_TOKEN` · 기본값)으로 떨어진다.
 *
 * @param first 설정 객체 또는 토큰.
 * @param second 토큰을 준 경우의 config.
 * @return 설정 객체와 여기서 무시한 키 이름.
 */
function normalizeInitArgs(first: unknown, second: unknown): { cfg: Record<string, unknown>; ignored: string[] } {
  if (typeof first !== 'string') return { cfg: asObject(first) ?? {}, ignored: [] };
  const config = asObject(second) ?? {};
  const { token: _dropped, ...rest } = config;
  const ignored = 'token' in config ? ['token'] : [];
  return { cfg: first.trim() ? { ...rest, token: first } : rest, ignored };
}

/**
 * localStorage 에 적는 키 목록 — 세운 그룹 키(`ade.group_keys:<앱>`)와 공통 속성 키(`ade.super_keys:<앱>`).
 * 새로고침 뒤에도 `adesdk.reset()` 이 지울 수 있어야 한다(벤더는 목록을 따로 두지 않는다).
 * `<앱>` 은 벤더 보관소 이름과 같은 값이다(`keyListScope`) — 벤더 보관소가 앱마다 따로라 목록도 앱마다 따로 둔다.
 * 같은 출처의 다른 앱이 세운 키를 이 앱의 reset 이 지우거나 놓치지 않게.
 * 저장소가 막힌 환경에서는 페이지 안 메모리로 버티고 진단 `storage_blocked` 한 번.
 *
 * @param base localStorage 이름 앞머리. 실제 이름은 `<base>:<keyListScope>`.
 */
function storedKeyList(base: string) {
  const storageName = () => `${base}:${keyListScope}`;
  /** 저장소가 막힌 환경에서 페이지 안에서만 버티는 목록. 저장소가 되면 쓰지 않는다. */
  let memory: string[] = [];
  const list = {
    /** @return 키 목록. 깨진 JSON · 배열이 아닌 값은 빈 목록. 저장소 접근이 던지면 페이지 안 메모리 목록. */
    read(): string[] {
      try {
        const raw = globalThis.localStorage.getItem(storageName());
        if (raw == null) return [];
        const v: unknown = JSON.parse(raw);
        return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
      } catch (e) {
        // JSON 이 깨진 것은 저장소 차단이 아니다 — 빈 목록으로 둔다
        if (e instanceof SyntaxError) return [];
        reportFailed('storage_blocked');
        return [...memory];
      }
    },
    /** @param keys 적을 목록. 빈 목록이면 항목을 지운다. */
    write(keys: string[]): void {
      memory = [...keys];
      try {
        if (keys.length === 0) globalThis.localStorage.removeItem(storageName());
        else globalThis.localStorage.setItem(storageName(), JSON.stringify(keys));
      } catch {
        reportFailed('storage_blocked');
      }
    },
    /** @param key 더할 키. 이미 있으면 그대로. */
    add(key: string): void {
      const keys = list.read();
      if (!keys.includes(key)) list.write([...keys, key]);
    },
  };
  return list;
}

/** 키 목록 이름의 앱 구분. init 이 벤더 보관소 이름(`persistence_name`)과 같은 값으로 채운다. */
let keyListScope = 'ade';
/** 세운 그룹 키. `set_group` · `add_group` 이 적고 `adesdk.reset()` 이 지운다. */
const groupKeys = storedKeyList('ade.group_keys');
/**
 * 세운 공통 속성 키. `register` · `register_once` 가 적고 `adesdk.reset()` 이 지운다. `unregister` 는 빼지 않는다 —
 * 벤더 unregister 는 보관소 · 페이지 두 벌 중 한 벌만 지우므로(`mixpanel.cjs.js:30337`) 남은 벌을 reset 이 지워야 한다.
 */
const superKeys = storedKeyList('ade.super_keys');

/** 입구가 실제로 부르는 함수들. `init` 은 늘 `initAde` 라 여기 없다. */
type EntryDeliver = Omit<AdesdkApi, 'init'>;

/** 끈 환경 · 벤더 init 실패 때 세우는, 받아서 버리는 입구. */
const noop: EntryDeliver = {
  track: () => {},
  identify: () => {},
  reset: () => {},
  set_group: () => {},
  add_group: () => {},
  remove_group: () => {},
  register: () => {},
  register_once: () => {},
  unregister: () => {},
  time_event: () => {},
  track_pageview: () => {},
  opt_out_tracking: () => {},
  opt_in_tracking: () => {},
  has_opted_out_tracking: () => false,
};

/** 지금 입구가 실제로 부르는 함수들. `mountEntry` 가 바꾼다. */
let deliver: EntryDeliver = noop;

/**
 * `window.adesdk`(업무 결과 · 로그인 사용자 식별 · Mixpanel 호환 입구)를 세운다 — 서비스 코드가
 * 벤더 이름을 모른 채 업무 결과(`track`)와 로그인 · 로그아웃(`identify` · `reset`) 등을 알리는 입구.
 *
 * 벤더 함수를 한 번 감싼 것이다. 하는 일은 입력 검사와 우리 필드를 지키는 것뿐이다.
 * 수집 서버가 같은 검사를 다시 한다. Mixpanel `window.mixpanel` · Amplitude `window.amplitude` 처럼
 * 전역이다 — npm import 를 요구하면 Vue · JSP · 순수 HTML 을 같은 방법으로 못 붙인다.
 *
 * 벤더를 정적 import 하므로 init 이 동기다 — 벤더 npm 공식 방식과 같다. 「벤더가 뜨기 전」 시간대가
 * 없어 호출을 쌓아 두는 큐가 필요 없다. 스니펫 방식의 큐(`mixpanel._i`)는 CDN 로드용이지 npm 용이 아니다.
 *
 * @param d 실제로 보내는 함수들. 끈 환경이면 받아서 버리는 함수를 넘긴다.
 */
function mountEntry(d: EntryDeliver): void {
  try {
    deliver = d;
    if (typeof window === 'undefined') return;
    // 객체는 한 번만 세우고 안의 함수만 바꾼다. 객체를 통째로 바꿔 끼우면 init 전에
    // `const { track } = window.adesdk` 로 붙잡아 둔 코드가 영원히 옛 함수(버리는 스텁)만 부른다.
    if (globalThis.adesdk !== adesdkEntry) globalThis.adesdk = adesdkEntry;
  } catch {
    /* 전역을 못 세우는 환경이면 이 입구만 없다. 나머지 수집은 그대로 돈다 */
  }
}

/** `window.adesdk` 이자 모듈 내보내기 `adesdk` 인 같은 객체. 객체를 통째로 바꿔 끼우지 않고 한 번만 세운다 — init 전에 붙잡아 둔 참조도 유효하다. */
const adesdkEntry: AdesdkApi = {
  init: (first?: unknown, second?: unknown) => {
    try {
      const { cfg, ignored } = normalizeInitArgs(first, second);
      initAde(cfg as AdeOpts);
      // 받은 이름만 알린다. 값은 싣지 않는다. 진단 통로는 init 안에서 선다
      for (const k of ignored) reportFailed(`init_ignored_option:${k}`);
    } catch {
      /* init 이 페이지를 멈추게 하지 않는다 */
    }
  },
  // 업무 결과 입구. 첫 인자가 문자열이면(Mixpanel 모양) 보내지 않는다 — FE 는 이벤트 이름을 짓지 않는다(결정 2026-09-04-02).
  // 진단은 사유만 싣는다. 그 문자열은 싣지 않는다
  track: (call) => {
    try {
      if (typeof call === 'string') {
        reportFailed('track_name_argument');
        return;
      }
      deliver.track(call);
    } catch {
      /* 입구가 페이지를 멈추게 하지 않는다 */
    }
  },
  identify: (userId) => deliver.identify(userId),
  reset: () => deliver.reset(),
  set_group: (key, ids) => deliver.set_group(key, ids),
  add_group: (key, id) => deliver.add_group(key, id),
  remove_group: (key, id) => deliver.remove_group(key, id),
  register: (props, days_or_options) => deliver.register(props, days_or_options),
  register_once: (props, default_value, days_or_options) => deliver.register_once(props, default_value, days_or_options),
  unregister: (key, options) => deliver.unregister(key, options),
  time_event: (name) => deliver.time_event(name),
  track_pageview: (properties) => deliver.track_pageview(properties),
  opt_out_tracking: (options) => deliver.opt_out_tracking(options),
  opt_in_tracking: (options) => deliver.opt_in_tracking(options),
  has_opted_out_tracking: (options) => deliver.has_opted_out_tracking(options),
};
export const adesdk = adesdkEntry;

/**
 * init 전에 들어온 `adesdk.track()` 호출 수. 모듈이 평가되는 순간 빈 입구를 세워 두고 여기서 센다 —
 * 서비스 코드가 init 보다 먼저 부르더라도 그 줄에서 터지지 않는다.
 * 호출은 보존하지 않는다 — 요구되는 건 비중단이지 보존이 아니고, 큐는 벤더 npm 방식에 없다.
 * init 이 이 수를 보고 진단(`outcome_before_init` — 진단 이름은 그대로 둔다) 한 건을 남긴다.
 */
let trackBeforeInit = 0;
/** init 전에 들어온 `adesdk.*` 호출 수(`init` 빼고). 보존하지 않는다 — track 과 같은 이유다(DA-279). */
let identityBeforeInit = 0;
{
  const countBeforeInit = () => {
    identityBeforeInit += 1;
  };
  mountEntry({
    track: () => {
      trackBeforeInit += 1;
    },
    identify: countBeforeInit,
    reset: countBeforeInit,
    set_group: countBeforeInit,
    add_group: countBeforeInit,
    remove_group: countBeforeInit,
    register: countBeforeInit,
    register_once: countBeforeInit,
    unregister: countBeforeInit,
    time_event: countBeforeInit,
    track_pageview: countBeforeInit,
    opt_out_tracking: countBeforeInit,
    opt_in_tracking: countBeforeInit,
    has_opted_out_tracking: () => {
      countBeforeInit();
      return false; // 벤더가 없으니 거부한 적도 없다
    },
  });
}

/** 잠근 벤더 버전. package.json 과 어긋나면 CI 관문이 잡는다. 진단 본문의 `lib_version` 으로 나간다. */
const LIB_VERSION = '2.82.1';

/**
 * SDK 를 시작한다. 서비스 코드가 부르는 유일한 함수다.
 *
 * 순서 — ① 진단 · 앱 식별 대체값 준비 ② `extensions` 를 순서대로 init(벤더 앞 — 첫 페이지뷰가 벤더 init
 * 안에서 나가므로 세션 같은 stamp 확장이 그 전에 서 있어야 한다) ③ 벤더 init(훅 세 개 · 자동수집)
 * ④ `adesdk.track` 입구. 전부 동기다. ②에서 `ctx.track` 을 부르면 벤더가 없어 버려진다.
 * `VITE_ADE_MIXPANEL=0` 이면 수집은 하지 않되 `window.adesdk` 입구만 세워 둔다 — 서비스 코드에
 * 박힌 호출이 터지지 않게.
 *
 * 앱 · 빌드 식별자는 번들 전역 `__ADE_BUILD__` 가 정본이다. 이벤트마다 `readBuildIdentity()` 로 읽는다.
 * 벤더 보관소 이름만 init 때 한 번 읽는다 — 그래서 이 함수는 플러그인이 변환한 앱 파일에서 부른다.
 * 플러그인은 파일 맨 위에 스탬프를 박으므로 그 파일 안의 init 호출은 항상 스탬프 뒤다. 변환되지 않는
 * 모듈(analytics.ts 최상위 등)에서 부르면 보관소 이름이 대체값으로 떨어져 같은 출처의 앱끼리
 * localStorage 를 공유한다.
 *
 * @param opts 앱 식별 대체값(`applicationId` · `buildId`) · 수집 서버(`apiHost`) · 벤더 토큰 · 붙일 확장(`extensions`).
 */
function initAde(options: AdeOpts) {
  // Mixpanel 이름(api_host …)을 섞어 쓴 설정도 읽고, 모르는 키는 아래 진단 통로가 선 뒤에 알린다
  const { opts, ignored: ignoredOptions } = normalizeInitOptions(asObject(options) ?? {});
  if ((import.meta as any).env?.VITE_ADE_MIXPANEL === '0') {
    // SDK 를 꺼도 서비스는 멀쩡해야 한다. 서비스 코드의 adesdk.track() 은 SDK 유무를
    // 모르므로 입구가 없으면 그 줄에서 페이지가 터진다 — 받아서 버리는 입구만 세운다.
    mountEntry(noop);
    return;
  }

  const apiHost = opts.apiHost ?? (import.meta as any).env?.VITE_ADE_API_HOST ?? DEFAULT_API_HOST;
  const token = opts.token ?? (import.meta as any).env?.VITE_ADE_TOKEN ?? 'ade-demo-token';

  const report = makeReporter(apiHost);
  // 버린 건수를 관측 가능하게 둔다. 사유만 나가고 값은 나가지 않는다.
  // 사유가 진단 종류 이름이면 그 종류로, 아니면 내부 예외로. storage_blocked 는 session 확장이 알린다.
  reportCollectionFailure = (reason) => report(reason === 'storage_blocked' ? 'storage_blocked' : 'internal_exception');
  // init 전에 버린 adesdk.track 호출이 있었으면 한 번 알린다. 몇 건인지는 안 나간다 — 진단은 종류만 싣는다.
  // 통로(reportCollectionFailure) 대입 뒤에 — 앞에서 부르면 아무것도 안 나가고 중복 집합에만 남는다.
  if (trackBeforeInit > 0) reportFailed('outcome_before_init');
  if (identityBeforeInit > 0) reportFailed('identity_before_init');
  // 벤더 설정은 SDK 가 고정한다 — 무시한 키 이름만 알린다
  for (const k of ignoredOptions) reportFailed(`init_ignored_option:${k}`);

  // service_id 는 싣지 않는다. role→service_id 매핑은 파이프라인이 어휘를 보고 채운다.
  // init 보다 먼저 둔다 — 첫 페이지뷰가 init 안에서 나간다.
  identityFallback = { applicationId: opts.applicationId, buildId: opts.buildId ?? 'dev' };

  // ── 확장 — 벤더 init 앞에서 ───────────────────────────────────────
  // 코어에서 받는 것은 이 객체뿐이다(module.ts). mixpanel-core 가 Autocapture · FeatureFlagManager 에
  // 자기 함수를 넘기는 것과 같은 자리. `inst` 는 아래 벤더 init 뒤에 채워진다 — 그 전의 track 은 버리고 진단만 남긴다.
  let inst: any = null;
  const ctx: ExtensionContext = {
    /** 벤더 track 을 감싼다. 던지지 않는다 — 한 건을 놓치는 것이 페이지를 멈추는 것보다 낫다. */
    track: (event, props, o) => {
      try {
        if (!inst) {
          reportFailed('track_before_vendor');
          return;
        }
        inst.track(event, props, o?.sendImmediately ? { send_immediately: true } : undefined);
      } catch {
        /* 위와 같다 */
      }
    },
    /** 버린 사유만 진단으로. 값은 어떤 경우에도 담지 않는다. */
    report: reportFailed,
    apiHost,
  };

  // 하나가 던져도 나머지는 켠다. 확장 하나가 페이지를 멈추는 이유가 되지 않는다.
  // 손잡이는 stamp 때문에 들고 있는다. 끄는 API 는 없다 — 확장은 페이지와 함께 사라진다.
  handles = [];
  for (const ext of opts.extensions ?? []) {
    try {
      handles.push(ext.init(ctx));
    } catch {
      report('internal_exception');
    }
  }

  try {
    // 벤더 보관소 이름은 init 때 한 번 정해진다. 'ade' 는 번들 전역도 init 인자도 없을 때만이다.
    const persistenceName = readBuildIdentity().application_id ?? 'ade';
    keyListScope = persistenceName; // 그룹 · 공통 속성 키 목록도 같은 이름으로 앱마다 따로

    mixpanel.init(
      token,
      {
        // ── 전송 ─────────────────────────────────────────────────────────
        api_host: apiHost,
        // 명시 필수 — 커스텀 api_host 는 기본이 base64 폼이다
        api_payload_format: 'json',
        api_transport: 'XHR',
        batch_requests: true,
        batch_size: 50,
        batch_flush_interval_ms: 5000,
        batch_request_timeout_ms: 90000,
        ip: false, // ?ip=0 — 서버가 소켓 IP 를 직접 기록한다

        // ── 보관 ─────────────────────────────────────────────────────────
        persistence: 'localStorage',
        persistence_name: persistenceName,

        // ── 끄는 것 ──────────────────────────────────────────────────────
        record_sessions_percent: 0,
        record_heatmap_data: false, // true 면 page_leave·scroll 이 강제로 켜진다
        remote_settings_mode: 'disabled',

        // ── 서비스가 고르는 것(DA-279 §10) ───────────────────────────────
        debug: opts.debug === true,
        opt_out_tracking_by_default: opts.optOutTrackingByDefault === true,
        // 보호 필드는 빼고 넘긴다 — 벤더는 before_track 뒤에 지우므로(`:29892`) 남기면 우리 필드까지 지워진다
        property_blacklist: vendorBlacklist(opts.propertyBlacklist),

        // ── 자동수집 ─────────────────────────────────────────────────────
        autocapture: {
          click: true,
          rage_click: true,
          dead_click: true,
          input: true,
          submit: true,
          scroll: true,
          pageview: 'full-url',
          page_leave: false, // 벤더 기본 off. 켜면 sendBeacon 고정이라 서버 요건이 는다

          scroll_depth_percent_checkpoints: [25, 50, 75, 100],
          scroll_capture_all: false,
          // 화면 문구($el_text)를 싣는다. 벤더 기본값은 false. 켜면 대상과 조상 전부의 문구가 실리므로
          // 「홍길동님 결제」 같은 문구는 FE 가 data-ade-collect="mask" 로 표시해야 빠진다(applyMask).
          // 표시는 FE 책임이다 — 안 붙이면 그 문구는 그대로 수집된다.
          capture_text_content: true,

          // 이름이 고정된 것만. 동적 이름(업무ID · 조상 슬롯)은 readDeclaration 이 넘긴다.
          // 목록은 contract.ts 의 FIXED_ATTRS 하나뿐이다. 여기서 다시 적지 않는다.
          //
          // 접두어 매칭을 쓰지 않는다 — 벤더가 정확 이름만 본다. 그리고 이 값은 판정에 쓰지 않는다.
          // 조상 배열에서 구조를 눈으로 보기 위한 보조일 뿐이라, 빠져도 ade_declaration 은 완전하다.
          capture_extra_attrs: [...FIXED_ATTRS],

          block_selectors: ['[data-no-track]', '[data-no-track] *'],
          block_element_callback: adeBlockElement,
        },

        // ── 개입 ─────────────────────────────────────────────────────────
        hooks: {
          before_track: adeStampAtCreation,
          before_send_events: adeVendorMask,
        },
        error_reporter: () => report('internal_exception'),
      } as any,
      'ade', // 명명 인스턴스 — 벤더 비교용 기본 인스턴스와 토큰 · 큐가 분리된다
    );

    inst = (mixpanel as any).ade ?? mixpanel;

    // 벤더가 identify() 안에서 훅 없이(skip_hooks) 보내는 $identify 는 우리 필드(앱 식별 · 세션 · 세 축)가
    // 비어 있다. 같은 정보는 $ade_login 이 담는다. 공개 함수 disable() 로 대기열에 넣기 전에 막는다(`:29855`) —
    // 전송 직전 훅에서 버리면 버린 항목만 모인 배치가 대기열에서 지워지지 않는다(`:22008`).
    inst.disable(['$identify']);

    // 세워 둔 키를 전부 지운다 — 그룹 · 공통 속성 문맥은 로그아웃 때 사라진다(기능정의서 02). 다음 사람에게 남으면 안 된다.
    // 보관소에 안 적은 공통 속성(`{ persistent: false }`)도 지운다 — 벤더는 둘을 따로 둔다(`mixpanel.cjs.js:30337`).
    const clearKeys = (list: ReturnType<typeof storedKeyList>, failReason: string): void => {
      try {
        const keys = list.read();
        if (keys.length === 0) return;
        try {
          for (const k of keys) {
            inst.unregister(k);
            inst.unregister(k, { persistent: false });
          }
        } finally {
          list.write([]);
        }
      } catch {
        reportFailed(failReason);
      }
    };
    // 그룹과 공통 속성은 각자 try — 하나가 던져도 다른 하나는 지운다
    const clearContext = (): void => {
      clearKeys(groupKeys, 'reset_group_failed');
      clearKeys(superKeys, 'reset_super_failed');
    };

    /**
     * 그룹 키 · 값 검사(`set_group` · `add_group` · `remove_group` 공통). 어기면 진단만 남기고 false.
     * @param entry 진단 이름 앞머리.
     * @param key 그룹 키.
     * @param ids 그룹 ID. `single` 이면 배열을 받지 않는다(벤더 add_group · remove_group 은 값 하나).
     */
    const checkGroup = (entry: string, key: unknown, ids: unknown, single: boolean): ids is GroupId | GroupId[] => {
      if (!isSettableKey(key)) {
        reportFailed(`${entry}_bad_key`); // 값은 싣지 않는다
        return false;
      }
      if ((single && Array.isArray(ids)) || !normalizeGroupIds(ids)) {
        reportFailed(single ? `${entry}_bad_id` : `${entry}_bad_ids`);
        return false;
      }
      return true;
    };

    /**
     * 공통 속성을 걸러 벤더 register · register_once 에 넘긴다. 세운 키는 `ade.super_keys:<앱>` 에 적는다 — 벤더 호출 전에.
     * @param entry 진단 이름 앞머리.
     * @param raw FE 가 넘긴 속성.
     * @param call 걸러진 속성으로 벤더를 부른다.
     */
    const registerWith = (entry: string, raw: unknown, call: (props: Record<string, unknown>) => void): void => {
      try {
        const src = asObject(raw);
        if (!src) {
          reportFailed(`${entry}_properties_not_object`);
          return;
        }
        const props = filterProperties(src, (k) => !isSettableKey(k), (_, k) => reportFailed(`${entry}_dropped:${k}`));
        const keys = Object.keys(props);
        if (keys.length === 0) return;
        for (const k of keys) superKeys.add(k);
        call(props);
      } catch {
        reportFailed(`${entry}_failed`);
      }
    };

    /**
     * 수집 거부 입구의 옵션에서 받지 않는 키를 뺀다. 저장소 · 쿠키 키(`persistence_type` · `cookie_*` · `*_cookie`)는 늘 뺀다 —
     * 거부 상태는 벤더 기본값대로 localStorage 에만 적는다(`opt_out_tracking_persistence_type`). `ignore_dnt` 등 나머지는 넘긴다.
     * @param entry 진단 이름 앞머리(`<entry>_ignored_option:<키>`).
     * @param options FE 가 넘긴 옵션.
     * @param extra 이 입구가 더 빼는 키.
     * @return 벤더에 넘길 새 객체.
     */
    const gdprOptions = (entry: string, options: unknown, extra: string[] = []): Record<string, unknown> => {
      const o = { ...(asObject(options) ?? {}) };
      for (const k of Object.keys(o)) {
        if (k === 'persistence_type' || k.startsWith('cookie_') || k.endsWith('_cookie') || extra.includes(k)) {
          delete o[k];
          reportFailed(`${entry}_ignored_option:${k}`);
        }
      }
      return o;
    };

    mountEntry({
      // ── 직접 결과 — 벤더 track() 을 한 번 감싼다 ────────────────────────────
      // 감싸면서 하는 검사는 셋이다 — 이름 형식 · 속성 값 형식 · 민감 키. 확인한 기록만 브라우저 큐에 넣는다.
      // 수집 서버가 같은 것을 다시 본다.
      track: (call) => {
        try {
          const c = call as TrackCall | undefined; // 문자열은 입구(adesdkEntry.track)에서 이미 걸렀다
          const name = c?.name;
          if (typeof name !== 'string' || !TRACK_NAME.test(name)) {
            // 형식이 깨진 이름은 어느 선언에서 나왔는지 이을 수 없어 분석에 쓸 수 없다. 빌드 변환이 안 돈 것이므로
            // 진단만 남기고 보내지 않는다. 사람이 읽는 이름('Sign Up')도 여기서 막힌다.
            reportFailed('outcome_bad_name');
            return;
          }
          const raw = c?.properties;
          // 객체가 아니면(문자열 · 배열) 빈 것으로 두고 진단만.
          const src = asObject(raw) ?? {};
          if (raw != null && src !== raw) reportFailed('outcome_properties_not_object');
          // 세 축 · 앱 식별은 before_track 이 덮으므로 예약은 덮을 우리 값이 없는 것만(TRACK_RESERVED). 사유엔 키 이름만.
          const props = filterProperties(src, (k) => TRACK_RESERVED.has(k), (why, k) => reportFailed(`outcome_${why}:${k}`));
          // send_immediately — 결제 완료 같은 기록을 배치에 묶어 두면 그 사이 창이 닫혔을 때 잃는다.
          // finally 로 반드시 내린다. 벤더 track 은 opt-out 검사(DNT · opt_out_tracking)에 걸리면 훅까지
          // 가지 않고 돌아오므로, 그때 플래그가 남으면 다음 자동수집 이벤트가 직접 결과로 처리돼 마스킹이 건너뛰어진다.
          currentDirect = 'behavior'; // before_track 이 읽는다 — 세 축 · 앱 식별을 덮는 근거
          try {
            inst.track(name, props, { send_immediately: true });
          } finally {
            currentDirect = null;
          }
        } catch {
          /* 한 건을 놓치는 것이 페이지를 멈추는 것보다 낫다 */
        }
      },

      // 그룹 설정. 벤더 set_group 을 그대로 부른다 — register({[key]: ids}) 로 이후 모든 기록에 실리고 people.set 은
      // /engage 로 간다(`mixpanel.cjs.js:29938`). 기록($ade_*)도 세션 전환도 없다. 어떤 키를 세웠는지는 우리가 적는다.
      set_group: (key, ids) => {
        try {
          if (!checkGroup('set_group', key, ids, false)) return;
          // 벤더 호출 전에 적는다 — register 뒤 people.set 에서 던져도 reset 이 이 키를 지울 수 있어야 한다
          groupKeys.add(key);
          inst.set_group(key, normalizeGroupIds(ids));
        } catch {
          reportFailed('set_group_failed');
        }
      },
      // 그룹 값 하나 더하기. 벤더 그대로(`:29959`) — 기존 목록에 없을 때만 더하고 people.union 은 /engage 로 간다.
      add_group: (key, id) => {
        try {
          if (!checkGroup('add_group', key, id, true)) return;
          groupKeys.add(key);
          inst.add_group(key, id);
        } catch {
          reportFailed('add_group_failed');
        }
      },
      // 그룹 값 하나 빼기. 벤더 `remove_group` 은 문서대로 동작하지 않아 부르지 않는다(`:29986`) — 남은 목록을 변수 대신
      // 글자 그대로 `{group_key: …}` 로 register 하고(`:29994`), register 가 보관소를 다시 읽으며(load) 제자리에서 줄인 목록을
      // 덮어 원래 키는 그대로 남는다. 마지막 값일 때만 키가 지워진다. 그래서 문서의 동작(목록에서 하나 빼고, 비면 키를
      // 지우고, 프로필에서도 뺀다)을 공개 함수 get_property · register · unregister · people.remove 로 한다. 벤더처럼
      // 거부 상태면 아무것도 바꾸지 않는다(벤더 remove_group 은 addOptOutCheck 로 감싸여 있다).
      remove_group: (key, id) => {
        try {
          if (!checkGroup('remove_group', key, id, true)) return;
          if (inst.has_opted_out_tracking()) return;
          const cur: unknown = inst.get_property(key);
          if (Array.isArray(cur) && cur.includes(id)) {
            const next = cur.filter((v) => v !== id);
            if (next.length > 0) inst.register({ [key]: next });
            else inst.unregister(key);
          }
          inst.people.remove(key, id); // 프로필(/engage) — 벤더 remove_group 과 같은 호출
        } catch {
          reportFailed('remove_group_failed');
        }
      },

      // 공통 속성. 벤더 그대로 — 키는 그룹 키와 같은 검사, 값은 직접 결과 값과 같은 검사. 걸린 속성만 뺀다.
      register: (props, days_or_options) => registerWith('register', props, (p) => inst.register(p, days_or_options)),
      register_once: (props, default_value, days_or_options) =>
        registerWith('register_once', props, (p) => inst.register_once(p, default_value, days_or_options)),
      unregister: (key, options) => {
        try {
          // 우리 · 벤더 예약 키(세션 · 유입 · 벤더 내부 `__*`)는 지우지 못한다
          if (!isSettableKey(key)) {
            reportFailed('unregister_reserved');
            return;
          }
          // 목록에서는 빼지 않는다 — 벤더는 한 벌(기본 보관소, `{persistent:false}` 면 페이지)만 지운다. reset 이 둘 다 지운다
          inst.unregister(key, options);
        } catch {
          reportFailed('unregister_failed');
        }
      },

      // 다음 같은 이름 기록에 $duration 을 싣는다. 벤더 그대로 — 시각은 벤더 보관소(`__timers`)에 적힌다.
      time_event: (name) => {
        try {
          if (!isValidEventName(name)) {
            reportFailed('time_event_bad_name');
            return;
          }
          inst.time_event(name);
        } catch {
          reportFailed('time_event_failed');
        }
      },

      // 수동 페이지뷰. 자동수집 페이지뷰와 같은 필드로 싣는다 — 벤더 자동수집이 부르는 것과 같은 호출
      // `track_pageview({$mp_autocapture: true})`(`:25945`)라 before_track 이 같은 길(collection_source: auto, 등급 없음)로
      // 처리한다. before_track 이 덮지 않는 길이라 우리 · 벤더 속성 키는 모두 막는다(isSettableKey). 이름을 바꾸는
      // 벤더 둘째 인자(`event_name`)는 받지 않는다 — 이름은 FE 가 정하지 않는다(결정 2026-09-04-02).
      track_pageview: (properties) => {
        try {
          const src = asObject(properties) ?? {};
          if (properties != null && src !== properties) reportFailed('track_pageview_properties_not_object');
          const props = filterProperties(src, (k) => !isSettableKey(k), (_, k) => reportFailed(`track_pageview_dropped:${k}`));
          currentDomEvent = null; // 클릭 처리 중에 불려도 그 클릭의 판정 · 선언을 물고 가지 않게
          inst.track_pageview({ ...props, $mp_autocapture: true });
        } catch {
          reportFailed('track_pageview_failed');
        }
      },

      // 수집 거부 · 해제. 벤더 그대로. 진단(/diag)은 벤더 밖이라 거부 뒤에도 나간다 — 값 · 개인정보는 싣지 않는다.
      // 거부 상태를 적는 곳은 localStorage 로 고정이다(쿠키를 쓰지 않는다) — 저장소 · 쿠키 옵션은 빼고 넘긴다(gdprOptions).
      opt_out_tracking: (options) => {
        try {
          inst.opt_out_tracking(gdprOptions('opt_out', options));
        } catch {
          reportFailed('opt_out_failed');
        }
      },
      // 해제하면 벤더가 `$opt_in` 을 즉시 보낸다(`mixpanel.cjs.js:21209`). 이건 행동이 아니라 문맥 전환이라
      // $ade_login · $ade_logout 과 같이 context/direct/guaranteed 로 싣는다 — before_track 이 currentDirect 를 읽는다.
      // 기록 이름 · 속성 · 보내는 함수를 바꾸는 벤더 옵션(`track_event_name` · `track_properties` · `track`)은 받지 않는다 —
      // 그걸 열면 이름을 FE 가 정하는 track() 이 된다(결정 2026-09-04-02).
      opt_in_tracking: (options) => {
        try {
          const o = gdprOptions('opt_in', options, ['track', 'track_event_name', 'track_properties']);
          currentDirect = 'context';
          try {
            inst.opt_in_tracking(o);
          } finally {
            currentDirect = null; // 벤더가 기록을 안 보냈어도 다음 기록이 물고 가지 않게
          }
        } catch {
          reportFailed('opt_in_failed');
        }
      },
      has_opted_out_tracking: (options) => {
        try {
          return inst.has_opted_out_tracking(gdprOptions('has_opted_out', options)) === true;
        } catch {
          reportFailed('has_opted_out_failed');
          return false;
        }
      },

      // 로그인 성공 직후. 순서: 새 세션 → 사용자 ID → $ade_login 을 대기열 끝에 → 대기열 전송(결정 2026-09-03-02).
      // 대기열에 이미 든 익명 기록은 만들 때 익명 ID 가 박혔으므로 그대로 익명으로 나간다.
      identify: (userId) => {
        try {
          if (!isValidUserId(userId)) {
            reportFailed('identify_bad_user_id'); // 값은 싣지 않는다
            return;
          }
          if (inst.get_property('$user_id') === userId) return; // 이미 그 사용자 — 새 세션도 기록도 없다
          notifyUserChanged();
          inst.identify(userId);
          trackSwitch(inst, '$ade_login');
        } catch {
          reportFailed('identify_failed');
        }
      },
      // 로그아웃 직전. 순서: $ade_logout 을 대기열 끝에(넣는 순간 기존 사용자 · 세션 · 그룹 · 공통 속성이 박힌다) → 사용자 문맥
      // 제거 → 새 세션 → 대기열 전송(trackSwitch 의 콜백). 이름만 벤더 reset() 과 같고 동작은 다르다 — 벤더 reset()
      // 은 부르지 않는다. 그건 보관소를 통째로 지워 기기 ID 를 새로 만들고 유입 정보($initial_referrer · 저장된
      // utm)까지 지운다(`:30454`). 결정 문서는 둘 다 유지한다(결정 2026-09-03-02). identify() 는 `$device:` 값을
      // 거부하지만(`:30406`) register() 는 받는다.
      reset: () => {
        try {
          if (!inst.get_property('$user_id')) {
            clearContext(); // 로그인하지 않은 상태 — 기록도 세션 전환도 없다. 익명 상태에서 세운 그룹 · 공통 속성만 지운다
            return;
          }
          try {
            trackSwitch(inst, '$ade_logout');
            const deviceId = inst.get_property('$device_id');
            inst.unregister('$user_id');
            inst.unregister('__alias');
            if (deviceId) inst.register({ distinct_id: `$device:${deviceId}` });
            // `$user_id` 만 지워지고 `distinct_id` 는 사용자 ID 로 남는다. 우리 identify 는 벤더가 `$device_id` 를
            // 세우므로(`:30412`–`:30419`) 벤더 이전 버전 보관소에서만 여기 닿는다.
            else reportFailed('reset_no_device_id');
          } finally {
            clearContext(); // 각자 try — 그룹 · 공통 속성 제거가 던져도 아래 세션 전환은 된다
            notifyUserChanged(); // unregister · register 가 던져도 세션은 바꾼다
          }
        } catch {
          reportFailed('reset_failed');
        }
      },
    });
  } catch {
    // 벤더 init 실패는 전송 실패가 아니다 — 셋 중 internal_exception 이 맞다.
    // 입구는 그래도 세운다 — 서비스 코드의 adesdk.track() · adesdk.identify() 가 터지면 안 된다.
    mountEntry(noop);
    report('internal_exception');
  }
}

/**
 * 옛 시작 함수 이름. `adesdk.init(opts)` 과 같은 함수다 — 새 코드는 `adesdk.init` 을 쓴다.
 * 이름에 벤더 이름이 들어가 쓰는 쪽이 Mixpanel 을 직접 쓰는 것으로 오해해서 바꿨다. 이미 이 이름을 import 한
 * 데모 · 검증 앱이 깨지지 않게 내보내기만 남긴다.
 *
 * @deprecated `adesdk.init(opts)` 을 쓴다.
 */
export const initAdeMixpanel = initAde;
