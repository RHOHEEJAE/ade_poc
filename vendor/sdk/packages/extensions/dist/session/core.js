// session/core.js — 세션 · 탭 · 순번의 순수 규칙. 브라우저도 벤더도 모른다.
//
// 저장소 · 시각 · ID 생성을 밖에서 받는다. 그래서 단위 시험이 빌드 없이 이 파일을 그대로 읽고,
// 가짜 저장소로 30분 만료 · 탭 복제 · 순번을 고정한다. 브라우저 배선은 index.ts 가 한다.
//
// 세 값의 규칙:
//   session_id   같은 사용 흐름. 로그인 · 로그아웃 · 30분 비활동이면 새로 발급. 같은 브라우저 · 출처의 탭이 공유
//   tab_id       탭 하나. 탭이 열려 있는 동안 유지. 새 탭 · 복제한 탭은 새 값
//   sequence_no  탭 안의 발생 순서. 탭마다 1 부터 1씩. 탭 사이 순번은 독립
//
// Mixpanel 은 이 셋을 이벤트에 싣지 않는다 — 세션은 서버가 나눈다. 우리는 탭 구분과 탭 안 순서가
// 필요해서 확장으로 붙인다.
/** 무활동 30분이면 새 세션. 업계 공통값(Amplitude · GA4 도 30분). */
export const IDLE_MS = 30 * 60 * 1000;
/** 저장소 키. `local` 은 탭이 공유하고 `session` 은 탭마다 따로다. */
export const KEYS = Object.freeze({
    /** localStorage — 세션 ID */
    sid: 'ade.session_id',
    /** localStorage — 마지막 활동 시각(ms). 비활동 판정에 쓴다 */
    seen: 'ade.session_seen_at',
    /** sessionStorage — 탭 ID */
    tab: 'ade.tab_id',
    /**
     * sessionStorage — 「이 탭이 열려 있다」 표시. 페이지가 뜨면 세우고 떠날 때 지운다.
     * 뜨는 순간 이미 서 있으면 복제된 탭이다 — 복제는 sessionStorage 를 통째로 베끼는데 원본 탭이
     * 아직 열려 있어 표시가 안 지워졌기 때문. 그때는 새 tab_id 를 준다.
     * (벤더가 자기 tab_id 를 만들 때 쓰는 것과 같은 요령이다.)
     */
    open: 'ade.tab_open',
    /** sessionStorage — 순번 카운터 */
    seq: 'ade.seq',
});
/**
 * 세션 · 탭 · 순번 상태 하나를 만든다. 탭(페이지) 하나에 하나다.
 *
 * @param {object} deps
 * @param {{get(k:string):string|null, set(k:string,v:string):void, remove(k:string):void}} deps.local 탭이 공유하는 저장소(localStorage). 접근이 던져도 된다.
 * @param {{get(k:string):string|null, set(k:string,v:string):void, remove(k:string):void}} deps.session 탭마다 따로인 저장소(sessionStorage). 접근이 던져도 된다.
 * @param {() => number} deps.now 현재 시각(ms).
 * @param {(prefix: string) => string} deps.newId 새 ID. `s` 세션 · `t` 탭.
 * @param {() => void} [deps.onStorageBlocked] 저장소 접근이 던졌을 때. 페이지에서 한 번만 불린다.
 * @return {{ stamp(): {session_id:string, tab_id:string, sequence_no:number}, reset(): string, closing(): void, reopened(): void, onSessionExpired(fn: (c: {previous: string, current: string}) => void): void, duplicated: boolean }}
 */
