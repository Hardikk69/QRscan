import { useEffect, useState } from 'react';
import Home from './pages/Home.jsx';
import Sender from './pages/Sender.jsx';
import Receiver from './pages/Receiver.jsx';
import Simulator from './pages/Simulator.jsx';

// Hash routes (#/send) work from any static server or folder, with no server rewrites
const ROUTES = {
  '': { page: Home, title: 'Offline File Transfer - Air-Gapped Screen to Camera' },
  send: { page: Sender, title: 'Send File - Offline QR File Transfer', nav: 'Send File' },
  receive: { page: Receiver, title: 'Receive File - Offline QR File Transfer', nav: 'Receive File' },
  simulator: { page: Simulator, title: 'System Simulator - Offline QR File Transfer', nav: 'Simulator' }
};

const currentRoute = () => window.location.hash.replace(/^#\/?/, '');

export default function App() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const { page: Page, title } = ROUTES[route] ?? ROUTES[''];
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <>
      <header className="navbar">
        <div className="nav-content">
          <a href="#/" className="brand">
            <span className="brand-icon">⚡</span>
            <span>Offline File Transfer</span>
          </a>
          <nav className="nav-links">
            {Object.entries(ROUTES).filter(([, r]) => r.nav).map(([path, r]) => (
              <a key={path} href={`#/${path}`} className={route === path ? 'active' : undefined}>{r.nav}</a>
            ))}
          </nav>
        </div>
      </header>

      <main className="container" style={route === 'simulator' ? { maxWidth: 1100 } : undefined}>
        <Page key={route} />
      </main>

      <footer>
        <p>Offline Camera-Based QR File Transfer System &bull; Air-Gapped Optical Transmission</p>
      </footer>
    </>
  );
}
