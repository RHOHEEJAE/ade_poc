// system/index.ts — 통신 결과 · 웹 성능 확장. 시스템 기록(`record_type: system`)을 낸다.
//
// Mixpanel 은 이 둘을 이벤트로 주지 않는다 — 통신은 세션 리플레이 녹화에만 들어가고 웹 성능은 아예
// 없다. 서비스가 `adesdk.init({ extensions: [system()] })` 으로 붙인다.
//
//   통신 결과   $ade_network     PerformanceObserver('resource') — fetch · XHR 만
//   웹 성능     $ade_web_vital   PerformanceObserver(paint · navigation · LCP · CLS · INP)
//
// 세션 전환(`$ade_session_change`)은 여기가 아니라 session 확장이 보낸다 — 세션이 갈리는 걸 아는 쪽이 거기다.
//
// 앱의 통신 경로에 우리 코드를 끼우지 않는다. fetch · XHR 을 감싸면 그 코드가 실패할 때 사용자 서비스가
// 멈춘다. PerformanceObserver 는 읽기만 한다. 대가로 HTTP 메서드는 못 얻고 `responseStatus` 는
// 브라우저 지원이 갈린다 — 없는 것은 이 방식의 결과이지 빠뜨린 것이 아니다.
//
// 규칙(주소 정리 · 자기 서버 제외 · CLS 누적 · 반올림)은 core.js 가 갖는다. 여기는 배선만 한다.

import { VITALS, accumulateCls, roundVital, toNetworkRecord } from './core.js';

import type { ExtensionContext } from '../context.js';
export type { ExtensionContext };

export type SystemHandle = { stop: () => void };

/** 항목별 켜고 끄기. 기본은 둘 다 켠다. 통신이 잦은 앱에서 부담이 크면 `network: false`. */
export type SystemOptions = { network?: boolean; vitals?: boolean };

export type SystemExtension = {
  name: 'system';
  init: (ctx: ExtensionContext) => SystemHandle;
};

/** 세 축은 관찰로 알아낸 사실이라 observed · auto 다. 보장형처럼 제공하지 않는다. */
const SYSTEM_AXES = {
  record_type: 'system',
  collection_grade: 'observed',
  collection_source: 'auto',
} as const;

/**
 * 시스템 기록 확장을 만든다. `adesdk.init({ extensions: [system()] })` 에 넘긴다.
 *
 * @param options 항목별 켜고 끄기.
 * @return 확장 객체. 코어가 `init` 을 부르면 관찰이 시작된다. 두 번 init 하면 앞 관찰을 멈추고 새로 건다.
 */
export function system(options?: SystemOptions): SystemExtension {
  let handle: SystemHandle | null = null;
  return {
    name: 'system',
    init: (ctx) => {
      handle?.stop();
      handle = startSystemObserver({
        ...(options ?? {}),
        apiHost: ctx.apiHost,
        emit: (eventName, props) => ctx.track(eventName, props),
      });
      return handle;
    },
  };
}

export type SystemObserverOpts = SystemOptions & {
  /** 기록 하나를 내보낸다. 벤더 호출은 부른 쪽이 한다. */
  emit: (eventName: string, props: Record<string, unknown>) => void;
  /** 자기 수집 서버. 이 주소로 나간 요청은 관찰에서 뺀다 — 안 하면 순환한다. */
  apiHost?: string;
};

/**
 * PerformanceObserver 하나를 세운다. 지원하지 않는 항목은 조용히 건너뛴다.
 *
 * 브라우저마다 지원이 갈리는데, 없는 것을 부르다 던지면 나머지 관찰까지 함께 죽는다.
 *
 * @param type 관찰할 항목 종류(`resource` · `paint` · `navigation` · `largest-contentful-paint` · `layout-shift` · `event`).
 * @param cb 항목이 쌓일 때마다 받을 콜백. 안에서 던져도 밖으로 나가지 않는다.
 * @param extra `observe()` 에 더 넘길 옵션(예: `durationThreshold`).
 * @return 세운 관찰자. 이 브라우저가 모르는 종류면 null.
 */
function observe(
  type: string,
  cb: (entries: PerformanceEntryList) => void,
  extra: Record<string, unknown> = {},
): PerformanceObserver | null {
  try {
    const po = new PerformanceObserver((list) => {
      try {
        cb(list.getEntries());
      } catch {
        /* 관찰자 콜백은 브라우저가 직접 부른다. 여기서 던지면 서비스 페이지로 튄다 */
      }
    });
    po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    return po;
  } catch {
    return null; // 이 브라우저가 모르는 종류다
  }
}

/**
 * 통신 결과 · 웹 성능 관찰을 시작한다. 관찰자 실패가 사용자 서비스를 중단시키지 않는다 —
 * 모든 콜백이 try/catch 안에 있고, 세울 수 없으면 조용히 아무것도 하지 않는다.
 *
 * @param opts 기록을 내보낼 `emit`, 자기 서버 `apiHost`, 끄기 `network` · `vitals`.
 * @return `stop` 하나뿐인 손잡이. 세울 수 없으면 아무것도 안 하는 손잡이.
 */
