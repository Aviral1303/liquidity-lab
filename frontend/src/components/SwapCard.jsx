import { useState, useEffect, useCallback } from 'react';
import { TokenAvatar } from './PoolSelector';
import { getSwapQuote, executeSwap, getGasEstimate } from '../api';
import { useOnChainAMM } from '../hooks/useOnChainAMM';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0, 3.0];

export function SwapCard({ reserves, tokens, activePool, onSuccess, showMessage, isLiveChain }) {
  const { isOnChain, executeSwapOnChain } = useOnChainAMM();
  const [tokenIn,   setTokenIn]   = useState('A');
  const [amountIn,  setAmountIn]  = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [priceImpact, setPriceImpact] = useState('0');
  const [minOut,    setMinOut]    = useState('');
  const [loading,   setLoading]   = useState(false);
  const [quoting,   setQuoting]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [slippage,  setSlippage]  = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState('');
  const [deadline,  setDeadline]  = useState(20);
  const [gasEst,    setGasEst]    = useState(null);

  const tokenOut  = tokenIn === 'A' ? 'B' : 'A';
  const symIn     = tokenIn === 'A' ? tokens.A.symbol : tokens.B.symbol;
  const symOut    = tokenOut === 'A' ? tokens.A.symbol : tokens.B.symbol;
  const reserveIn = tokenIn === 'A' ? parseFloat(reserves?.reserveA || 0) : parseFloat(reserves?.reserveB || 0);

  const fetchQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setAmountOut(''); setPriceImpact('0'); setMinOut('');
      return;
    }
    setQuoting(true);
    try {
      const { data } = await getSwapQuote(tokenIn, amountIn, activePool);
      if (data.success) {
        setAmountOut(data.data.amountOut);
        setPriceImpact(data.data.priceImpact ?? '0');
        const minOutVal = parseFloat(data.data.amountOut) * (1 - slippage / 100);
        setMinOut(minOutVal.toFixed(6));
      }
    } catch {
      setAmountOut(''); setPriceImpact('0'); setMinOut('');
    } finally {
      setQuoting(false);
    }
  }, [tokenIn, amountIn, activePool, slippage]);

  useEffect(() => {
    const t = setTimeout(fetchQuote, 300);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  useEffect(() => {
    getGasEstimate('swap').then(r => {
      if (r.data.success) setGasEst(r.data.data);
    }).catch(() => {});
  }, []);

  const flip = () => {
    setTokenIn(p => p === 'A' ? 'B' : 'A');
    setAmountIn(''); setAmountOut(''); setPriceImpact('0'); setMinOut('');
  };

  const setPreset = (pct) => {
    const amt = reserveIn * pct * 0.01;
    setAmountIn(amt > 0 ? amt.toFixed(4) : '');
  };

  const handleSwap = async () => {
    if (!amountIn || !amountOut || parseFloat(amountIn) <= 0) {
      showMessage('Enter a valid amount', 'error'); return;
    }
    const impact = parseFloat(priceImpact);
    if (impact > 500) {
      showMessage('Price impact too high (>5%). Reduce trade size.', 'error'); return;
    }
    setLoading(true);
    try {
      if (isOnChain) {
        const result = await executeSwapOnChain({
          poolId: activePool, tokenIn, amountIn,
          slippageBps: Math.round(slippage * 100),
        });
        showMessage(`Swap confirmed on-chain. Tx: ${result.txHash.slice(0, 10)}... Received: ${parseFloat(result.amountOut).toFixed(4)} ${symOut}`);
        setAmountIn(''); setAmountOut(''); setPriceImpact('0'); setMinOut('');
        onSuccess?.();
        return;
      }
      const { data } = await executeSwap(tokenIn, amountIn, activePool, Math.round(slippage * 100));
      if (data.success) {
        showMessage(`Swap simulated: ${amountIn} ${symIn} -> ${parseFloat(data.data.amountOut).toFixed(4)} ${symOut}`);
        setAmountIn(''); setAmountOut(''); setPriceImpact('0'); setMinOut('');
        onSuccess?.();
      }
    } catch (err) {
      const msg = err?.reason || err?.message || err?.response?.data?.error || 'Swap failed';
      showMessage(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const impact = parseFloat(priceImpact);
  const impactColor = impact > 300 ? 'text-danger' : impact > 100 ? 'text-warning' : 'text-success';

  const spotPrice = parseFloat(reserves?.reserveA) > 0
    ? (parseFloat(reserves?.reserveB) / parseFloat(reserves?.reserveA)).toFixed(6)
    : '—';

  return (
    <div className="border border-border rounded-xl bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-white text-sm">Swap</h2>
            <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
              isOnChain
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-white/5 text-textMuted border border-border'
            }`}>
              {isOnChain ? 'on-chain' : isLiveChain ? 'live reads / sim tx' : 'simulation'}
            </span>
          </div>
          <p className="text-[11px] text-textDim mt-1 font-mono">
            1 {symIn} = {tokenIn === 'A' ? spotPrice : (parseFloat(spotPrice) > 0 ? (1 / parseFloat(spotPrice)).toFixed(6) : '—')} {symOut}
          </p>
        </div>
        <button
          onClick={() => setShowSettings(v => !v)}
          className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-white/10 text-white' : 'text-textMuted hover:text-white'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="px-5 py-3 border-t border-border bg-surfaceElevated/50 animate-slide-up">
          <div className="mb-3">
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">Slippage</p>
            <div className="flex items-center gap-1.5">
              {SLIPPAGE_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => { setSlippage(p); setCustomSlippage(''); }}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    slippage === p && !customSlippage ? 'bg-white text-black' : 'bg-white/5 text-textMuted hover:text-white'
                  }`}
                >
                  {p}%
                </button>
              ))}
              <input
                type="number"
                placeholder="Custom"
                value={customSlippage}
                onChange={e => { setCustomSlippage(e.target.value); if (e.target.value) setSlippage(parseFloat(e.target.value) || 0.5); }}
                className="flex-1 bg-black border border-border rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-white/20"
              />
            </div>
          </div>
          <div>
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">Deadline</p>
            <div className="flex items-center gap-1.5">
              {[10, 20, 60].map(m => (
                <button
                  key={m}
                  onClick={() => setDeadline(m)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    deadline === m ? 'bg-white text-black' : 'bg-white/5 text-textMuted hover:text-white'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="p-5 space-y-2">
        {/* Token In */}
        <TokenInput
          label="You pay"
          amount={amountIn}
          onChange={setAmountIn}
          symbol={symIn}
          balance={reserveIn}
        />

        {/* Presets */}
        <div className="flex gap-1">
          {[25, 50, 75, 100].map(p => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className="flex-1 py-1 rounded text-[10px] font-mono bg-white/3 hover:bg-white/8 text-textMuted hover:text-white transition-colors"
            >
              {p}%
            </button>
          ))}
        </div>

        {/* Flip */}
        <div className="flex justify-center -my-0.5">
          <button
            onClick={flip}
            className="p-1.5 rounded-lg bg-surfaceElevated border border-border hover:border-white/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-textMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>

        {/* Token Out */}
        <TokenInput
          label="You receive"
          amount={quoting ? '' : amountOut}
          symbol={symOut}
          readOnly
          placeholder={quoting ? 'Quoting...' : '0.0'}
        />

        {/* Details */}
        {amountOut && !quoting && (
          <div className="rounded-lg bg-surfaceElevated border border-border p-3 space-y-1.5 mt-1 animate-slide-up text-[11px]">
            <DetailRow label="Impact">
              <span className={impactColor}>{(impact / 100).toFixed(2)}%</span>
            </DetailRow>
            <DetailRow label="Min received">
              <span className="font-mono text-white">{parseFloat(minOut || 0).toFixed(4)} {symOut}</span>
            </DetailRow>
            <DetailRow label="Fee">
              <span className="text-textMuted">{(parseFloat(amountIn) * 0.003).toFixed(4)} {symIn} (0.30%)</span>
            </DetailRow>
            {gasEst && (
              <DetailRow label="Gas">
                <span className="text-textMuted font-mono">{gasEst.estimatedCostEth} ETH</span>
              </DetailRow>
            )}
            <DetailRow label="Route">
              <span className="text-textMuted">{symIn} &rarr; {symOut}</span>
            </DetailRow>
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={handleSwap}
          disabled={loading || quoting || !amountIn || !amountOut || parseFloat(amountIn) <= 0}
          className={`w-full py-3.5 rounded-lg font-medium text-sm transition-all mt-1 ${
            loading || quoting || !amountIn || !amountOut
              ? 'bg-white/5 text-textMuted cursor-not-allowed'
              : impact > 300
              ? 'bg-danger/20 text-danger border border-danger/30 hover:bg-danger/30'
              : 'bg-white text-black hover:bg-white/90'
          }`}
        >
          {loading ? 'Swapping...' : quoting ? 'Fetching quote...' : !amountIn ? 'Enter an amount' : `Swap ${symIn} -> ${symOut}`}
        </button>
      </div>
    </div>
  );
}

function TokenInput({ label, amount, onChange, symbol, balance, readOnly, placeholder }) {
  return (
    <div className="token-input rounded-lg border border-border bg-surfaceElevated p-3 transition-all">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-textDim uppercase tracking-wider">{label}</span>
        {balance !== undefined && (
          <span className="text-[10px] text-textDim font-mono">
            Reserve: {parseFloat(balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={amount}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder || '0.0'}
          className="flex-1 bg-transparent text-white font-mono text-xl font-medium placeholder:text-textDim focus:outline-none min-w-0"
        />
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10">
          <TokenAvatar symbol={symbol} size="sm" />
          <span className="font-medium text-white text-sm">{symbol}</span>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-textMuted">{label}</span>
      {children}
    </div>
  );
}
