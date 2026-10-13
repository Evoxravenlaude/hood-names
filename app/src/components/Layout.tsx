import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { chain, deployment, explorerUrl, modules, parentName, repoUrl } from '../config';
import { useControllerInfo } from '../lib/hooks';
import { WalletButton } from './Wallet';

export function Layout({ children }: { children: ReactNode }) {
  const { paused } = useControllerInfo();
  return (
    <>
      <header className="site-header">
        <nav className="nav" aria-label="Main">
          <Link to="/" className="brand" aria-label="Hood Names home">
            <span className="dot">.</span>{parentName}<span className="word">names</span>
          </Link>
          <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Search</NavLink>
          <NavLink to="/names" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>My names</NavLink>
          <NavLink to="/check" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Check a name</NavLink>
          {modules.giftCards && (
            <NavLink to="/gift-cards" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Gift cards</NavLink>
          )}
          {chain.testnet && (
            <NavLink to="/faucet" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Test tokens</NavLink>
          )}
          </div>
          <span className={'chip net' + (deployment ? '' : ' off')}><span className="led" />{chain.name}</span>
          <WalletButton />
        </nav>
      </header>
      {!deployment && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice warn">
            <p><strong>Not deployed yet.</strong> The contracts are not on {chain.name} yet, so nothing can be looked up or registered. This page fills in automatically once they are.</p>
          </div>
        </div>
      )}
      {deployment && paused && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice info">
            <p><strong>Registration has not opened yet.</strong> You can look names up; buying opens once the reserved names are in place.</p>
          </div>
        </div>
      )}
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="inner">
          <span>Hood Names is a working title. Independent project, not affiliated with Robinhood.</span>
          {repoUrl && <a href={repoUrl}>Source code</a>}
          {explorerUrl && deployment && (
            <a href={`${explorerUrl}/address/${deployment.HoodRegistrarController}`}>Contracts</a>
          )}
          {repoUrl && <a href={`${repoUrl}/blob/main/docs/NAME_POLICY.md`}>Name policy</a>}
          {repoUrl && <a href={`${repoUrl}/blob/main/docs/ADMIN_POWERS.md`}>Admin powers</a>}
        </div>
      </footer>
    </>
  );
}
