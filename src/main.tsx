import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

const container = document.getElementById('root')
if (!container) throw new Error('#root introuvable')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The service worker is what makes the app installable and usable offline.
// Only in production: an active worker caching the dev server would make every
// change look like it had no effect.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // Offline support is a bonus; the app works fine without it.
    })
  })
}
