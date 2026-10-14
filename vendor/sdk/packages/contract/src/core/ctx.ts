// @adestack/core — 조상 슬롯 목록 자료구조 (DA-100 에서 만들고 DA-104 에서 core 로 옮겼다).
//
// 조상이 선언한 업무ID 를 안쪽 요소에 전달할 때 쓰는 목록이다(02 빌드 주입 §4-1).
// 이 목록을 쌓는 경로가 둘이다.
// 빌드 경로는 컴포넌트 경계를 넘는 prop 으로 쌓는다(`adePush`, `@adestack/placement`).
// 런타임 폴백 경로는 DOM 조상 체인을 읽어 쌓는다(`collectCtx`, `@adestack/core/inject`).
// 목록을 속성 하나로 합치는 `foldSlots` 는 두 경로가 같은 함수를 쓴다.
//
// 자료구조를 core 에 둔 이유는 런타임 폴백이 빌드 플러그인을 의존하지 않게 하기 위해서다.
// 수집 SDK 가 `@adestack/placement` 를 불러오면 빌드 도구가 서비스팀의 런타임 의존성이 된다.
// 빌드 도구를 서비스팀의 런타임 의존성으로 만들지 않기로 한 결정이 근거다(ADR-023 ①).

/** 조상 하나의 기록. 업무ID 만 담는다(props 는 담지 않는다). */
export type CtxFrame = {
  /** 이 조상이 선언한 업무ID 키. role 이 있으면 그 role 의 identity_attr 다. */
  key: string;
  /** 값. 런타임에 undefined 면 속성으로 합칠 때 빈 문자열이 된다. 키는 그대로 남는다. */
  value: string | undefined;
  /**
   * 선언 위치. 진단에만 쓰고 DOM 속성으로는 내보내지 않는다(02 빌드 주입 §4-1).
   *
   * 지금은 두 경로 모두 이 값을 채우지 않는다. 명세가 선택 항목으로 두었기 때문이다.
   * 채우면 다중 부모(ADE-504) 진단이 어긋난 조상의 줄 번호를 함께 알릴 수 있다.
   * 그 진단을 넓히는 티켓이 생길 때 채운다.
   */
  origin?: { file: string; line: number };
};

/** 바깥쪽 조상이 뒤, 안쪽 조상이 앞이다. push 는 앞에 넣는다. */
export type Ctx = CtxFrame[];
