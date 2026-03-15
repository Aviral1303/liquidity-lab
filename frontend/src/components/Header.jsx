import { useState, useEffect } from 'react';
import { WalletButton } from './WalletButton';
import { getMarketPrice } from '../api';

export function Header({ wsStatus, onTestnetClick, deployedCount }) {
  const [ethPrice, setEthPrice] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await getMarketPrice('ETH/USDT');
        if (r.data.success) setEthPrice(r.data.data.price);
      } catch {}
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const wsColor = wsStatus === 'live' ? 'bg-white' : wsStatus === 'connecting' ? 'bg-textMuted' : 'bg-textDim';

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-black/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-7 h-7 rounded-lg border border-white/20 flex items-center justify-center">
            <span className="text-white font-bold text-xs">Q</span>
          </div>
          <div>
            <h1 className="font-display font-semibold text-sm text-white leading-none tracking-tight">QuantAMM</h1>
            <p className="text-[10px] text-textDim leading-none mt-0.5 tracking-wide">x &middot; y = k</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3 text-xs text-textMuted">
          {deployedCount > 0 && (
            <button
              onClick={onTestnetClick}
              className="flex items-center gap-1.5 px-2 py-1 rounded border border-success/30 bg-success/5 text-success hover:bg-success/10 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {deployedCount} deployed
            </button>
          )}
          <span className="flex items-center gap-1.5 px-2 py-1 rounded border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            Sepolia
          </span>
          {ethPrice && (
            <span className="font-mono text-textMuted">
              ETH ${ethPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${wsColor} live-dot`} />
            <span className="text-textDim">{wsStatus === 'live' ? 'Live' : wsStatus === 'connecting' ? 'Connecting' : 'Offline'}</span>
          </span>
        </div>

        <WalletButton />
      </div>
    </header>
  );
}
