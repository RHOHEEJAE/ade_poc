# @adestack/name

벤더 제품명을 우리 이름으로 바꾸는 단일 규칙(개발명세 §1.1). `$mp_click → $ade_click`, `mp_lib → ade_lib`.

- `src/index.js` — `adeName` · `adeVendorMask` · `isVendorLeak`. plain ESM `.js` 다 — SDK(브라우저)와
  중계 서버(Node)가 빌드 없이 같은 파일을 import 해야 2단 적용이 한 규칙으로 돈다

매핑표를 두지 않는다. 접두어 규칙이라 벤더가 `$mp_` 로 새 필드를 추가해도 자동 처리된다.

## 시험

```
node --test packages/name/test/*.test.mjs
```
