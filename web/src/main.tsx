import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { adesdk } from '@adestack/sdk'
import { impression, session, system } from '@adestack/extensions'
import App from './App'
import './styles.css'

// ADE 수집 SDK. 기록은 .env 의 VITE_ADE_API_HOST(PoC 수집 API)로 보낸다.
adesdk.init({
  apiHost: import.meta.env.VITE_ADE_API_HOST ?? 'https://ade-poc-api.vercel.app',
  debug: true,
  extensions: [impression(), session(), system()],
})

if (window.location.pathname === '/') {
  window.history.replaceState(null, '', `/main${window.location.search}${window.location.hash}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
