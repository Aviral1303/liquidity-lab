import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Live On-Chain Data',
    desc: 'Reads reserves directly from deployed Sepolia contracts in real time — no simulation, no caching.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Agent-Based Simulation',
    desc: 'Run configurable multi-agent markets: retail traders, arbitrageurs, and LPs competing on Uniswap V2, Curve, and Balancer models.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'MEV & Sandwich Attacks',
    desc: 'Simulate front-running and sandwich attacks step by step. Quantify MEV extracted and victim slippage impact in basis points.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
    title: 'Model Comparison',
    desc: 'Head-to-head comparison of AMM models under identical price paths. See how StableSwap outperforms on correlated assets.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
    title: 'x · y = k Bonding Curve',
    desc: 'Interactive visualization of the constant product invariant. Watch the curve update live as reserves shift with each trade.',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    title: 'On-Chain Execution',
    desc: 'Connect MetaMask and execute real swaps against deployed Solidity contracts on Sepolia. Every trade is an actual blockchain transaction.',
  },
];

const STATS = [
  { label: 'Contracts Deployed', value: '6' },
  { label: 'AMM Models', value: '3' },
  { label: 'Network', value: 'Sepolia' },
  { label: 'Swap Fee', value: '0.30%' },
];

// Animated background grid
function Grid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Fade edges */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black" />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-black" />
    </div>
  );
}

// Animated formula ticker
const FORMULAS = [
  'x · y = k',
  'Δy = y · Δx / (x + Δx)',
  'IL = 2√r/(1+r) − 1',
  'P_impact = ΔP/P₀',
  'APR = fees / TVL · 365',
  'spread_bps > fee_bps',
];

function FormulaTicker() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % FORMULAS.length);
        setVisible(true);
      }, 300);
    }, 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="font-mono text-white/40 text-sm transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {FORMULAS[idx]}
    </span>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const [chainLive, setChainLive] = useState(null);
  const [blockNum, setBlockNum] = useState(null);

  useEffect(() => {
    // Quick chain check
    fetch('https://ethereum-sepolia-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    })
      .then(r => r.json())
      .then(d => {
        setChainLive(true);
        setBlockNum(parseInt(d.result, 16));
      })
      .catch(() => setChainLive(false));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative">
      <Grid />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg border border-white/20 flex items-center justify-center bg-white/5">
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <span className="font-display font-semibold text-white tracking-tight">LiquidityLab</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Aviral1303/liquidity-lab"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-textMuted hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            GitHub
          </a>
          <button
            onClick={() => navigate('/app')}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors"
          >
            Launch App
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        {/* Chain status pill */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-mono mb-8 ${
          chainLive === true
            ? 'border-success/30 bg-success/5 text-success'
            : chainLive === false
            ? 'border-danger/30 bg-danger/5 text-danger'
            : 'border-border bg-white/3 text-textMuted'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${chainLive === true ? 'bg-success live-dot' : chainLive === false ? 'bg-danger' : 'bg-textDim'}`} />
          {chainLive === true
            ? `Sepolia · Block #${blockNum?.toLocaleString() ?? '...'}`
            : chainLive === false
            ? 'Chain unreachable'
            : 'Checking chain...'}
        </div>

        {/* Title */}
        <h1 className="font-display text-6xl md:text-8xl font-bold tracking-tight text-white leading-none mb-4">
          Liquidity
          <span className="block text-white/30">Lab</span>
        </h1>

        <p className="text-textMuted text-base md:text-lg max-w-xl leading-relaxed mb-3">
          A quantitative research platform for studying automated market makers,
          liquidity dynamics, arbitrage, and MEV strategies in DeFi.
        </p>

        <div className="mb-10">
          <FormulaTicker />
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app')}
            className="px-8 py-3.5 rounded-xl font-medium text-sm bg-white text-black hover:bg-white/90 transition-colors"
          >
            Launch App
          </button>
          <a
            href="https://sepolia.etherscan.io/address/0xB138d15Dd1f372C9736af9Df885D40450f8F072d"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3.5 rounded-xl font-medium text-sm border border-border text-textMuted hover:text-white hover:border-white/20 transition-colors"
          >
            View on Etherscan
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-px bg-border rounded-xl overflow-hidden mt-16 w-full max-w-2xl">
          {STATS.map(({ label, value }) => (
            <div key={label} className="bg-surface px-4 py-4 text-center">
              <p className="font-mono font-semibold text-white text-lg">{value}</p>
              <p className="text-[10px] text-textDim mt-0.5 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24 w-full">
        <div className="text-center mb-12">
          <p className="text-[10px] text-textDim uppercase tracking-widest mb-3">What's inside</p>
          <h2 className="font-display text-2xl font-semibold text-white">Built for quant research</h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="bg-surface p-6 hover:bg-surfaceElevated transition-colors group">
              <div className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-textMuted group-hover:text-white group-hover:border-white/20 transition-colors mb-4">
                {icon}
              </div>
              <h3 className="font-medium text-white text-sm mb-2">{title}</h3>
              <p className="text-[11px] text-textDim leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture strip */}
      <section className="relative z-10 border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between flex-wrap gap-6">
            <div>
              <p className="text-[10px] text-textDim uppercase tracking-widest mb-1">Stack</p>
              <p className="text-xs text-textMuted">
                React · Vite · TailwindCSS · Recharts · ethers.js · FastAPI · Python 3 · Solidity · Hardhat
              </p>
            </div>
            <div className="flex items-center gap-4">
              {['Constant Product', 'StableSwap', 'Balancer'].map(m => (
                <span key={m} className="text-[10px] px-2.5 py-1 rounded-full border border-border text-textDim font-mono">
                  {m}
                </span>
              ))}
            </div>
            <button
              onClick={() => navigate('/app')}
              className="text-xs text-textMuted hover:text-white transition-colors font-mono"
            >
              /app →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
