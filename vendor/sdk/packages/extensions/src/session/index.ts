// session/index.ts — 세션 · 탭 · 순번 확장. 모든 이벤트에 `session_id` · `tab_id` · `sequence_no` 를 더한다.
//
// Mixpanel 은 이 셋을 이벤트에 싣지 않는다 — 세션은 서버가 나눈다. 우리는 탭 구분과 탭 안 순서가
// 필요해서 붙인다. 서비스가 `adesdk.init({ extensions: [session()] })` 으로 붙인다.
//
// 규칙은 core.js 가 갖는다. 여기는 배선만 한다 — 브라우저 저장소를 넘기고, 코어가 이벤트를 만들 때
// 부르는 `stamp` 를 돌려주고, 탭을 떠날 때 표시를 지운다.
//
// 코어는 이 확장을 벤더 init 앞에서 init 한다. 첫 페이지뷰가 벤더 init() 안에서 동기로 나가므로,
// 그보다 먼저 서 있어야 그 한 건에도 세 값이 붙는다.

import { createSession } from './core.js';

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

/** `window.localStorage` 같은 Storage 를 core.js 가 받는 모양으로 감싼다. 접근이 던지면 그대로 던진다 — core 가 잡는다. */
const wrap = (pick: () => Storage) => ({
  get: (k: string) => pick().getItem(k),
  set: (k: string, v: string) => pick().setItem(k, v),
  remove: (k: string) => pick().removeItem(k),
});

/**
 * 새 ID. `crypto.randomUUID` 가 있으면 그것을, 없으면 시각 + 난수.
 * @param prefix `s` 세션 · `t` 탭.
 * @return 접두어가 붙은 ID.
 */
function newId(prefix: string): string {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefix}_${uuid}`;
  } catch {
    /* 폴백으로 내려간다 */
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 이 페이지(탭)의 탭 상태. 페이지에 하나다. `createSession` 은 뜨는 순간 「열려 있다」 표시로 복제 탭을
 * 판정하므로, init 마다 새로 만들면 두 번째 init 이 자기 자신을 복제 탭으로 오판해 새 tab_id 를 준다.
 * SPA 가 adesdk.init 을 다시 불러도 탭은 그대로다 — 같은 상태를 다시 쓴다.
 */
let activeCore: ReturnType<typeof createSession> | null = null;

/**
 * 탭 상태를 만들고 떠날 때의 정리를 건다. 페이지에서 한 번만 돈다.
 * @param ctx 진단 통로와 track. 저장소 차단 알림과 세션 전환 기록에 쓴다.
 * @return 탭 상태.
 */
function mount(ctx: ExtensionContext): ReturnType<typeof createSession> {
  const core = createSession({
    local: wrap(() => window.localStorage),
    session: wrap(() => window.sessionStorage),
    now: () => Date.now(),
    newId,
    // 저장소가 막힌 브라우저(사생활 모드 · 차단). 값은 메모리로 버티고 사유만 알린다.
    onStorageBlocked: () => ctx.report('storage_blocked'),
  });
  // 무활동으로 세션이 갈리면 문맥 기록 한 건.
  // 이 알림은 stamp() 안 = 코어의 before_track 안에서 온다. 곧바로 track 하면 훅이 자기 자신을 다시
  // 타므로 한 틱 미룬다. 이전 값만 싣는다 — 현재 session_id 는 stamp 가 붙여 주므로 한 기록 안에
  // 이전 · 현재가 함께 남아 두 세션을 이어 붙일 수 있다.
  core.onSessionExpired(({ previous }) => {
    setTimeout(() => {
      ctx.track('$ade_session_change', { ...CONTEXT_AXES, previous_session_id: previous, session_change_reason: 'idle' });
    }, 0);
  });
  // 탭을 떠날 때 「열려 있다」 표시를 지운다. pagehide 는 bfcache 까지 덮는다.
  // bfcache 로 되살아나면(pageshow · persisted) init 이 다시 돌지 않으므로 표시를 여기서 다시 세운다.
  try {
    window.addEventListener('pagehide', () => core.closing());
    window.addEventListener('pageshow', (e: PageTransitionEvent) => {
      if (e.persisted) core.reopened();
    });
  } catch {
    /* 리스너를 못 걸면 새로고침이 새 탭으로 보일 뿐이다. 수집은 그대로 돈다 */
  }
  activeCore = core;
  return core;
}

/**
 * 세션 전환 문맥 기록의 세 축 — 무활동 30분으로 갈리는 건 관찰로 알아낸 사실이라 observed · auto 다.
 * 로그인 · 로그아웃(`reset`)에 의한 전환은 부르는 쪽이 이미 알아서 여기서 기록하지 않는다.
 */
const CONTEXT_AXES = {
  record_type: 'context',
  collection_grade: 'observed',
  collection_source: 'auto',
} as const;

/**
 * 세션 확장을 만든다. `adesdk.init({ extensions: [session()] })` 에 넘긴다.
 *
 * @return 확장 객체. 코어가 `init` 을 부르면 그때부터 모든 이벤트에 `session_id` · `tab_id` · `sequence_no` 가 붙는다.
 *   두 번 init 해도(SPA 재init, 같은 객체든 새 객체든) 탭 상태는 페이지에 하나다 — `activeCore` 를 다시 쓴다.
 */
export function session(): SessionExtension {
  let core: ReturnType<typeof createSession> | null = null;

  return {
    name: 'session',
    init: (ctx) => {
      core = activeCore ?? mount(ctx);
      const c = core;
      return {
        /** 페이지에 하나뿐인 탭 상태는 내리지 않는다 — 다른 init 이 같은 것을 쓰고 있을 수 있다. */
        stop: () => {},
        /** 코어의 before_track 이 이벤트마다 부른다. 세 값은 언제나 우리 것이다 — 실려 온 값을 덮는다. */
        stamp: (props) => {
          try {
            Object.assign(props, c.stamp());
          } catch {
            ctx.report('session_stamp_failed');
          }
        },
        /** 코어가 로그인 · 로그아웃 때 부른다(DA-279). 세션만 새로 발급한다 — 탭 · 순번은 그대로다. */
        userChanged: () => {
          try {
            c.reset();
          } catch {
            ctx.report('session_reset_failed');
          }
        },
      };
    },
    // 페이지의 탭 상태를 본다 — init 에 쓴 객체가 아니어도(다른 모듈에서 새로 session() 한 경우) 세션이 갈려야 한다.
    reset: () => (core ?? activeCore)?.reset() ?? null,
  };
}
