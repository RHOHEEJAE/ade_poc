import type { ExtensionContext } from '../context.js';
export type { ExtensionContext };
/** 코어에 돌려주는 손잡이. `stamp` 는 코어의 before_track 이 이벤트마다, `userChanged` 는 로그인 · 로그아웃 때 부른다. */
export type SessionHandle = {
    stop: () => void;
    stamp: (props: Record<string, unknown>) => void;
    userChanged: () => void;
};
/**
 * 세션 확장. `adesdk.identify` · `adesdk.reset` 을 쓰면 코어가 `userChanged` 로 세션을 바꾼다 — 이 확장의 `reset` 은 그 입구를 쓰지 않는 서비스를 위한 것이다.
 * init 전에는 아무 일도 안 한다.
 */
export type SessionExtension = {
    name: 'session';
    init: (ctx: ExtensionContext) => SessionHandle;
    /** 세션을 즉시 새로 발급한다(로그인 · 로그아웃). @return 새 세션 ID. init 전이면 null */
    reset: () => string | null;
};
/**
 * 세션 확장을 만든다. `adesdk.init({ extensions: [session()] })` 에 넘긴다.
 *
 * @return 확장 객체. 코어가 `init` 을 부르면 그때부터 모든 이벤트에 `session_id` · `tab_id` · `sequence_no` 가 붙는다.
 *   두 번 init 해도(SPA 재init, 같은 객체든 새 객체든) 탭 상태는 페이지에 하나다 — `activeCore` 를 다시 쓴다.
 */
export declare function session(): SessionExtension;
