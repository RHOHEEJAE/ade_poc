// impression/core.js — 노출 판정의 순수 규칙. DOM 접근이 없다.
//
// 기준값 · 면적 판정 · 관찰 대상 판정 · 재발화 열쇠가 여기 있고, IntersectionObserver 배선 · 타이머 ·
// DOM 스캔은 index.ts 가 한다.
//
// .js 인 이유: 단위 시험이 빌드 없이 이 파일을 그대로 읽는다. 규칙을 시험 파일에 옮겨 적으면
// 사본이 둘이 되고, 구현이 바뀌어도 시험은 계속 통과한다.

/**
 * 판정 기준. Amplitude 의 노출 판정값(면적 100% · 시간 150ms · 재발화 1회)을 따르고,
 * 화면보다 큰 요소를 위한 예외(`oversizeViewportRatio`) 하나만 더했다.
 *
 * @typedef {{ areaRatio: number, oversizeViewportRatio: number, durationMs: number, kinds: string[] }} ImpressionOptions
 * @type {ImpressionOptions}
 */
export const DEFAULT_IMPRESSION = {
  /** 요소의 몇 할이 화면에 들어와야 하는가. */
  areaRatio: 1,
  /**
   * 요소가 화면보다 클 때만 쓰는 예외. 그런 요소는 intersectionRatio 가 구조적으로 1.0 에 도달할 수
   * 없어, 이 예외가 없으면 한 건도 잡히지 않는다. 화면 넓이의 이만큼을 요소가 덮으면 본 것으로 인정한다.
   */
  oversizeViewportRatio: 0.5,
  /** 이 시간을 넘겨야 노출로 인정한다. */
  durationMs: 150,
  /**
   * 노출을 관찰할 kind. 값의 주인은 코드젠 어휘다.
   *
   * SDK 는 어휘를 읽지 않는 층이라 런타임에 어휘 파일을 볼 수 없다. 그래서 값을 코드에서 빼서 주입
   * 가능하게 둔다. `control` 의 노출을 켜려면 `init` 에 넘기면 되고 SDK 를 고치지 않는다.
   */
  kinds: ['object'],
};

/**
 * IntersectionObserver 에 넘길 문턱 목록.
 *
 * `[1.0]` 하나만 주면 화면보다 큰 요소에서는 콜백이 아예 오지 않는다 — 비율이 1.0 을 넘나드는 순간이
 * 없기 때문이다. 예외 판정을 하려면 낮은 문턱에서도 콜백을 받아야 하므로 여러 개를 준다.
 */
export const IO_THRESHOLDS = [0, 0.25, 0.5, 0.75, 1];

/** 비율 비교의 허용 오차. 전부 보이는 요소도 0.9999… 로 오는 브라우저가 있다. */
const EPS = 1e-6;

/**
 * 화면을 차지한 정도가 기준을 넘었는지 본다.
 *
 * @param {{ intersectionRatio: number,
 *           boundingClientRect: { width: number, height: number },
 *           intersectionRect: { width: number, height: number },
 *           rootBounds: { width: number, height: number } | null }} entry
 *   IntersectionObserverEntry 에서 쓰는 네 값. 시험에서는 평범한 객체를 넣는다.
 * @param {ImpressionOptions} opt 판정 기준. `areaRatio` 와 `oversizeViewportRatio` 를 쓴다.
 * @return {boolean} 기준을 넘었으면 true. entry 가 없거나 값이 모자라면 false.
 */
export function meetsArea(entry, opt) {
  if (!entry) return false;

  const ratio = typeof entry.intersectionRatio === 'number' ? entry.intersectionRatio : 0;
  if (ratio + EPS >= opt.areaRatio) return true;

  // ── 예외: 화면보다 큰 요소 ──────────────────────────────────────────────
  const root = entry.rootBounds;
  const box = entry.boundingClientRect;
  if (!root || !box) return false;
  if (root.width <= 0 || root.height <= 0) return false;

  // 어느 한 변이라도 화면을 넘으면 비율이 1.0 에 닿을 수 없다.
  const oversize = box.width > root.width || box.height > root.height;
  if (!oversize) return false;

  const seen = entry.intersectionRect;
  if (!seen) return false;
  const covered = (seen.width * seen.height) / (root.width * root.height);
  return covered + EPS >= opt.oversizeViewportRatio;
}

