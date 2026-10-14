import { VITALS } from './core.js';
import type { ExtensionContext } from '../context.js';
export type { ExtensionContext };
export type SystemHandle = {
    stop: () => void;
};
/** 항목별 켜고 끄기. 기본은 둘 다 켠다. 통신이 잦은 앱에서 부담이 크면 `network: false`. */
export type SystemOptions = {
    network?: boolean;
    vitals?: boolean;
};
export type SystemExtension = {
    name: 'system';
    init: (ctx: ExtensionContext) => SystemHandle;
};
/**
 * 시스템 기록 확장을 만든다. `adesdk.init({ extensions: [system()] })` 에 넘긴다.
 *
 * @param options 항목별 켜고 끄기.
 * @return 확장 객체. 코어가 `init` 을 부르면 관찰이 시작된다. 두 번 init 하면 앞 관찰을 멈추고 새로 건다.
 */
export declare function system(options?: SystemOptions): SystemExtension;
export type SystemObserverOpts = SystemOptions & {
    /** 기록 하나를 내보낸다. 벤더 호출은 부른 쪽이 한다. */
    emit: (eventName: string, props: Record<string, unknown>) => void;
    /** 자기 수집 서버. 이 주소로 나간 요청은 관찰에서 뺀다 — 안 하면 순환한다. */
    apiHost?: string;
};
/**
 * 통신 결과 · 웹 성능 관찰을 시작한다. 관찰자 실패가 사용자 서비스를 중단시키지 않는다 —
 * 모든 콜백이 try/catch 안에 있고, 세울 수 없으면 조용히 아무것도 하지 않는다.
 *
 * @param opts 기록을 내보낼 `emit`, 자기 서버 `apiHost`, 끄기 `network` · `vitals`.
 * @return `stop` 하나뿐인 손잡이. 세울 수 없으면 아무것도 안 하는 손잡이.
 */
export declare function startSystemObserver(opts: SystemObserverOpts): SystemHandle;
export { VITALS };
