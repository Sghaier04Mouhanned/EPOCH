import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connectBrowser, createBrowserTimerStore } from './app/browser';

const store = createBrowserTimerStore();
connectBrowser(store);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
