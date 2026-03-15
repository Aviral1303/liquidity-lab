import { useState, useEffect, useCallback } from 'react';
import { Header }           from './components/Header';
import { SwapCard }         from './components/SwapCard';
import { LiquidityCard }    from './components/LiquidityCard';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ResearchLab }      from './components/ResearchLab';
import { TestnetPanel }     from './components/TestnetPanel';
import { Toast }            from './components/Toast';
import { PoolSelector }     from './components/PoolSelector';
import { StatsBar }         from './components/StatsBar';
import { BondingCurve }     from './components/BondingCurve';
import { createWsConnection, getStats, getReserves, getPriceHistory, getTransactions } from './api';
import { useOnChainReserves } from './hooks/useOnChainReserves';

const TABS = [
  { id: 'swap',      label: 'Swap' },
  { id: 'pool',      label: 'Pool' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'research',  label: 'Research' },
  { id: 'testnet',   label: 'Testnet' },
];

export default function App() {
  const [activeTab,    setActiveTab]    = useState('swap');
  const [activePool,   setActivePool]   = useState('TKA/TKB');
  const [reserves,     setReserves]     = useState({ reserveA: '0', reserveB: '0' });
  const [stats,        setStats]        = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [wsStatus,     setWsStatus]     = useState('connecting');
  const [liveData,     setLiveData]     = useState({});
  const [toast,        setToast]        = useState({ message: '', type: 'success' });
  const [deployedCount, setDeployedCount] = useState(0);

  const showMessage = useCallback((msg, type = 'success') => {
    setToast({ message: msg, type });
    setTimeout(() => setToast(t => ({ ...t, message: '' })), 5000);
  }, []);

  const refresh = useCallback(() => {
    getReserves(activePool).then(r => r.data.success && setReserves(r.data.data)).catch(() => {});
    getStats(activePool).then(r => r.data.success && setStats(r.data.data)).catch(() => {});
    getTransactions(30, activePool).then(r => r.data.success && setTransactions(r.data.data.transactions)).catch(() => {});
    getPriceHistory(activePool, 200).then(r => r.data.success && setPriceHistory(r.data.data)).catch(() => {});
  }, [activePool]);

  useEffect(() => {
    fetch('/contracts.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const n = Object.keys(data?.contracts || {}).length;
        setDeployedCount(n);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 8000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const ws = createWsConnection(
      (msg) => {
        if (msg.type === 'TICK' || msg.type === 'SNAPSHOT') {
          setLiveData(msg.payload);
          setWsStatus('live');
          if (msg.payload[activePool]) {
            const d = msg.payload[activePool];
            setReserves(prev => ({
              ...prev,
              reserveA: d.reserveA ?? prev.reserveA,
              reserveB: d.reserveB ?? prev.reserveB,
              spotPrice: d.price,
            }));
          }
        }
        if (msg.type === 'SWAP' || msg.type === 'ADD_LIQUIDITY' || msg.type === 'REMOVE_LIQUIDITY') {
          refresh();
        }
      },
      () => setWsStatus('live'),
      () => setWsStatus('offline'),
    );
    return () => ws.close();
  }, [activePool, refresh]);

  const poolTokens = {
    'TKA/TKB':  { A: { symbol: 'TKA', name: 'Token Alpha' }, B: { symbol: 'TKB', name: 'Token Beta' } },
    'TKA/USDC': { A: { symbol: 'TKA', name: 'Token Alpha' }, B: { symbol: 'USDC', name: 'USD Coin' } },
  };
  const tokens = poolTokens[activePool] || poolTokens['TKA/TKB'];

  return (
    <div className="min-h-screen bg-black text-white">
      <Header wsStatus={wsStatus} deployedCount={deployedCount} onTestnetClick={() => setActiveTab('testnet')} />

      <main className="max-w-7xl mx-auto px-4 pb-12">
        <StatsBar reserves={reserves} stats={stats} liveData={liveData} activePool={activePool} />

        <div className="flex items-center justify-between mb-5">
          <PoolSelector activePool={activePool} onSelect={setActivePool} liveData={liveData} />

          <nav className="flex items-center gap-px bg-surface border border-border rounded-lg overflow-hidden">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-black'
                    : 'text-textMuted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="animate-fade-in">
          {activeTab === 'swap' && (
            <SwapLayout
              reserves={reserves} stats={stats} priceHistory={priceHistory}
              transactions={transactions} tokens={tokens} activePool={activePool}
              onSuccess={refresh} showMessage={showMessage}
            />
          )}
          {activeTab === 'pool' && (
            <LiquidityCard
              reserves={reserves} stats={stats} tokens={tokens} activePool={activePool}
              onSuccess={refresh} showMessage={showMessage}
            />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsDashboard
              priceHistory={priceHistory} transactions={transactions}
              stats={stats} reserves={reserves} activePool={activePool}
              tokens={tokens}
            />
          )}
          {activeTab === 'research' && (
            <ResearchLab reserves={reserves} activePool={activePool} tokens={tokens} />
          )}
          {activeTab === 'testnet' && (
            <TestnetPanel showMessage={showMessage} />
          )}
        </div>
      </main>

      <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(t => ({ ...t, message: '' }))} />
    </div>
  );
}