export function startSystemObserver(opts: SystemObserverOpts): SystemHandle {
  const noop: SystemHandle = { stop: () => {} };

  try {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return noop;

    const observers: PerformanceObserver[] = [];
    const keep = (po: PerformanceObserver | null) => {
      if (po) observers.push(po);
    };
    /** stop() 이 떼야 하는 리스너. 안 떼면 재init 때 옛 것과 새 것이 각자 LCP · CLS 를 보내 「페이지뷰마다 한 번」이 깨진다. */
    const teardown: Array<() => void> = [];

    // ── 통신 결과 ─────────────────────────────────────────────────────────
    if (opts.network !== false) {
      keep(
        observe('resource', (entries) => {
          for (const e of entries) {
            const rec = toNetworkRecord(e as PerformanceResourceTiming, {
              apiHost: opts.apiHost,
              base: location.href,
            });
            if (rec) opts.emit('$ade_network', { ...SYSTEM_AXES, ...rec });
          }
        }),
      );
    }

    // ── 웹 성능 — 외부 라이브러리를 쓰지 않는다. 번들 크기와 의존성 때문이다 ──
    if (opts.vitals !== false) {
      /** 페이지뷰 단위로 한 번씩만 보낸다. 값이 갱신돼도 다시 보내지 않는다. */
      const sent = new Set<string>();
      const send = (name: string, raw: number) => {
        if (sent.has(name)) return;
        const value = roundVital(name, raw);
        if (value === null) return;
        sent.add(name);
        opts.emit('$ade_web_vital', { ...SYSTEM_AXES, vital_name: name, vital_value: value });
      };

      // FCP — 첫 내용이 그려진 시각
      keep(
        observe('paint', (entries) => {
          for (const e of entries) if (e.name === 'first-contentful-paint') send('FCP', e.startTime);
        }),
      );
      // TTFB — 첫 바이트까지. navigation 항목에서 바로 나온다
      keep(
        observe('navigation', (entries) => {
          const nav = entries[0] as PerformanceNavigationTiming | undefined;
          if (nav) send('TTFB', nav.responseStart);
        }),
      );
      // LCP — 가장 큰 내용이 그려진 시각. 마지막 값이 정답이라 페이지를 떠날 때 보낸다
      let lcp = 0;
      keep(
        observe('largest-contentful-paint', (entries) => {
          const last = entries[entries.length - 1];
          if (last) lcp = last.startTime;
        }),
      );
      // CLS — 레이아웃 이동의 누적. 사용자 입력 직후의 이동은 세지 않는다
      let cls = 0;
      keep(
        observe('layout-shift', (entries) => {
          for (const e of entries) cls = accumulateCls(cls, e as unknown as Record<string, unknown>);
        }),
      );
      // INP — 상호작용에서 다음 그리기까지. 정식 INP 가 아니라 근사값이다 — 표준은 상위 백분위를 쓰는데
      // 여기서는 가장 오래 걸린 하나를 쓴다. 외부 라이브러리를 안 쓰는 대가이고, 그래서 이름에 담는다.
      let inp = 0;
      keep(
        observe(
          'event',
          (entries) => {
            for (const e of entries) {
              const d = (e as PerformanceEventTiming).duration;
              if (Number.isFinite(d) && d > inp) inp = d;
            }
          },
          { durationThreshold: 40 },
        ),
      );

      /** 페이지를 떠날 때 마지막에 확정되는 셋(LCP · CLS · INP)을 보낸다. 두 번 불려도 `send` 가 막는다. */
      const flushLate = () => {
        if (lcp > 0) send('LCP', lcp);
        send('CLS', cls); // 0 도 의미 있는 값이다 — 흔들림이 없었다는 뜻
        if (inp > 0) send('INP_MAX', inp);
      };
      // pagehide 는 모바일에서 beforeunload 보다 확실히 불린다
      const onHidden = () => {
        if (document.visibilityState === 'hidden') flushLate();
      };
      window.addEventListener('pagehide', flushLate, { capture: true });
      document.addEventListener('visibilitychange', onHidden);
      teardown.push(() => {
        window.removeEventListener('pagehide', flushLate, { capture: true });
        document.removeEventListener('visibilitychange', onHidden);
      });
    }

    return {
      /** 세운 PerformanceObserver 와 떠날 때 리스너를 전부 뗀다. 재init 은 새로 세운 것만 남긴다. */
      stop: () => {
        for (const po of observers) {
          try {
            po.disconnect();
          } catch {
            /* 멈추다 실패해도 더 할 수 있는 일이 없다 */
          }
        }
        for (const off of teardown) {
          try {
            off();
          } catch {
            /* 위와 같다 */
          }
        }
      },
    };
  } catch {
    return noop; // 관찰자를 못 세우는 것이 페이지를 멈추는 이유가 되지 않는다
  }
}

export { VITALS };
