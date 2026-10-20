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
import { ready, useT } from './i18n';
import { guardAgainstTranslators } from './lib/translateSafe';
import { ReviewProvider } from './components/Review';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
// Fonts are served from this site, not a third party.
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

guardAgainstTranslators();

function NotFound() {
  const t = useT();
  return (
    <div className="page narrow stack">
      <h1 className="title">{t('Page not found')}</h1>
      <Link to="/">{t('Back to search')}</Link>
    </div>
  );
}

/** Each page eases in when you arrive, so a change of page reads as one. */
function AnimatedRoutes() {
  const location = useLocation();
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
