import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { placementPlugin } from '@adestack/placement'

// SDK 는 ../vendor/sdk 의 빌드 결과를 그대로 쓴다(판정 계약은 코드젠 코어로 바꾼 사본).
// 코드젠 빌드 플러그인은 앱 식별자와 배포 식별자를 환경 변수에서 읽는다. 셸에 없으면 PoC 기본값을 쓴다.
process.env.ADE_APP_ID ??= 'ade-poc-kurly'
process.env.ADE_BUILD_ID ??= 'local'

const sdk = (p: string) => fileURLToPath(new URL(`../vendor/sdk/${p}`, import.meta.url))

export default defineConfig({
  // 코드젠 빌드 플러그인. @vitejs/plugin-react 5 는 babel 옵션으로 받는다(FE 사용 안내 §9-3 경우 A).
  plugins: [react({ babel: { plugins: [placementPlugin] } })],
  resolve: {
    // SDK 사본(dist)이 들여오는 mixpanel-browser 는 이 앱의 node_modules 에서 찾는다(Vercel 빌드에는 vendor/sdk/node_modules 가 없다).
    dedupe: ['mixpanel-browser'],
    alias: {
      '@adestack/sdk': sdk('dist/index.js'),
      '@adestack/contract': sdk('packages/contract/dist/index.js'),
      '@adestack/extensions': sdk('packages/extensions/dist/index.js'),
      '@adestack/name': sdk('packages/name/src/index.js'),
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
})
