/**
 * 코어가 확장에 넘기는 것. 확장은 이것만 쓴다.
 *
 * `track` 은 벤더 `track()` 을 감싼 것이라 던지지 않는다 — 한 건을 놓치는 것이 페이지를 멈추는 것보다
 * 낫다. 확장 쪽에서 다시 try/catch 할 필요가 없다.
 */
export type ExtensionContext = {
    /** 이벤트 하나를 보낸다. `sendImmediately` 는 배치에 묶지 않고 바로 보낸다. */
    track: (event: string, props: Record<string, unknown>, opts?: {
        sendImmediately?: boolean;
    }) => void;
    /** 버린 사유를 진단으로 알린다. 사유만 나가고 값은 나가지 않는다. */
    report: (reason: string) => void;
    /** 자체 수집 서버 주소. 통신 결과 확장(system)이 자기 서버로 나간 요청을 관찰에서 빼는 데 쓴다 — 안 빼면 순환한다. */
    apiHost: string;
};
/**
 * 확장이 코어에 돌려주는 손잡이. 코어는 `stop` · `stamp` · `userChanged` 만 안다. 확장마다 더 붙일 수 있다.
 *
 * `stamp` 는 모든 이벤트에 필드를 더하는 확장(세션 · 탭 · 순번)을 위한 자리다. 코어의 before_track 이
 * 이벤트를 만들 때마다 등록된 순서대로 부른다 — 첫 페이지뷰를 포함해서. 자기 이벤트만 보내는
 * 확장(impression · system)은 돌려주지 않는다.
 *
 * `userChanged` 는 사용자가 바뀌는 자리다 — 코어가 `adesdk.identify` · `adesdk.reset` 에서 부른다(DA-279).
 * 세션 확장은 여기서 세션을 새로 발급한다. 결정 문서: 세션은 로그인 · 로그아웃 때 새로 시작한다.
 */
export type ExtensionHandle = {
    stop: () => void;
    /** 이벤트 속성에 필드를 더한다. 제자리에서 고친다. 던지면 코어가 잡고 그 확장의 필드만 빠진다. */
    stamp?: (props: Record<string, unknown>) => void;
    /** 사용자가 바뀌었다(로그인 · 로그아웃). 던지면 코어가 잡고 진단만 남긴다. */
    userChanged?: () => void;
};
/**
 * 확장 하나. `adesdk.init({ extensions })` 에 넘긴다.
 *
 * 코어는 벤더 init 앞에서 순서대로 `init` 을 부르고, 하나가 던져도 나머지는 계속 켠다. 앞에서 부르는
 * 이유: 첫 페이지뷰가 벤더 init() 안에서 동기로 나가므로, `stamp` 가 그 한 건에도 돌려면 그 전에
 * 서 있어야 한다. 그래서 init 안에서는 `ctx.track` 을 부르지 않는다 — 벤더가 아직 없다.
 */
export type Extension = {
    /** 진단에 남길 이름. 예: `impression`. */
    name: string;
    /** 코어가 벤더를 띄우기 직전에 한 번 부른다. 여기서 `ctx.track` 을 부르면 버려진다. */
    init: (ctx: ExtensionContext) => ExtensionHandle;
};
