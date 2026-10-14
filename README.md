# ADE PoC — 마켓컬리 목업 페이지

마켓컬리 목업 페이지(남영 책임 공유본)에 코드젠과 수집 SDK 를 붙인 PoC 다.

## 구성

| 폴더 | 내용 | 기준 |
|---|---|---|
| `web/` | 마켓컬리 화면. 원본에서 PostHog · Heap · 시험 파일을 빼고 ADE 선언을 더했다 | test-web 화면 코드 |
| `vendor/sdk/` | 수집 SDK 사본. 판정 계약(`packages/contract/src/contract.ts`)만 코드젠 코어로 바꿨다 | sdk-js main `3ce29ee` |
| `vendor/sdk/packages/contract/src/core/` | 코드젠 코어 `contract` · `inject` 와 의존 파일 17개. import 경로에 `.js` 만 붙였다 | codegen main `6c5815b` |
| `vendor/codegen/` | 빌드 플러그인(.tgz) · 검증 CLI(cli.cjs) · VS Code 확장(.vsix) | codegen main `6c5815b` |
| `collector-data/` | (선택) 로컬 수집 서버로 시험할 때의 SQLite 와 로그. 커밋하지 않는다 | collector main `35e1b60` |

원본 저장소(sdk-js, codegen, collector, test-web)는 고치지 않았다.

## 수집 경로

```
마켓컬리 화면 (Vercel) ──SDK──▶ https://ade-poc-api.vercel.app  (/track · /engage · /groups · /diag)
```

주소는 `web/.env` 의 `VITE_ADE_API_HOST` 다. 빌드할 때 번들에 들어가므로 바꾸면 다시 빌드한다.

## Vercel 배포 (화면)

- Root Directory: `web`. 빌드 설정은 `web/vercel.json` 이 정한다(Vite, `/main` 같은 경로는 index.html 로).
- 화면 빌드가 저장소의 `vendor/sdk/` 빌드 결과(dist)와 `web/vendor/adestack-placement.tgz` 를 읽는다.
  그래서 SDK 사본의 dist 를 커밋한다. SDK 사본을 고치면 `vendor/sdk/` 에서 `pnpm build` 뒤 커밋한다.
- 수집 API 프로젝트(ade_poc_api)의 환경 변수 `ADE_ORIGINS` 에 이 화면의 Vercel 주소를 넣는다.
  로컬 화면에서도 보내려면 `http://127.0.0.1:4173,http://127.0.0.1:5173` 도 함께 넣는다.

## 로컬 실행

0. SDK 사본 빌드 (`vendor/sdk/` 에서, 처음 한 번). 화면이 이 빌드 결과(`dist/`)를 읽는다.

   ```powershell
   pnpm install --frozen-lockfile
   pnpm build
   ```

1. (선택) 로컬 수집 서버로 시험할 때만. collector 저장소에서 띄우고 `web/.env` 를 `http://localhost:8000` 으로 바꾼다

   ```powershell
   $env:ADE_DB_PATH = 'C:/Users/RHJ/Downloads/ade_poc/collector-data/ade.db'; python -m uv run ade-collector serve --allow-open
   ```

2. 화면 (`web/` 에서)

   ```powershell
   npm install
   npm run build
   npm run preview
   ```

   `http://127.0.0.1:4173/main` 을 연다. 개발 서버는 `npm run dev`(5173).

3. 기록 확인: 수집 API 의 원시 DB(`ade.ade_raw`, `ade.ade_event`). 로컬 수집 서버면 `http://localhost:8000/ade/events?limit=50`

## 코드젠 설정

- 앱 식별자 · 배포 식별자: `vite.config.ts` 가 셸에 없으면 `ade-poc-kurly` · `local` 을 넣는다.
- 주제: `store`(role `product`). 검증 CLI 는 `ADE_SERVICES=store`, VS Code 는 설정 `adestack.services: ["store"]`.
- 검증: `web/` 에서 `$env:ADE_APP_ID='ade-poc-kurly'; $env:ADE_BUILD_ID='local'; $env:ADE_SERVICES='store'; npm run validate`
- 추적 이름과 사용 위치 세그먼트는 확장과 같은 코어 함수(`issueName`, `planSegments`)로 넣었다.

## 선언

| 화면 요소 | 선언 |
|---|---|
| 상품 카드 | `object` + `product` (`product_id`) |
| 기획 상품 섹션, 검색 결과 영역 | 선언하지 않는다. 행동이 일어나는 요소가 아니라 상품을 담는 영역이다 |
| 상단 메뉴, 카테고리 항목 | `object` role 없음 + `menu_id` · `category_id` → 분류 필요 |
| 상단 띠배너, 메인 슬라이드, 섹션 띠배너 | `object` + `banner` |
| 회원가입 · 상품 상세 팝업, 찜 · 장바구니 팝오버 | `object` + `modal`. 상품 상세는 `data-ade-parent-product-id` 를 직접 적었다 |
| 알림 | `object` + `toast` + `data-ade-identity-static` |
| 버튼 | `control` |
| 검색어 입력 | `input` |
| 장바구니 담기 · 찜 · 찜 해제 · 검색 | 업무 결과 `adesdk.track({ name, properties })` |

## 알려진 차이와 경고

- SDK 임시 계약과 코드젠 코어의 판정이 다른 곳이 5건 있다. SDK 의 `packages/contract/test/contract.test.mjs` 가 실패한다
  (모르는 kind 보고, 모르는 collect 값, 조상 슬롯 `_id` 제한, 수집 제한 근거 코드, name 형식 근거 코드).
  PoC 는 코드젠 코어를 정본으로 쓴다. 시험의 가짜 요소에는 코어가 쓰는 `getAttributeNames` 만 더했다.
- 빌드가 `.map()` 안에서 바로 그린 선언 요소 세 곳(상단 메뉴, 카테고리, 메인 슬라이드)에 `ADE-407` 경고를 낸다. 감싸는 선언이 없어 잃는 정보는 없다.
- `service_id` 는 SDK 가 싣지 않는다. 수집 API(ade_poc_api)가 role 을 어휘로 찾아 채운다(`product` → `store`).
