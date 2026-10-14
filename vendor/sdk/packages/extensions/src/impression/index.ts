// impression/index.ts — 노출 관찰 확장. 선언 요소가 화면에 기준 시간 이상 보이면 `$ade_impression` 을 보낸다.
//
// Mixpanel 자동수집에는 노출이라는 개념 자체가 없다(click · input · submit · scroll · pageview 다섯뿐).
// 그래서 이 확장만은 벤더 위에 얹는 것이 아니라 처음부터 우리가 만든다. 서비스가
// `adesdk.init({ extensions: [impression()] })` 으로 붙이고, 코어가 넘기는 track · report 만 쓴다.
//
// 판정 규칙(기준값 · 면적 · 대상 · 열쇠)은 core.js 가 갖는다. 여기는 배선만 한다 — 무엇을 관찰할지
// 고르고, 시간을 재고, 판정이 서면 이벤트를 하나 만든다.
//
// 선언은 「화면에 들어온 순간」에 읽어 둔다. IntersectionObserver 콜백은 비동기라, 요소가 사라지면서
// 콜백이 돌면 그 시점에는 조상 체인이 이미 끊겨 있다. 발화 시점에 DOM 을 다시 읽으면 늦다.
// 나가면 버린다 — 목록이 같은 노드를 다른 항목에 재사용하면 선언이 바뀌므로, 다시 들어올 때 다시 읽는다.

import {
  DEFAULT_IMPRESSION,
  IO_THRESHOLDS,
  impressionKey,
  isImpressionTarget,
  meetsArea,
  targetSelector,
  type ImpressionOptions,
} from './core.js';
import {
  readDeclaration,
  resolveCollect,
  resolveIdentityMode,
  resolveVerdict,
  type Declaration,
  type IdentityMode,
  type Verdict,
  isSensitiveElement,
  dropLongDeclarationValues,
} from '@adestack/contract';

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
export function impression(options?: Partial<ImpressionOptions>): ImpressionExtension {
  let observer: ImpressionObserver | null = null;
  return {
    name: 'impression',
    init: (ctx) => {
      // adesdk.init 을 두 번 부르는 SPA 에서 앞 관찰자가 살아 있으면 같은 요소가 두 번 발화한다.
      observer?.stop();
      observer = startImpressionObserver({
        options,
        emit: (props) => ctx.track('$ade_impression', props),
        report: ctx.report,
      });
      return observer;
    },
    reset: () => observer?.reset(),
    scan: (root) => observer?.scan(root),
  };
}

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

