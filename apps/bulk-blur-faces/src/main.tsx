import { blockExternalRequests } from '@tools/image-utils';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './regions.css';

// Also covers the single-threaded fallback that runs MediaPipe on this page.
blockExternalRequests();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
