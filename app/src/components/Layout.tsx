import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { chain, deployment, explorerUrl, modules, repoUrl } from '../config';
import { useT } from '../i18n';
import { useControllerInfo } from '../lib/hooks';
import { LanguagePicker, TranslationNotice } from './Language';
import { WalletButton } from './Wallet';
import { ThemeToggle } from './ThemeToggle';
import { ColourPicker } from './ColourPicker';
import { Wordmark } from './Logo';

/** The rooftops the footer sits under, the end of the street. */
const ROOFS = 'M0 44 L0 30 L139 30 L139 38 L266 38 L266 22 L312 12 L357 22 L357 41 L373 41 L373 35 L389 35 L389 29 L405 29 L405 35 L421 35 L421 41 L437 41 L437 32 L455 32 L455 26 L473 26 L473 20 L492 20 L492 26 L510 26 L510 32 L528 32 L528 35 L594 25 L661 35 L661 29 L704 19 L748 29 L748 33 L857 33 L857 34 L926 34 L926 38 L984 28 L1042 38 L1042 32 L1102 32 L1102 15 L1142 5 L1183 15 L1183 38 L1203 38 L1203 32 L1223 32 L1223 26 L1243 26 L1243 32 L1263 32 L1263 38 L1283 38 L1283 36 L1353 26 L1423 36 L1423 16 L1440 16 L1440 10 L1457 10 L1457 4 L1474 4 L1474 10 L1491 10 L1491 16 L1508 16 L1508 33 L1520 33 L1520 27 L1533 27 L1533 21 L1545 21 L1545 27 L1558 27 L1558 33 L1570 33 L1570 34 L1609 24 L1648 34 L1600 44 Z';

const link = ({ isActive }: { isActive: boolean }) => 'nav-link' + (isActive ? ' active' : '');

export function Layout({ children }: { children: ReactNode }) {
  const t = useT();
  const { paused } = useControllerInfo();
  return (
    <>
      <a className="sr-only" href="#main">{t('Skip to content')}</a>
      <header className="site-header">
        <nav className="nav" aria-label={t('Main')}>
          <Link to="/" className="brand" aria-label={t('Hood Names home')} translate="no">
            <Wordmark size={34} />
          </Link>
          <div className="nav-links">
            <NavLink to="/" end className={link}>{t('Search')}</NavLink>
            <NavLink to="/names" className={link}>{t('My names')}</NavLink>
            <NavLink to="/check" className={link}>{t('Check a name')}</NavLink>
            {modules.giftCards && <NavLink to="/gift-cards" className={link}>{t('Gift cards')}</NavLink>}
            <NavLink to="/stats" className={link}>{t('Stats')}</NavLink>
            {chain.testnet && <NavLink to="/faucet" className={link}>{t('Test tokens')}</NavLink>}
          </div>
          <div className="nav-tools">
            <span className={'chip net' + (deployment ? '' : ' off')} translate="no"><span className="led" />{chain.name}</span>
            <LanguagePicker />
            <ThemeToggle />
            <ColourPicker />
            <WalletButton />
          </div>
        </nav>
      </header>
      <TranslationNotice />
      {!deployment && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice warn">
            <p>
              <strong>{t('Not deployed yet.')}</strong>{' '}
              {t('The contracts are not on {network} yet, so nothing can be looked up or registered. This page fills in automatically once they are.', { network: chain.name })}
            </p>
          </div>
        </div>
      )}
      {deployment && paused && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice info">
            <p>
              <strong>{t('Registration has not opened yet.')}</strong>{' '}
              {t('You can look names up; buying opens once the reserved names are in place.')}
            </p>
          </div>
        </div>
      )}
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="roofs" aria-hidden="true">
          <svg viewBox="0 0 1600 44" preserveAspectRatio="none"><path d={ROOFS} fill="currentColor" /></svg>
        </div>
        <div className="foot">
          <div className="foot-brand">
            <Wordmark size={30} />
            <p>{t('Names for wallets on Robinhood Chain, written in any of the world’s alphabets.')}</p>
          </div>
          <nav className="foot-links" aria-label={t('Site links')}>
            <Link to="/">{t('Search')}</Link>
            <Link to="/names">{t('My names')}</Link>
            <Link to="/check">{t('Check a name')}</Link>
            {modules.giftCards && <Link to="/gift-cards">{t('Gift cards')}</Link>}
            <Link to="/stats">{t('Stats')}</Link>
            {chain.testnet && <Link to="/faucet">{t('Test tokens')}</Link>}
            <Link to="/brand">{t('Brand')}</Link>
            {repoUrl && <a href={`${repoUrl}/blob/main/docs/NAME_POLICY.md`}>{t('Name policy')}</a>}
            {repoUrl && <a href={`${repoUrl}/blob/main/docs/ADMIN_POWERS.md`}>{t('Admin powers')}</a>}
            {repoUrl && <a href={repoUrl}>{t('Source code')}</a>}
            {explorerUrl && deployment && (
              <a href={`${explorerUrl}/address/${deployment.HoodRegistrarController}`}>{t('Contracts')}</a>
            )}
          </nav>
        </div>
        <div className="foot-note">
          <span>{t('Hood Names is a working title. Independent project, not affiliated with Robinhood.')}</span>
          <span translate="no">{chain.name}</span>
        </div>
      </footer>
    </>
  );
}
