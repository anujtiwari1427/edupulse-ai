import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Auto-recover if a new deployment changes chunk hashes while user is browsing
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error detected, refreshing page for newest build:', event);
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(<App />);