/** 화면에 들어온 순간에 떠 둔 선언. 발화 시점에는 이 값을 쓴다. */
type Snapshot = {
  decl: Declaration;
  grade: IdentityMode;
  verdict: Verdict;
  reason: string | null;
  key: string | null;
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
export function startImpressionObserver(opts: ImpressionObserverOpts): ImpressionObserver {
  const noop: ImpressionObserver = { stop: () => {}, reset: () => {}, scan: () => {} };

  try {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return noop;

    const cfg: ImpressionOptions = { ...DEFAULT_IMPRESSION, ...(opts.options ?? {}) };
    const rootNode: ParentNode = opts.root ?? document;
    /** 관찰 후보 셀렉터. 판정 함수와 같은 kinds 배열에서 만든다. */
    const TARGET_SELECTOR = targetSelector(cfg);

    /** 열쇠를 만들 수 있는 요소는 열쇠로, 못 만드는 요소는 노드 자체로 센다. */
    const seenKeys = new Set<string>();
    let seenNodes = new WeakSet<Element>();

    /** 화면에 머무는 중인 요소의 타이머. 나가면 취소한다. */
    const timers = new Map<Element, ReturnType<typeof setTimeout>>();
    /** 들어온 순간에 읽어 둔 선언. */
    const snapshots = new Map<Element, Snapshot>();
    /** 기준을 넘긴 채 화면에 있는 요소. 탭에서 돌아왔을 때 여기부터 다시 잰다. */
    const visible = new Set<Element>();
    /** 이미 관찰에 붙인 요소. 같은 요소를 두 번 붙이지 않는다. */
    const observed = new WeakSet<Element>();

    /**
     * 이미 센 요소인지 본다. 열쇠가 있으면 열쇠로, 없으면 노드로 본다.
     * @param el 관찰 중인 요소.
     * @param key `impressionKey` 가 만든 열쇠. 못 만들었으면 null.
     * @return 한 번 센 것이면 true.
     */
    const alreadySeen = (el: Element, key: string | null): boolean =>
      key === null ? seenNodes.has(el) : seenKeys.has(key);

    /**
     * 「셌다」고 기록한다. `alreadySeen` 과 같은 기준으로 나눠 넣는다.
     * @param el 관찰 중인 요소.
     * @param key `impressionKey` 가 만든 열쇠. 못 만들었으면 null.
     */
    const markSeen = (el: Element, key: string | null): void => {
      if (key === null) seenNodes.add(el);
      else seenKeys.add(key);
    };

    /**
     * 재던 시간을 버린다. 타이머가 없으면 아무 일도 하지 않는다.
     * @param el 화면에 머무는 중이던 요소.
     */
    const clearTimer = (el: Element): void => {
      const t = timers.get(el);
      if (t !== undefined) {
        clearTimeout(t);
        timers.delete(el);
      }
    };

    /**
     * 요소를 관찰에서 완전히 뗀다. 한 번 셌거나 더 볼 이유가 없을 때 부른다.
     * `observed` 에서 빼므로 다음 `scan` 에서 다시 붙을 수 있다.
     * @param el 뗄 요소.
     */
    const drop = (el: Element): void => {
      io.unobserve(el);
      observed.delete(el);
      snapshots.delete(el);
      visible.delete(el);
    };

    /**
     * 화면에 들어온 순간의 선언을 뜬다. 클릭 경로(코어)와 같은 순서다 —
     * ① 수집 제한 → ② 요소 검사 → ③ 선언 읽기 · 길이 검사 → ④ 판정.
     * @param el 화면에 들어온 요소.
     * @return 선언 · 등급 · 판정 · 열쇠를 담은 스냅샷. 관찰을 이어갈 수 없으면 null
     *   (수집 금지 · 민감 요소 · 대상 아님 · 판정이 collection_failed).
     */
    const snapshot = (el: Element): Snapshot | null => {
      const collect = resolveCollect(el);
      if (collect === 'deny' || collect === 'skip') return null;

      // mask 는 이벤트를 남기고 값만 지우는 것인데, 노출 이벤트는 처음부터 텍스트 · 주소를
      // 싣지 않는다. 지울 것이 없으므로 여기서 따로 하는 일이 없다.

      const unsafe = isSensitiveElement(el);
      if (unsafe) return null;

      const decl = readDeclaration(el);
      // 실행 중 DOM 값의 길이는 판정 앞에서 뺀다 — 등급 · 판정이 identity 유무로 갈리기 때문이다.
      for (const at of dropLongDeclarationValues(decl)) opts.report?.(`declaration_value_too_long:${at}`);
      if (!isImpressionTarget(decl, cfg)) return null;

      const d = decl as Declaration;
      const { verdict, reason } = resolveVerdict(el, d, unsafe);
      if (verdict === 'collection_failed') return null;

      return { decl: d, grade: resolveIdentityMode(d), verdict, reason, key: impressionKey(d) };
    };

    /**
     * 기준 시간을 채웠을 때 노출 이벤트 하나를 내보낸다. 타이머가 부른다.
     * 그 사이 같은 열쇠가 다른 요소로 이미 셌으면 내보내지 않는다.
     * @param el 기준을 채운 요소.
     * @param snap 들어온 순간에 떠 둔 선언. 발화 시점에 DOM 을 다시 읽지 않는다.
     */
    const fire = (el: Element, snap: Snapshot): void => {
      try {
        timers.delete(el);
        if (alreadySeen(el, snap.key)) {
          drop(el);
          return;
        }
        markSeen(el, snap.key);

        opts.emit({
          record_type: 'behavior',
          // 선언이 있어야만 발화하므로 자동수집(auto)이 아니라 코드젠 경로다.
          collection_source: 'codegen',
          collection_grade: snap.grade,
          verdict: snap.verdict,
          ...(snap.reason ? { verdict_reason: snap.reason } : {}),
          ade_declaration: snap.decl, // 구조 그대로. 평탄화하지 않는다
          // 어느 기준으로 판정한 값인지 함께 싣는다. 기본값을 바꾼 뒤에도
          // 예전 기록이 어떤 규칙으로 만들어졌는지 알 수 있어야 한다.
          impression_area_ratio: cfg.areaRatio,
          impression_duration_ms: cfg.durationMs,
        });

        // 한 번 세고 나면 더 볼 이유가 없다. 목록이 긴 화면에서 부담이 줄어든다.
        drop(el);
      } catch {
        /* 노출 하나를 놓치는 것이 페이지를 멈추는 것보다 낫다 */
      }
    };

    /**
     * 요소가 기준 면적을 넘겨 화면에 들어왔다. 선언을 뜨고 시간을 재기 시작한다.
     * 선언을 뜰 수 없거나 이미 센 것이면 관찰에서 뗀다.
     * @param el 들어온 요소.
     */
    const enter = (el: Element): void => {
      if (timers.has(el)) return; // 이미 재고 있다

      let snap = snapshots.get(el);
      if (!snap) {
        const made = snapshot(el);
        if (!made) {
          drop(el);
          return;
        }
        snapshots.set(el, made);
        snap = made;
      }
      if (alreadySeen(el, snap.key)) {
        drop(el);
        return;
      }

      const s = snap;
      timers.set(
        el,
        setTimeout(() => fire(el, s), cfg.durationMs),
      );
    };

    /**
     * 요소가 기준 면적 아래로 나갔다. 재던 시간과 떠 둔 선언을 버린다 — 다시 들어오면 처음부터 재고
     * 선언도 다시 읽는다. 목록이 이 노드를 다른 항목에 재사용했으면 그때의 선언이 맞다.
     * @param el 나간 요소.
     */
    const leave = (el: Element): void => {
      clearTimer(el);
      visible.delete(el);
      snapshots.delete(el);
    };

    /**
     * 교차 관찰자. 항목마다 면적 기준을 보고 `enter` 또는 `leave` 로 보낸다.
     * 숨은 탭에서는 시간만 버리고 아무것도 세지 않는다.
     */
    const io = new IntersectionObserver(
      (entries) => {
        try {
          // 다른 탭에 있는 동안은 세지 않는다. 브라우저는 숨은 탭의 요소도
          // "화면 안"으로 보고하므로, 이 문이 없으면 열어만 둔 탭에서 노출이 쌓인다.
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            // 시간은 재지 않되 「화면에 있다 · 없다」는 그대로 따라간다. 돌아왔을 때 `visible` 에 남은 것부터
            // 다시 재므로, 숨은 사이에 나간 요소(SPA 재렌더로 지워진 카드)를 여기서 빼지 않으면
            // 돌아온 뒤 화면에 없는 요소가 노출로 세어진다.
            for (const e of entries) {
              if (e.isIntersecting && meetsArea(e, cfg)) {
                visible.add(e.target);
                clearTimer(e.target);
              } else {
                leave(e.target);
              }
            }
            return;
          }
          for (const e of entries) {
            if (e.isIntersecting && meetsArea(e, cfg)) {
              visible.add(e.target);
              enter(e.target);
            } else {
              leave(e.target);
            }
          }
        } catch {
          /* 브라우저가 직접 부르는 자리다. 여기서 던지면 서비스 페이지로 튄다 */
        }
      },
      { root: null, rootMargin: '0px', threshold: IO_THRESHOLDS },
    );

    /**
     * 주어진 뿌리 아래에서 관찰 대상을 찾아 교차 관찰자에 붙인다.
     * 이미 붙인 요소는 건너뛴다. 뿌리 자신이 대상이면 그것도 붙인다.
     * @param from 훑기 시작점. 기본은 관찰자를 세울 때 받은 뿌리(document).
     */
    const scan = (from: ParentNode = rootNode): void => {
      try {
        if (!from || typeof from.querySelectorAll !== 'function') return;
        // from 자신이 대상일 수 있다. MutationObserver 가 넘겨주는 노드가 그렇다.
        if (
          typeof (from as Element).matches === 'function' &&
          (from as Element).matches(TARGET_SELECTOR) &&
          !observed.has(from as Element)
        ) {
          observed.add(from as Element);
          io.observe(from as Element);
        }
        for (const el of Array.from(from.querySelectorAll(TARGET_SELECTOR))) {
          if (observed.has(el)) continue;
          observed.add(el);
          io.observe(el);
        }
      } catch {
        /* 훑기에 실패해도 이미 붙은 관찰은 계속 돈다 */
      }
    };

    // ── 새로 붙는 요소 ────────────────────────────────────────────────────
    // 목록은 스크롤하면서 늘어난다. 첫 훑기만으로는 나중에 붙은 카드를 못 본다.
    /** DOM 변경 관찰자. 새로 붙은 요소를 `scan` 에 넘긴다. 브라우저가 모르면 null. */
    const mo =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            try {
              for (const r of records) {
                for (const node of Array.from(r.addedNodes)) {
                  if (node.nodeType === 1) scan(node as Element);
                }
              }
            } catch {
              /* 위와 같다 */
            }
          });

    // ── 탭 전환 ───────────────────────────────────────────────────────────
    // 숨을 때 재던 시간을 버리고, 돌아오면 아직 화면에 있는 것부터 다시 잰다.
    /** 탭이 숨거나 돌아올 때. 숨으면 시간을 버리고, 돌아오면 화면에 남은 것부터 다시 잰다. */
    const onVisibility = (): void => {
      try {
        if (document.visibilityState === 'hidden') {
          for (const el of Array.from(timers.keys())) clearTimer(el);
        } else {
          for (const el of Array.from(visible)) enter(el);
        }
      } catch {
        /* 위와 같다 */
      }
    };

    /** stop() 이 돌았는가. DOM 준비를 기다리던 중에 멈추면 뒤늦게 온 DOMContentLoaded 가 켜면 안 된다. */
    let stopped = false;

    /** 첫 훑기 · DOM 변경 관찰 · 탭 전환 감지를 한꺼번에 켠다. DOM 이 준비된 뒤에 부른다. */
    const startAll = (): void => {
      if (stopped) return;
      scan();
      if (mo && document.body) mo.observe(document.body, { childList: true, subtree: true });
      document.addEventListener('visibilitychange', onVisibility);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startAll, { once: true });
    } else {
      startAll();
    }

    return {
      /** 타이머 · 교차 관찰 · DOM 변경 관찰 · 탭 전환 감지를 모두 떼고 멈춘다. */
      stop: () => {
        try {
          stopped = true;
          for (const el of Array.from(timers.keys())) clearTimer(el);
          io.disconnect();
          mo?.disconnect();
          document.removeEventListener('DOMContentLoaded', startAll);
          document.removeEventListener('visibilitychange', onVisibility);
        } catch {
          /* 멈추다 실패해도 더 할 수 있는 일이 없다 */
        }
      },
      /** 「이미 셌다」 기록을 비우고 DOM 을 다시 훑는다. SPA 라우트 전환용. */
      reset: () => {
        seenKeys.clear();
        snapshots.clear();
        // WeakSet 은 비울 수 없다. 갈아 끼우지 않으면 열쇠를 못 만든 요소(업무ID 가
        // 빈 값인 경우)는 리셋 뒤에도 영영 다시 세어지지 않는다.
        seenNodes = new WeakSet<Element>();
        // 한 번 센 요소는 fire() 에서 unobserve 했다. 다시 훑지 않으면 DOM 에 그대로
        // 남아 있는 요소(라우트 캐시 · keep-alive 목록)는 리셋해도 아무 일이 없다.
        scan();
      },
      scan,
    };
  } catch {
    return noop; // 관찰자를 못 세우는 것이 페이지를 멈추는 이유가 되지 않는다
  }
}
