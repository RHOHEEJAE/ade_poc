# @adestack/extensions — 벤더에 없는 기능

Mixpanel SDK 에 없어서 우리가 만든 기능 셋을 한 패키지로 둔다. **코어(`@adestack/sdk`)에 넣지 않는다** —
벤더가 주는 기능은 다시 만들지 않고, 벤더에 없는 기능만 확장으로 붙인다(ADR-024). 처음엔 셋이 각각 패키지였는데
같은 모양이고 파일럿이 항상 같이 붙여서 하나로 합쳤다(DA-220).

```js
import { adesdk } from '@adestack/sdk';
import { impression, session, system } from '@adestack/extensions';

const imp = impression();                       // 판정 기준을 바꾸려면 impression({ durationMs: 300 })
adesdk.init({ apiHost, extensions: [imp, session(), system()] });
imp.reset();                                    // SPA 라우트 전환 — 화면을 통째로 갈아 끼울 때만
```

| 폴더 | 이벤트 | 하는 일 |
|---|---|---|
| `src/impression/` | `$ade_impression` | 명시적 노출 관찰. 선언(`@adestack/contract`)을 화면에 들어온 순간 읽어 두고 발화 때 쓴다 |
| `src/session/` | `$ade_session_change` + 모든 이벤트의 `session_id` · `tab_id` · `sequence_no` | 세션 · 탭 · 순번. `stamp` 를 돌려주면 코어의 `before_track` 이 이벤트마다 부른다. 무활동 30분 · 탭 복제 · `reset()` |
| `src/system/` | `$ade_network` · `$ade_web_vital` | 통신 결과 · 웹 성능. `PerformanceObserver` 로 **읽기만** 한다 — 앱의 통신 경로에 끼어들지 않는다 |

폴더마다 `core.js`(규칙, DOM 없음 — 시험이 빌드 없이 그대로 읽는다)와 `index.ts`(확장 팩토리와 배선)로 나뉜다.

확장은 코어도 벤더도 모른다. 코어가 `init(ctx)` 로 넘기는 `ExtensionContext`(`src/context.ts`)만 쓴다 —
코어를 import 하지 않고 같은 모양으로 선언한다. 구조가 같으면 TypeScript 가 맞춰 준다.
`init` 은 코어가 **벤더를 띄우기 직전에** 부른다 — 첫 페이지뷰가 벤더 init 안에서 나가서, `stamp` 가 그 한 건에도 돌아야 한다.

## 시험

```
pnpm test            # 루트에서. packages/extensions/test/*.test.mjs 가 src/*/core.js 를 그대로 읽는다
pnpm test:chromium   # 실브라우저 — tests/browser/ 가 dist 를 패키지 이름으로 import 한다
```
