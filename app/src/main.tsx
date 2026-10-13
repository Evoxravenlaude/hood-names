import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
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
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function NotFound() {
  return (
    <div className="page narrow stack">
      <h1 className="title">Page not found</h1>
      <Link to="/">Back to search</Link>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Search />} />
              <Route path="/register/:label" element={<Register />} />
              <Route path="/names" element={<MyNames />} />
              <Route path="/name/:label" element={<Manage />} />
              <Route path="/check" element={<Check />} />
              <Route path="/gift-cards" element={<GiftCards />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
