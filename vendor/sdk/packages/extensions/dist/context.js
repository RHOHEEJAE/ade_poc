// 코어가 확장에 넘기는 것. @adestack/sdk 의 ExtensionContext 와 같은 모양이다.
//
// 코어를 import 하지 않고 같은 모양으로 선언한다 — 확장이 코어에 의존하면 빌드 순서가 꼬이고,
// 구조가 같으면 TypeScript 가 맞춰 준다. 세 확장(impression · session · system)이 이 한 선언을 쓴다.
export {};
