import { defineConfig, devices } from '@playwright/test';

// 주의: 헤드리스도 실제로 그린다. 그래도 각 시험은 visibilityState 가 'visible' 인지
//    먼저 확인한다. 브라우저가 렌더링을 멈추면 IntersectionObserver 가 계산을 안 해서
//    관문이 「0건」으로 조용히 통과한다(hecto_edp 6a24209 에서 확인한 함정).

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // 결과는 도구가 낸다. 손으로 정리한 문서를 따로 두지 않는다. 경로는 이 파일이 있는 폴더 기준이다
  //   (webServer 의 작업 폴더도 같다). 루트에서 `playwright test -c tests/browser/playwright.config.ts` 로 돈다.
  //   junit  GitLab 이 읽어 MR 과 파이프라인 화면에 시험 결과를 띄운다 (표준)
  //   html   사람이 열어 본다. 실패한 시험의 추적 기록까지 들어 있다
  //   list     터미널. 처리 상태만 본다
  //   주의: 리포터를 더 얹지 않는다. 공식 결과물을 다시 가공하면 보는 사람마다 결과물이
  //      달라지고 유지 부담이 생긴다 (팀장 2026-09-14).
  reporter: [
    ['list'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: true,
    timeout: 10_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],
});
