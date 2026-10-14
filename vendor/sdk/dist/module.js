// module.ts — 코어와 확장 사이의 약속. 타입만 있고 코드는 없다.
//
// 우리 SDK 는 Mixpanel SDK 다. 벤더에 없는 기능(노출 · 세션 · 시스템)만 packages/extensions 의
// 확장으로 두고, 서비스가 `adesdk.init({ extensions: [impression()] })` 으로 붙인다.
// 코어는 확장에 이 파일의 ExtensionContext 를 넘기고 `init` 을 부른다 — mixpanel-core 가
// `new Autocapture(this)` 로 자기 함수를 넘기는 것과 같은 자리다.
//
// 확장은 여기 있는 것 밖의 코어 내부와 mixpanel-browser 를 모른다. 그래서 벤더 버전을 올릴 때
// 볼 곳은 코어 하나다. 확장 패키지는 이 타입을 import 하지 않고 같은 모양으로 다시 선언한다 —
// 구조가 같으면 TypeScript 가 맞춰 준다. 확장이 코어에 의존하면 빌드 순서가 꼬인다.
export {};
