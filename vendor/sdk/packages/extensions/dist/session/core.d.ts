/** 무활동 30분이면 새 세션. 업계 공통값(Amplitude · GA4 도 30분). */
export declare const IDLE_MS: number;
/** 저장소 키. `local` 은 탭이 공유하고 `session` 은 탭마다 따로다. */
export declare const KEYS: Readonly<{
    /** localStorage — 세션 ID */
    sid: "ade.session_id";
    /** localStorage — 마지막 활동 시각(ms). 비활동 판정에 쓴다 */
    seen: "ade.session_seen_at";
    /** sessionStorage — 탭 ID */
    tab: "ade.tab_id";
    /**
     * sessionStorage — 「이 탭이 열려 있다」 표시. 페이지가 뜨면 세우고 떠날 때 지운다.
     * 뜨는 순간 이미 서 있으면 복제된 탭이다 — 복제는 sessionStorage 를 통째로 베끼는데 원본 탭이
     * 아직 열려 있어 표시가 안 지워졌기 때문. 그때는 새 tab_id 를 준다.
     * (벤더가 자기 tab_id 를 만들 때 쓰는 것과 같은 요령이다.)
     */
    open: "ade.tab_open";
    /** sessionStorage — 순번 카운터 */
    seq: "ade.seq";
}>;
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
export declare function createSession({ local, session, now, newId, onStorageBlocked }: {
    local: {
        get(k: string): string | null;
        set(k: string, v: string): void;
        remove(k: string): void;
    };
    session: {
        get(k: string): string | null;
        set(k: string, v: string): void;
        remove(k: string): void;
    };
    now: () => number;
    newId: (prefix: string) => string;
    onStorageBlocked?: () => void;
}): {
    stamp(): {
        session_id: string;
        tab_id: string;
        sequence_no: number;
    };
    reset(): string;
    closing(): void;
    reopened(): void;
    onSessionExpired(fn: (c: {
        previous: string;
        current: string;
    }) => void): void;
    duplicated: boolean;
};
