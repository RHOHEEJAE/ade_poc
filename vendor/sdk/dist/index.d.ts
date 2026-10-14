import type { Extension, ExtensionContext, ExtensionHandle } from './module.js';
export { adeName, adeVendorMask, isVendorLeak } from '@adestack/name';
export type { Extension, ExtensionContext, ExtensionHandle };
/**
 * 수집 서버 기본 주소. SDK 가 알고 있어야 서비스는 `adesdk.init({ token })` 만 부르면 된다 —
 * 벤더 SDK 들이 `api_host` 를 다루는 방식과 같다. 우선순위는 `opts.apiHost` > `VITE_ADE_API_HOST` > 이 값.
 * 사내 서버로 옮기면 이 한 줄만 바꾼다(DA-238).
 */
export declare const DEFAULT_API_HOST = "https://ade-collector.vercel.app";
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
type RegisterOptions = number | {
    days?: number;
    persistent?: boolean;
};
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
type TrackCall = {
    name?: unknown;
    properties?: unknown;
};
declare global {
    var adesdk: AdesdkApi | undefined;
}
export declare const adesdk: AdesdkApi;
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
declare function initAde(options: AdeOpts): void;
/**
 * 옛 시작 함수 이름. `adesdk.init(opts)` 과 같은 함수다 — 새 코드는 `adesdk.init` 을 쓴다.
 * 이름에 벤더 이름이 들어가 쓰는 쪽이 Mixpanel 을 직접 쓰는 것으로 오해해서 바꿨다. 이미 이 이름을 import 한
 * 데모 · 검증 앱이 깨지지 않게 내보내기만 남긴다.
 *
 * @deprecated `adesdk.init(opts)` 을 쓴다.
 */
export declare const initAdeMixpanel: typeof initAde;