function SwapLayout({ reserves, stats, priceHistory, transactions, tokens, activePool, onSuccess, showMessage }) {
  const { reserves: chainRes, isLive } = useOnChainReserves(activePool);
  // Prefer on-chain reserves when available
  const liveReserves = chainRes
    ? { reserveA: String(chainRes.reserveA), reserveB: String(chainRes.reserveB) }
    : reserves;

  return (
    <div className="grid lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <SwapCard
          reserves={liveReserves} tokens={tokens} activePool={activePool}
          onSuccess={onSuccess} showMessage={showMessage}
          isLiveChain={isLive}
        />
        {/* Bonding curve */}
        {chainRes && (
          <div className="border border-border rounded-xl bg-surface p-4">
            <BondingCurve
              reserveA={chainRes.reserveA}
              reserveB={chainRes.reserveB}
              tokens={tokens}
            />
          </div>
        )}
      </div>

      <div className="lg:col-span-3 space-y-4">
        <PoolStatsPanel stats={stats} reserves={liveReserves} tokens={tokens} isLive={isLive} chainRes={chainRes} />
        <PricePanel priceHistory={priceHistory} tokens={tokens} />
        <RecentTradesPanel transactions={transactions} tokens={tokens} />
      </div>
    </div>
  );
}

function PoolStatsPanel({ stats, reserves, tokens, isLive, chainRes }) {
  const data = stats?.stats || {};
  const rA = chainRes?.reserveA ?? parseFloat(reserves.reserveA || 0);
  const rB = chainRes?.reserveB ?? parseFloat(reserves.reserveB || 0);
  const price = rA > 0 ? rB / rA : 0;
  const fmt = n => n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : parseFloat(n).toFixed(2);

  const items = [
    { label: 'Price', value: price > 100 ? `$${price.toLocaleString(undefined,{maximumFractionDigits:0})}` : price.toFixed(6), highlight: true },
    { label: '24h Volume', value: data.totalVolume ? fmt(data.totalVolume) : '—' },
    { label: 'Fees', value: data.totalFees ? fmt(data.totalFees) : '—' },
    { label: 'APR', value: data.feeAPR ? `${data.feeAPR}%` : '—', green: true },
    { label: `${tokens.A.symbol}`, value: fmt(rA) },
    { label: `${tokens.B.symbol}`, value: fmt(rB) },
  ];

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] text-textDim uppercase tracking-widest">Pool Stats</h3>
        {isLive && (
          <span className="flex items-center gap-1 text-[9px] text-success/70 uppercase tracking-wider">
            <span className="w-1 h-1 rounded-full bg-success live-dot" />
            Live on Sepolia
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, value, green, highlight }) => (
          <div key={label}>
            <p className="text-[10px] text-textDim mb-0.5">{label}</p>
            <p className={`text-xs font-mono font-medium ${highlight ? 'text-white' : green ? 'text-success' : 'text-textMuted'}`}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function PricePanel({ priceHistory, tokens }) {
  const data = priceHistory.map(pt => ({ t: pt.t, price: parseFloat(pt.p.toFixed(6)) }));
  const min  = data.length ? Math.min(...data.map(d => d.price)) * 0.998 : 0;
  const max  = data.length ? Math.max(...data.map(d => d.price)) * 1.002 : 2;
  const last = data[data.length - 1]?.price;
  const first = data[0]?.price;
  const pct  = first ? ((last - first) / first * 100).toFixed(2) : '0.00';
  const isUp = parseFloat(pct) >= 0;

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-[10px] text-textDim uppercase tracking-widest">{tokens.A.symbol}/{tokens.B.symbol} Price</h3>
          {last && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-lg font-mono font-medium text-white">{last.toFixed(4)}</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isUp ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {isUp ? '+' : ''}{pct}%
              </span>
            </div>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={isUp ? '#4ade80' : '#f87171'} stopOpacity={0.15} />
              <stop offset="95%" stopColor={isUp ? '#4ade80' : '#f87171'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="t" hide />
          <YAxis domain={[min, max]} hide />
          <Tooltip
            contentStyle={{ background: '#000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '10px' }}
            formatter={v => [v.toFixed(6), 'Price']}
            labelFormatter={ts => new Date(ts).toLocaleTimeString()}
          />
          <Area type="monotone" dataKey="price" stroke={isUp ? '#4ade80' : '#f87171'} strokeWidth={1.5} fill="url(#priceGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecentTradesPanel({ transactions, tokens }) {
  const swaps = transactions.filter(t => t.type === 'swap').slice(0, 8);

  return (
    <div className="border border-border rounded-xl bg-surface p-4">
      <h3 className="text-[10px] text-textDim uppercase tracking-widest mb-3">Recent Trades</h3>
      {swaps.length === 0 ? (
        <p className="text-[10px] text-textDim text-center py-4">No trades yet</p>
      ) : (
        <div className="space-y-1">
          {swaps.map(tx => {
            const isAtoB = tx.tokenIn === 'A';
            const inSym  = isAtoB ? tokens.A.symbol : tokens.B.symbol;
            const outSym = isAtoB ? tokens.B.symbol : tokens.A.symbol;
            return (
              <div key={tx.id} className="flex items-center justify-between text-[10px] py-1 border-b border-border last:border-0">
                <span className="font-mono text-white">
                  {parseFloat(tx.amountIn).toLocaleString(undefined, { maximumFractionDigits: 2 })} {inSym}
                  <span className="text-textDim mx-1">&rarr;</span>
                  {parseFloat(tx.amountOut).toLocaleString(undefined, { maximumFractionDigits: 2 })} {outSym}
                </span>
                <span className="text-textDim font-mono">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
