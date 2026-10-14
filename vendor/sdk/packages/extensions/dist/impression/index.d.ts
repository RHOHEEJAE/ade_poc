import { type ImpressionOptions } from './core.js';
/** 기준값의 정의는 core.js 하나뿐이다. 여기서 다시 적으면 사본이 둘이 된다. */
export type { ImpressionOptions };
import type { ExtensionContext } from '../context.js';
export type { ExtensionContext };
/**
 * 노출 확장. `init` 은 코어가 벤더를 띄우기 직전에 부른다 — init 안에서 `ctx.track` 을 부르면 벤더가 없어
 * 버려진다. 관찰자 콜백은 전부 비동기라 실제 track 은 벤더가 뜬 뒤에만 돈다. `reset` · `scan` 은 init 뒤에만
 * 동작한다 — SPA 라우트 전환에서 `reset()` 을 부르려면 서비스가 이 객체를 들고 있으면 된다.
 */
export type ImpressionExtension = {
    name: 'impression';
    init: (ctx: ExtensionContext) => ImpressionObserver;
    /** 「이미 셌다」 기록을 지우고 다시 훑는다. 화면을 통째로 갈아 끼울 때만. init 전에는 아무 일도 안 한다. */
    reset: () => void;
    /** 주어진 뿌리 아래를 다시 훑어 관찰에 붙인다. init 전에는 아무 일도 안 한다. */
    scan: (root?: ParentNode) => void;
};
/**
 * 노출 확장을 만든다. `adesdk.init({ extensions: [impression()] })` 에 넘긴다.
 *
 * 이벤트 이름 `$ade_impression` 은 여기서 붙인다. 관찰자 본체는 `startImpressionObserver`.
 *
 * @param options 판정 기준. 기본값은 면적 100% · 150ms. 팀이 값을 바꾸면 여기만 넘긴다.
 * @return 확장 객체. 코어가 `init` 을 부르면 관찰이 시작된다. 같은 객체를 두 번 init 하면 앞 관찰을 멈추고 새로 건다.
 */
export declare function impression(options?: Partial<ImpressionOptions>): ImpressionExtension;
export type ImpressionProps = Record<string, unknown>;
export type ImpressionObserverOpts = {
    /** 판정이 선 이벤트 하나를 내보낸다. 벤더 호출은 부른 쪽이 한다. */
    emit: (props: ImpressionProps) => void;
    /** 진단 사유 하나. 값은 싣지 않는다. 없으면 조용히 넘어간다. */
    report?: (reason: string) => void;
    options?: Partial<ImpressionOptions>;
    /** 관찰 대상을 찾을 뿌리. 기본은 document. */
    root?: ParentNode;
};
export type ImpressionObserver = {
    /** 지금 붙어 있는 것을 모두 떼고 멈춘다. */
    stop: () => void;
    /** 「이미 셌다」 기록을 지운다. SPA 에서 화면을 갈아 끼울 때 부른다. */
    reset: () => void;
    /** 주어진 뿌리 아래에서 대상을 찾아 관찰에 붙인다. */
    scan: (root?: ParentNode) => void;
};
/**
 * 노출 관찰을 시작한다. 브라우저가 IntersectionObserver 를 모르면 조용히 아무것도 하지 않는다.
 *
 * [규약] 이 파일의 어떤 콜백도 예외를 밖으로 내보내지 않는다. 관찰자 콜백은 브라우저가 직접 부르는
 * 자리라, 여기서 던지면 서비스 페이지의 `window.onerror` 로 튄다.
 *
 * @param opts 판정이 선 이벤트를 받을 `emit`, 기준값 `options`, 관찰 뿌리 `root`.
 * @return 관찰자 손잡이(`stop` · `reset` · `scan`). 세울 수 없으면 아무것도 안 하는 손잡이.
 */
export declare function startImpressionObserver(opts: ImpressionObserverOpts): ImpressionObserver;