export function createSession({ local, session, now, newId, onStorageBlocked }) {
    /** 저장소를 못 쓰는 환경에서도 한 탭 안에서는 값이 일관되도록 메모리로 버틴다. */
    const memory = {};
    let warned = false;
    const warn = () => {
        if (warned)
            return;
        warned = true;
        try {
            onStorageBlocked?.();
        }
        catch {
            /* 진단 실패가 수집을 멈추게 하지 않는다 */
        }
    };
    /** 읽기. 저장소 → 메모리. 접근이 던지면 메모리로 내려가고 한 번 알린다. */
    const read = (store, key) => {
        try {
            const v = store.get(key);
            if (v != null)
                return v;
        }
        catch {
            warn();
        }
        return memory[key] ?? null;
    };
    /** 쓰기. 메모리에 먼저, 저장소에는 되는 만큼. */
    const write = (store, key, value) => {
        memory[key] = value;
        try {
            store.set(key, value);
        }
        catch {
            warn();
        }
    };
    const remove = (store, key) => {
        delete memory[key];
        try {
            store.remove(key);
        }
        catch {
            warn();
        }
    };
    // ── 탭 — 만들 때 한 번 정한다. 복제 판정은 이 순간에만 할 수 있다 ──
    const wasOpen = read(session, KEYS.open) === '1';
    const storedTab = read(session, KEYS.tab);
    const tabId = wasOpen || !storedTab ? newId('t') : storedTab;
    write(session, KEYS.tab, tabId);
    write(session, KEYS.open, '1');
    if (wasOpen || !storedTab)
        write(session, KEYS.seq, '0'); // 새 탭은 순번도 1 부터
    /**
     * 무활동으로 세션이 갈렸을 때 알릴 곳. `previous` 는 만료된 세션 ID. 처음 발급은 전환이 아니다 —
     * 이전 세션이 있었고 그것이 만료된 경우에만 부른다. 로그인 · 로그아웃(`reset`)은 부르는 쪽이
     * 이미 알아서 알리지 않는다.
     */
    let onExpired = null;
    /**
     * 현재 세션 ID. 무활동 30분이 지났으면 그 자리에서 새로 발급한다.
     *
     * 메모리 대체를 저장소와 똑같이 둔다. 저장소가 막힌 브라우저에서 여기만 빠지면 비활동 시간이
     * 무한대가 되어 매 이벤트마다 「만료」로 판정된다.
     */
    const currentSessionId = (t) => {
        const seen = Number.parseInt(read(local, KEYS.seen) ?? '', 10);
        const idle = Number.isFinite(seen) ? t - seen : Number.POSITIVE_INFINITY;
        const stored = read(local, KEYS.sid);
        let sid = stored && idle <= IDLE_MS ? stored : null;
        if (!sid) {
            sid = newId('s');
            write(local, KEYS.sid, sid);
            if (stored) {
                try {
                    onExpired?.({ previous: stored, current: sid });
                }
                catch {
                    /* 알림 실패가 세션 발급을 멈추게 하지 않는다 */
                }
            }
        }
        write(local, KEYS.seen, String(t));
        return sid;
    };
    /** 다음 순번. 탭마다 1 부터 1씩. */
    const nextSequence = () => {
        const prev = Number.parseInt(read(session, KEYS.seq) ?? '0', 10);
        const next = (Number.isFinite(prev) ? prev : 0) + 1;
        write(session, KEYS.seq, String(next));
        return next;
    };
    return {
        /** 복제된 탭으로 판정해 새 tab_id 를 줬는가. 시험과 진단용. */
        duplicated: wasOpen,
        /**
         * 이벤트 하나에 붙일 세 값. 이벤트를 만드는 시점에 부른다 — 부를 때마다 순번이 는다.
         * 전송 시점에 붙이면 배치 50건이 같은 순번대를 받고 세션 경계가 전송 시점으로 밀린다.
         */
        stamp() {
            return {
                session_id: currentSessionId(now()),
                tab_id: tabId,
                sequence_no: nextSequence(),
            };
        },
        /**
         * 무활동 만료로 세션이 갈릴 때 부를 함수를 등록한다. `stamp()` 안에서 불리므로, 받는 쪽이 곧바로
         * 이벤트를 보내면 안 된다 — 코어의 before_track 이 자기 자신을 다시 탄다. 한 틱 미룬다.
         * @param {(change: {previous: string, current: string}) => void} fn
         */
        onSessionExpired(fn) {
            onExpired = fn;
        },
        /**
         * 세션을 즉시 새로 발급한다. 로그인 · 로그아웃 때 서비스가 부른다.
         * @return {string} 새 세션 ID.
         */
        reset() {
            const sid = newId('s');
            write(local, KEYS.sid, sid);
            write(local, KEYS.seen, String(now()));
            return sid;
        },
        /**
         * 탭을 떠날 때(pagehide) 부른다. 「열려 있다」 표시를 지워 새로고침 · 뒤로가기가 같은 tab_id 를 잇게 한다.
         * 복제된 탭은 이 함수가 돌기 전에 베껴지므로 표시가 남아 있고, 그래서 구분된다.
         */
        closing() {
            remove(session, KEYS.open);
        },
        /**
         * 떠났던 페이지가 그대로 되살아났을 때(pageshow · bfcache) 부른다. `closing()` 이 지운 「열려 있다」 표시를
         * 다시 세운다 — 안 세우면 그 뒤에 이 탭을 복제한 탭이 같은 tab_id 와 순번을 잇는다.
         */
        reopened() {
            write(session, KEYS.open, '1');
        },
    };
}
