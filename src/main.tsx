import '@fontsource-variable/inter';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { connectBrowser, createBrowserApp } from './app/browser';
import { App } from './ui/App';

async function boot() {
  // Dev only: `?seed` loads sample history and `?at=15:20` pins the clock, for
  // screenshots with realistic data. Stripped from production builds.
  const dev = import.meta.env.DEV ? await import('./dev/seed').then((m) => m.prepare()) : undefined;

  const app = createBrowserApp(dev?.now);
  connectBrowser(app);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App app={app} />
    </StrictMode>,
  );
}

void boot();
