import { useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CartProvider } from './store/cart';
import { ChalkDefs } from './brand/Chalk';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Home } from './routes/Home';
import { Studio } from './routes/Studio';
import { Mission } from './routes/Mission';
import { Bag } from './routes/Bag';

/**
 * Hash routing, not history routing. GitHub Pages serves static files with no
 * rewrite rules, so /studio would 404 on a refresh or a shared link — #/studio
 * always resolves to index.html.
 */
export function App() {
  return (
    <HashRouter>
      <CartProvider>
        <ScrollToTop />
        {/* Filter definitions every chalk-finished face points at. */}
        <ChalkDefs />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/studio" element={<Studio />} />
            <Route path="/10-percent" element={<Mission />} />
            <Route path="/bag" element={<Bag />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <Footer />
      </CartProvider>
    </HashRouter>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
