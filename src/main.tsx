import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { freshStartFromUrl } from './store/fresh';

const cleaned = freshStartFromUrl(window.location.href);
if (cleaned) window.history.replaceState(null, '', cleaned);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
