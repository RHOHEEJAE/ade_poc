# @adestack/contract — 선언 읽기 · 민감 요소 판정

코드젠이 심은 `data-ade-*` 선언을 읽는 규칙과 민감 요소 판정. 코어(`@adestack/sdk` 의 자동수집 훅)와
노출 확장(`@adestack/extensions` 의 impression)이 **같은 규칙**을 써야 해서 패키지로 뗐다. 확장이 아니다 —
이벤트를 만들지 않는 순수 함수 묶음이라 `init` 이 없다.

- `src/contract.ts` — `readDeclaration` · `resolveCollect` · `resolveIdentityMode` · `resolveVerdict` · `FIXED_ATTRS` · `CONTRACT_VERSION`
- `src/version.ts` — `isCompatibleVersion` (인계 계약 §1-3, npm `^` 규칙). 번들의 규칙 버전과 이 패키지 버전을 맞춰 볼 때 쓴다
- `src/safety.ts` — `isSensitiveElement` · `applyMask`
- `src/index.ts` — 셋을 다시 내보낸다. 코어와 impression 은 이 패키지만 import 한다

**임시 구현이다.** 코드젠이 배포할 `@adestack/core/contract` 로 교체한다(ADR-006 한 엔진, 세 입구).
교체 시 바꾸는 것은 이 패키지를 가리키는 import 한 줄뿐이어야 한다. 그래서 패키지 자리에 둔다.

## 시험

```
pnpm build && node --test packages/contract/test/*.test.mjs
```

`contract.test.mjs` 는 `dist/` 의 **실제 함수**를 부른다. `contract.rules.test.mjs` 는 인계 계약 §1~§4 의
판정표를 문서와 대조한다. 루트 `test/fixed-attrs.test.mjs` 는 `FIXED_ATTRS` 와 코어의
`capture_extra_attrs` 가 한 목록인지 본다.
