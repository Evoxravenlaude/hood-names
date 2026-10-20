import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { chain, deployment, explorerUrl, modules, parentName, repoUrl } from '../config';
import { useT } from '../i18n';
import { useControllerInfo } from '../lib/hooks';
import { LanguagePicker, TranslationNotice } from './Language';
import { WalletButton } from './Wallet';

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
            <span className="dot">.</span>{parentName}<span className="word">names</span>
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
        <div className="inner">
          <span>{t('Hood Names is a working title. Independent project, not affiliated with Robinhood.')}</span>
          {repoUrl && <a href={repoUrl}>{t('Source code')}</a>}
          {explorerUrl && deployment && (
            <a href={`${explorerUrl}/address/${deployment.HoodRegistrarController}`}>{t('Contracts')}</a>
          )}
          {repoUrl && <a href={`${repoUrl}/blob/main/docs/NAME_POLICY.md`}>{t('Name policy')}</a>}
          {repoUrl && <a href={`${repoUrl}/blob/main/docs/ADMIN_POWERS.md`}>{t('Admin powers')}</a>}
        </div>
      </footer>
    </>
  );
}
