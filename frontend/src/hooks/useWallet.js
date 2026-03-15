import { useState, useEffect, useCallback } from 'react';

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Wait up to 1s for MetaMask to inject window.ethereum
      let provider = window.ethereum;
      if (!provider) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        provider = window.ethereum;
      }
      if (!provider) {
        setError('MetaMask not detected. Make sure the extension is enabled and this page is trusted.');
        return;
      }
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const chain = await provider.request({ method: 'eth_chainId' });
      setAddress(accounts[0] || null);
      setChainId(chain ? parseInt(chain, 16) : null);
    } catch (e) {
      // code 4001 = user rejected
      setError(e.code === 4001 ? 'Connection rejected.' : e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    const handleAccountsChanged = (accounts) => setAddress(accounts[0] || null);
    const handleChainChanged = (chain) => setChainId(chain ? parseInt(chain, 16) : null);
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.request({ method: 'eth_accounts' }).then((accounts) => {
      if (accounts[0]) setAddress(accounts[0]);
    });
    window.ethereum.request({ method: 'eth_chainId' }).then((chain) => {
      setChainId(chain ? parseInt(chain, 16) : null);
    });
    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  return {
    address,
    chainId,
    isConnected: !!address,
    isConnecting: loading,
    connect,
    disconnect,
    error,
  };
}
