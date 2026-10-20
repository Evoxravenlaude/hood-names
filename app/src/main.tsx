import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, Link, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './wagmi';
import { Layout } from './components/Layout';
import { Search } from './pages/Search';
import { Register } from './pages/Register';
import { MyNames } from './pages/MyNames';
import { Manage } from './pages/Manage';
import { Check } from './pages/Check';
import { GiftCards } from './pages/GiftCards';
import { Faucet } from './pages/Faucet';
import { Stats } from './pages/Stats';
import { Brand } from './pages/Brand';
import { ready, useT } from './i18n';
import { guardAgainstTranslators } from './lib/translateSafe';
import { ReviewProvider } from './components/Review';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { installPalettes } from './lib/theme';
// Fonts are served from this site, not a third party.
import '@fontsource-variable/archivo/wdth.css';
// Geist draws Cyrillic, which Archivo does not have.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

guardAgainstTranslators();
installPalettes();

function NotFound() {
  const t = useT();
  return (
    <div className="page narrow stack lost">
      <h1 className="plate plate-lg plate-in">
        <span className="plate-top" translate="no">404</span>
        <span className="plate-name">{t('Page not found')}</span>
      </h1>
      <p className="lede">{t('There is no page at this address. The name you want may still be free.')}</p>
      <Link className="btn btn-primary" style={{ justifySelf: 'start' }} to="/">{t('Back to search')}</Link>
    </div>
  );
}

/** Each page eases in when you arrive, so a change of page reads as one. */
function AnimatedRoutes() {
  const location = useLocation();
  // Take the loading screen down once the page is drawn in its own fonts.
  React.useEffect(() => {
    const w = window as Window & { __bootDone?: () => void };
    document.fonts.ready.finally(() => w.__bootDone?.());
  }, []);
  return (
    <div key={location.pathname} className="page-enter">
      <Routes location={location}>
        <Route path="/" element={<Search />} />
        <Route path="/register/:label" element={<Register />} />
        <Route path="/names" element={<MyNames />} />
        <Route path="/name/:label" element={<Manage />} />
        <Route path="/check" element={<Check />} />
        <Route path="/gift-cards" element={<GiftCards />} />
        <Route path="/faucet" element={<Faucet />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/brand" element={<Brand />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

// The starting language is loaded first, so the page does not flash English.
ready.finally(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
        <ReviewProvider>
        <BrowserRouter>
          <Layout>
            <ErrorBoundary>
            <AnimatedRoutes />
            </ErrorBoundary>
          </Layout>
        </BrowserRouter>
        </ReviewProvider>
        </ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
));
