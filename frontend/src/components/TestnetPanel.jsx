import { useState, useEffect } from 'react';
import { claimFaucet } from '../api';
import { useWallet } from '../hooks/useWallet';
import { useOnChainReserves, bondingCurvePoints } from '../hooks/useOnChainReserves';
import { BondingCurve } from './BondingCurve';

const CONTRACTS = {
  'AMM Pool (TKA/TKB)':   '0xB138d15Dd1f372C9736af9Df885D40450f8F072d',
  'AMM Pool (TKA/USDC)':  '0xcE1D80bf144ff848F05B25C753C981aBFC8c4B9b',
  'AMMFactory':            '0xB4e66c99041f73d38139cc697c85673a2f773606',
  'Token Alpha (TKA)':     '0xA04EA0d7f5eD2a519D49BfCEA17CEE9F686d0Dd9',
  'Token Beta (TKB)':      '0x7d242620F245C8320D1867E90Fa2d1E2686C7045',
  'USDC (test)':           '0xFa28385f024d7a70d3FbC8c2f7bedc21496a3a31',
};

const EXPLORER = 'https://sepolia.etherscan.io';

const TOKENS_MAP = {
  'TKA/TKB':  { A: { symbol: 'TKA' }, B: { symbol: 'TKB' } },
  'TKA/USDC': { A: { symbol: 'TKA' }, B: { symbol: 'USDC' } },
};

