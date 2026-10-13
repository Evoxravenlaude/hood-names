// A stand-in browser wallet for local tests: forwards every request to a
// local anvil node, which signs for its built-in test accounts.
(() => {
  const RPC = 'http://127.0.0.1:8545';
  const ACCOUNT = window.__TEST_ACCOUNT__ || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const listeners = {};
  let id = 0;
  const provider = {
    isMetaMask: false,
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [ACCOUNT];
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'net_version') return '31337';
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null;
      if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
      if (method === 'wallet_revokePermissions') return null;
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: params ?? [] }),
      });
      const body = await res.json();
      if (body.error) {
        const err = new Error(body.error.message);
        err.code = body.error.code;
        err.data = body.error.data;
        throw err;
      }
      return body.result;
    },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  };
  window.ethereum = provider;
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: Object.freeze({
          info: { uuid: '00000000-0000-4000-8000-000000000001', name: 'Test Wallet', icon: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 8 8%22%3E%3Crect width=%228%22 height=%228%22 fill=%22%231E3BD6%22/%3E%3C/svg%3E', rdns: 'local.testwallet' },
          provider,
        }),
      }),
    );
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();
