import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// Dark-mode only: the .dark class is always present (index.html sets it
// pre-paint; this is belt-and-braces for any path that re-renders root).
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
