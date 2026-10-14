// 코어가 확장에 넘기는 것. @adestack/sdk 의 ExtensionContext 와 같은 모양이다.
//
// 코어를 import 하지 않고 같은 모양으로 선언한다 — 확장이 코어에 의존하면 빌드 순서가 꼬이고,
// 구조가 같으면 TypeScript 가 맞춰 준다. 세 확장(impression · session · system)이 이 한 선언을 쓴다.

export type ExtensionContext = {
  /** 이벤트 하나를 벤더로 보낸다. 벤더가 아직 없으면 버리고 진단만 남긴다. */
  track: (event: string, props: Record<string, unknown>, opts?: { sendImmediately?: boolean }) => void;
  /** 진단 사유 하나. 값은 싣지 않는다. */
  report: (reason: string) => void;
  /** 자기 수집 서버 주소. 관찰에서 자기 요청을 빼는 데 쓴다(system) — 안 빼면 순환한다. */
  apiHost: string;
};
