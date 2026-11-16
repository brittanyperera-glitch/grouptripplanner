import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { freshStartForEpoch, freshStartFromUrl } from './store/fresh';
import { recoverGuestOnBoot } from './guest/deviceState';

recoverGuestOnBoot(window.location.hash);
freshStartForEpoch();
const cleaned = freshStartFromUrl(window.location.href);
if (cleaned) window.history.replaceState(null, '', cleaned);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Registering while version.json says sw:false would reinstall the worker the kill switch just removed, forever.
  const register = async () => {
    try {
      const res = await fetch('/version.json', { cache: 'no-store' });
      if (res.ok && (await res.json()).sw === false) return;
    } catch {
      // offline or unreadable: keep the worker
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