export function TestnetPanel({ showMessage }) {
  const { address, isConnected, connect } = useWallet();
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetResult,  setFaucetResult]  = useState(null);
  const [copied, setCopied] = useState('');
  const [activePool, setActivePool] = useState('TKA/TKB');

  const { reserves: r1, chainPrice: p1, lastBlock, isLive, loading: l1 } = useOnChainReserves('TKA/TKB');
  const { reserves: r2, chainPrice: p2, loading: l2 }                    = useOnChainReserves('TKA/USDC');

  const poolReserves = { 'TKA/TKB': r1, 'TKA/USDC': r2 };
  const poolPrices   = { 'TKA/TKB': p1, 'TKA/USDC': p2 };
  const res = poolReserves[activePool];
  const tokens = TOKENS_MAP[activePool];

  const copy = (addr) => {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(addr);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleFaucet = async () => {
    if (!isConnected) { showMessage('Connect wallet first', 'error'); return; }
    setFaucetLoading(true);
    try {
      const { data } = await claimFaucet(address);
      if (data.success) {
        setFaucetResult(data.data);
        showMessage('Faucet claimed!');
      }
    } catch (err) {
      showMessage(err.response?.data?.error || 'Faucet error', 'error');
    } finally { setFaucetLoading(false); }
  };

  const fmt = (n) => {
    if (!n && n !== 0) return '—';
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return parseFloat(n).toFixed(4);
  };

  return (
    <div className="space-y-4">
      {/* Live status banner */}
      <div className="border border-border rounded-xl bg-surface p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-success live-dot' : l1 ? 'bg-white/30 live-dot' : 'bg-danger'}`} />
          <div>
            <p className="text-sm font-medium text-white">
              {isLive ? 'Live on Ethereum Sepolia' : l1 ? 'Connecting to Sepolia...' : 'Chain unreachable'}
            </p>
            <p className="text-[10px] text-textDim font-mono mt-0.5">
              {lastBlock ? `Block #${lastBlock.toLocaleString()} · Chain ID 11155111` : 'Sepolia Testnet · Chain ID 11155111'}
            </p>
          </div>
        </div>
        <a
          href={`${EXPLORER}/address/0xB138d15Dd1f372C9736af9Df885D40450f8F072d`}
          target="_blank" rel="noopener noreferrer"
          className="text-[10px] px-2.5 py-1 rounded border border-border text-textMuted hover:text-white transition-colors"
        >
          View on Etherscan ↗
        </a>
      </div>

      {/* Live pool state */}
      <div className="border border-border rounded-xl bg-surface overflow-hidden">
        <div className="flex border-b border-border">
          {['TKA/TKB', 'TKA/USDC'].map(p => (
            <button key={p} onClick={() => setActivePool(p)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${activePool === p ? 'bg-white text-black' : 'text-textMuted hover:text-white'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Key stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden mb-5">
            <LiveStat label={`${tokens.A.symbol} Reserve`} value={res ? fmt(res.reserveA) : '...'} live={isLive} />
            <LiveStat label={`${tokens.B.symbol} Reserve`} value={res ? fmt(res.reserveB) : '...'} live={isLive} />
            <LiveStat label="Price" value={res ? (poolPrices[activePool] > 100 ? `$${poolPrices[activePool].toLocaleString(undefined,{maximumFractionDigits:0})}` : poolPrices[activePool].toFixed(6)) : '...'} live={isLive} highlight />
            <LiveStat label="K Constant" value={res ? fmt(res.reserveA * res.reserveB) : '...'} live={isLive} />
          </div>

          {/* Bonding curve */}
          {res && (
            <div className="border border-border rounded-lg p-4 bg-surfaceElevated">
              <BondingCurve
                reserveA={res.reserveA}
                reserveB={res.reserveB}
                tokens={tokens}
              />
            </div>
          )}

          {!res && !isLive && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-center">
                <div className="w-6 h-6 border border-white/20 border-t-white/60 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-textDim">Reading from Sepolia...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* What is deployed explanation */}
      <div className="border border-border rounded-xl bg-surface p-5">
        <h3 className="text-xs font-medium text-white mb-3">What's deployed</h3>
        <p className="text-[11px] text-textMuted leading-relaxed mb-3">
          Six Solidity contracts are permanently deployed on Ethereum Sepolia. The AMM pools hold real token reserves
          that anyone can read on-chain. Swaps execute the constant product formula <span className="font-mono text-white">x · y = k</span> on
          the EVM — every trade is an actual blockchain transaction. Connect MetaMask on Sepolia to swap and provide liquidity.
        </p>
        <div className="grid md:grid-cols-2 gap-2">
          <div className="bg-surfaceElevated rounded-lg p-3">
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-1">TKA/TKB Pool</p>
            <p className="text-xs font-mono text-white">100,000 TKA : 100,000 TKB</p>
            <p className="text-[10px] text-textDim mt-0.5">Price = 1.0 · 0.3% fee on every swap</p>
          </div>
          <div className="bg-surfaceElevated rounded-lg p-3">
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-1">TKA/USDC Pool</p>
            <p className="text-xs font-mono text-white">3,300 TKA : 9,900,000 USDC</p>
            <p className="text-[10px] text-textDim mt-0.5">Price = $3,000/TKA · 0.3% fee</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Contract addresses */}
        <div className="border border-border rounded-xl bg-surface p-5">
          <h3 className="text-[10px] text-textDim uppercase tracking-widest mb-3">Contracts</h3>
          <div className="space-y-2">
            {Object.entries(CONTRACTS).map(([name, addr]) => (
              <div key={name} className="bg-surfaceElevated rounded-lg p-2.5">
                <p className="text-[10px] text-textMuted mb-1">{name}</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-[9px] text-textDim font-mono flex-1 truncate">{addr}</code>
                  <button onClick={() => copy(addr)} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-textMuted hover:text-white shrink-0">
                    {copied === addr ? 'Copied' : 'Copy'}
                  </button>
                  <a href={`${EXPLORER}/address/${addr}`} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-textMuted hover:text-white shrink-0">
                    View ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Faucet + wallet */}
        <div className="space-y-4">
          <div className="border border-border rounded-xl bg-surface p-5">
            <h3 className="text-[10px] text-textDim uppercase tracking-widest mb-2">Get Test Tokens</h3>
            <p className="text-[10px] text-textDim mb-3">Claim TKA, TKB, USDC to try swapping on-chain.</p>

            {!isConnected ? (
              <button onClick={connect} className="w-full py-2.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90">
                Connect Wallet to Claim
              </button>
            ) : (
              <button onClick={handleFaucet} disabled={faucetLoading}
                className="w-full py-2.5 rounded-lg text-xs font-medium bg-white/5 border border-border text-white hover:bg-white/10 transition-colors disabled:opacity-50">
                {faucetLoading ? 'Claiming...' : 'Claim Test Tokens'}
              </button>
            )}

            {faucetResult && (
              <div className="mt-3 rounded-lg bg-success/5 border border-success/15 p-3 space-y-1 animate-slide-up">
                <p className="text-[10px] text-success mb-1">Tokens received (simulation)</p>
                {Object.entries(faucetResult.tokens || {}).map(([sym, amt]) => (
                  <div key={sym} className="flex justify-between text-[10px]">
                    <span className="text-textMuted">{sym}</span>
                    <span className="font-mono text-white">{parseFloat(amt).toLocaleString()}</span>
                  </div>
                ))}
                <p className="text-[9px] text-textDim mt-1">
                  For real on-chain TKA/TKB, use the AMM contract's mint function directly.
                </p>
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] text-textDim mb-1">Need Sepolia ETH for gas?</p>
              <div className="space-y-1 text-[10px] text-textDim">
                <p>sepoliafaucet.com</p>
                <p>cloud.google.com/web3/faucet/ethereum/sepolia</p>
              </div>
            </div>
          </div>

          <div className="border border-border rounded-xl bg-surface p-4">
            <h3 className="text-[10px] text-textDim uppercase tracking-widest mb-2">How to interact on-chain</h3>
            <ol className="space-y-1.5 text-[10px] text-textMuted">
              <li className="flex gap-2"><span className="text-white font-mono shrink-0">1.</span>Install MetaMask and switch to Sepolia</li>
              <li className="flex gap-2"><span className="text-white font-mono shrink-0">2.</span>Get Sepolia ETH from faucet above</li>
              <li className="flex gap-2"><span className="text-white font-mono shrink-0">3.</span>Claim test tokens (TKA/TKB) — or mint directly via Etherscan</li>
              <li className="flex gap-2"><span className="text-white font-mono shrink-0">4.</span>Go to Swap tab → Connect → badge shows "on-chain"</li>
              <li className="flex gap-2"><span className="text-white font-mono shrink-0">5.</span>Swap routes to <code className="text-white">swapWithProtection()</code> on the deployed contract</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveStat({ label, value, live, highlight }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-[9px] text-textDim uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-sm font-mono font-medium ${highlight ? 'text-white' : 'text-textMuted'}`}>{value}</p>
      {live && <span className="text-[8px] text-success/70 uppercase tracking-wider">live</span>}
    </div>
  );
}
