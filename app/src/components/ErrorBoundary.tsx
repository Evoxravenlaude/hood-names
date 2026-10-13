import { Component, type ReactNode } from 'react';

/** Keeps one broken screen from blanking the whole site. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page narrow stack">
        <h1 className="title">Something went wrong on this page</h1>
        <p className="muted" style={{ margin: 0 }}>Nothing was sent from your wallet. Reload to try again.</p>
        <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