/**
 * 노출을 관찰할 요소인지 본다.
 *
 * 기본은 `object` 만이다. `control` · `input` 은 끄고, 미선언 요소는 제외한다.
 * 개별 해제는 `data-ade-impression="off"` 하나뿐이다.
 *
 * @param {{ kind: string | null, impressionOff: boolean } | null} decl 요소에서 읽은 선언. 없으면 null.
 * @param {{ kinds: string[] }} [opt] 관찰할 kind 목록. 기본은 DEFAULT_IMPRESSION.
 * @return {boolean} 선언이 있고, kind 가 목록에 있고, 개별 해제되지 않았으면 true.
 */
export function isImpressionTarget(decl, opt = DEFAULT_IMPRESSION) {
  if (!decl) return false;
  if (!opt.kinds.includes(/** @type {string} */ (decl.kind))) return false;
  return decl.impressionOff !== true;
}

/**
 * 관찰 후보를 찾는 CSS 셀렉터. `isImpressionTarget` 과 같은 배열에서 만든다.
 * 한쪽만 고치면 「관찰은 붙는데 판정에서 탈락」하는 조용한 실패가 난다.
 * @param {{ kinds: string[] }} [opt] 관찰할 kind 목록. 기본은 DEFAULT_IMPRESSION.
 * @return {string} `querySelectorAll` 에 넘길 셀렉터. kind 마다 하나씩 쉼표로 잇는다.
 */
export function targetSelector(opt = DEFAULT_IMPRESSION) {
  return opt.kinds
    .map((k) => `[data-ade-kind="${k}"]:not([data-ade-impression="off"])`)
    .join(',');
}

/**
 * 「같은 것」을 가리는 열쇠. 재발화를 막는 기준이다.
 *
 * DOM 노드를 열쇠로 쓰면 리액트가 목록을 다시 그릴 때 노드가 새로 생겨 같은 배너가 또 발화한다.
 * 선언 이름과 업무ID 로 가르면 다시 그려도 값이 같다.
 *
 * @param {{ name: string, identity: Record<string, string>, identityStatic?: boolean } | null} decl 요소에서 읽은 선언.
 * @return {string | null} `이름` 또는 `이름#키=값,…` 형식의 열쇠.
 *   `null` 이면 열쇠를 만들 수 없다는 뜻이고, 부른 쪽이 요소 단위로 세야 한다. 세 경우에 그렇다 —
 *     · 이름이 없다 (선언되지 않았다)
 *     · 업무ID 값이 비어 있다. 목록 100건이 전부 빈 값이면 한 열쇠로 뭉쳐 1건만 세게 되는데,
 *       그러면 전환율의 분모가 100분의 1로 줄어든다.
 *     · 업무ID 가 아예 없는데 `identity-static` 도 아니다 — 빈 값과 같은 문제다. `data-ade-id-key` 를
 *       빠뜨린 카드 100장이 이름 하나로 뭉친다. 화면에 하나뿐인 배너는 static 을 표시해 이름만으로 센다.
 */
export function impressionKey(decl) {
  if (!decl || typeof decl.name !== 'string' || decl.name === '') return null;

  const identity = decl.identity ?? {};
  const keys = Object.keys(identity).sort();
  for (const k of keys) if (identity[k] === '') return null;

  if (keys.length === 0) return decl.identityStatic === true ? decl.name : null;
  return `${decl.name}#${keys.map((k) => `${k}=${identity[k]}`).join(',')}`;
}
