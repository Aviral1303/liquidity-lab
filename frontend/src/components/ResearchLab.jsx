import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend
} from 'recharts';
import { runBacktest, simulateMEV, getConcentratedQuote, getILCurve, runSimulation, compareModels, getResearchHealth } from '../api';

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black border border-white/10 rounded-lg p-2 text-[10px]">
      <p className="text-textMuted mb-0.5">{typeof label === 'number' ? new Date(label).toLocaleTimeString() : label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-mono text-white">{typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : p.value}</p>
      ))}
    </div>
  );
};

export function ResearchLab({ reserves, activePool, tokens }) {
  const [activeSection, setActiveSection] = useState('simulation');
  const [engineReady, setEngineReady] = useState(null);

  useEffect(() => {
    getResearchHealth().then(() => setEngineReady(true)).catch(() => setEngineReady(false));
  }, []);

  const sections = [
    { id: 'simulation', label: 'Simulation' },
    { id: 'compare',    label: 'Compare' },
    { id: 'backtest',   label: 'Backtest' },
    { id: 'mev',        label: 'MEV Sim' },
    { id: 'il',         label: 'IL Calc' },
    { id: 'clmm',       label: 'CLMM' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeSection === s.id
                ? 'bg-white text-black'
                : 'text-textMuted hover:text-white'
            }`}
          >
            {s.label}
          </button>
        ))}
        <span className={`ml-auto text-[9px] px-2 py-0.5 rounded font-mono ${
          engineReady === true ? 'bg-success/10 text-success border border-success/20'
            : engineReady === false ? 'bg-danger/10 text-danger border border-danger/20'
            : 'bg-white/5 text-textDim border border-border'
        }`}>
          {engineReady === true ? 'engine ready' : engineReady === false ? 'engine offline' : 'checking...'}
        </span>
      </div>

      {activeSection === 'simulation' && <SimulationSection />}
      {activeSection === 'compare'    && <CompareSection />}
      {activeSection === 'backtest'   && <BacktestSection tokens={tokens} />}
      {activeSection === 'mev'        && <MEVSection reserves={reserves} tokens={tokens} activePool={activePool} />}
      {activeSection === 'il'         && <ILSection />}
      {activeSection === 'clmm'       && <CLMMSection tokens={tokens} />}
    </div>
  );
}

const MODEL_COLORS = {
  constant_product: '#ffffff',
  stableswap: '#4ade80',
  balancer: '#fbbf24',
};

function SimulationSection() {
  const [steps, setSteps] = useState(200);
  const [model, setModel] = useState('constant_product');
  const [volatility, setVolatility] = useState(0.02);
  const [retailCount, setRetailCount] = useState(3);
  const [arbCount, setArbCount] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await runSimulation({
        steps,
        amm_model: model,
        price_volatility: volatility,
        reserve_a: 100000,
        reserve_b: 100000,
        initial_price: 1.0,
        fee_bps: 30,
        agents: {
          retail: { count: retailCount, min_trade_usd: 100, max_trade_usd: 10000 },
          arbitrageur: { count: arbCount, min_profit_bps: 10 },
          lp: { count: 0 },
        },
      });
      setResult(data);
    } catch (e) {
      console.error('Simulation error:', e);
    } finally { setLoading(false); }
  };

  const snapshots = result?.price_snapshots || [];
  const events = result?.events || [];
  const successfulSwaps = events.filter(e => e.success && e.action_type === 'swap').length;
  const arbSwaps = events.filter(e => e.success && e.agent_id.startsWith('arb')).length;

  return (
    <div className="border border-border rounded-xl bg-surface p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-medium text-white">Agent-Based Simulation</h3>
          <p className="text-[10px] text-textDim mt-1">
            Run multi-agent AMM simulations with retail traders, arbitrageurs, and LPs. Powered by the Python research engine.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">AMM Model</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            className="w-full bg-surfaceElevated border border-border rounded px-2 py-2 text-[10px] text-white focus:outline-none">
            <option value="constant_product">Constant Product (V2)</option>
            <option value="stableswap">StableSwap (Curve)</option>
            <option value="balancer">Balancer (Weighted)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Steps</label>
          <input type="number" value={steps} onChange={e => setSteps(parseInt(e.target.value) || 100)}
            className="w-full bg-surfaceElevated border border-border rounded px-2 py-2 text-[10px] text-white font-mono focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Volatility</label>
          <div className="flex gap-1">
            {[0.005, 0.02, 0.05, 0.1].map(v => (
              <button key={v} onClick={() => setVolatility(v)}
                className={`flex-1 py-2 rounded text-[10px] font-mono ${volatility === v ? 'bg-white text-black' : 'bg-white/5 text-textMuted hover:text-white'}`}>
                {(v * 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Agents</label>
          <div className="flex gap-1">
            <div className="flex-1">
              <input type="number" value={retailCount} onChange={e => setRetailCount(parseInt(e.target.value) || 1)} min={0} max={10}
                className="w-full bg-surfaceElevated border border-border rounded px-2 py-1.5 text-[10px] text-white font-mono focus:outline-none" />
              <p className="text-[8px] text-textDim mt-0.5 text-center">Retail</p>
            </div>
            <div className="flex-1">
              <input type="number" value={arbCount} onChange={e => setArbCount(parseInt(e.target.value) || 0)} min={0} max={5}
                className="w-full bg-surfaceElevated border border-border rounded px-2 py-1.5 text-[10px] text-white font-mono focus:outline-none" />
              <p className="text-[8px] text-textDim mt-0.5 text-center">Arb</p>
            </div>
          </div>
        </div>
      </div>

      <button onClick={run} disabled={loading}
        className="w-full py-2.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50 mb-4">
        {loading ? 'Running simulation...' : 'Run Simulation'}
      </button>

      {result && (
        <div className="space-y-4 animate-slide-up">
          <div className="grid grid-cols-4 gap-px bg-border rounded-lg overflow-hidden">
            {[
              { label: 'Total Volume', value: result.total_volume?.toFixed(2) },
              { label: 'Total Fees', value: result.total_fees?.toFixed(4), green: true },
              { label: 'Swaps', value: `${successfulSwaps} (${arbSwaps} arb)` },
              { label: 'Final Reserves', value: result.final_reserves?.map(r => r.toFixed(0)).join(' / ') },
            ].map(({ label, value, green }) => (
              <div key={label} className="bg-surface p-2.5">
                <p className="text-[9px] text-textDim uppercase tracking-wider mb-0.5">{label}</p>
                <p className={`text-xs font-mono font-medium ${green ? 'text-success' : 'text-white'}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">AMM Price vs Market Price</p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={snapshots} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="step" tick={{ fill: '#555', fontSize: 8 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#555', fontSize: 8 }} width={40} />
                  <Tooltip content={<Tip />} />
                  <Line type="monotone" dataKey="amm_price" stroke="#ffffff" strokeWidth={1.5} dot={false} name="AMM" />
                  <Line type="monotone" dataKey="market_price" stroke="rgba(255,255,255,0.3)" strokeWidth={1} dot={false} strokeDasharray="4 2" name="Market" />
                  <Legend wrapperStyle={{ fontSize: '9px' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">Cumulative Volume & Fees</p>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={snapshots} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffffff" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="step" tick={{ fill: '#555', fontSize: 8 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: '#555', fontSize: 8 }} width={40} />
                  <Tooltip content={<Tip />} />
                  <Area type="monotone" dataKey="volume_cumulative" stroke="rgba(255,255,255,0.5)" strokeWidth={1} fill="url(#volGrad)" dot={false} name="Volume" />
                  <Area type="monotone" dataKey="fees_cumulative" stroke="#4ade80" strokeWidth={1.5} fill="none" dot={false} name="Fees" />
                  <Legend wrapperStyle={{ fontSize: '9px' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="h-28 flex items-center justify-center text-textDim text-xs">
          Configure parameters and click "Run Simulation" to start
        </div>
      )}
    </div>
  );
}

function CompareSection() {
  const [steps, setSteps] = useState(150);
  const [volatility, setVolatility] = useState(0.02);
  const [models, setModels] = useState(['constant_product', 'stableswap', 'balancer']);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const toggleModel = (m) => {
    setModels(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  };

  const run = async () => {
    if (models.length < 2) return;
    setLoading(true);
    try {
      const { data } = await compareModels({
        steps,
        models,
        price_volatility: volatility,
        reserve_a: 100000,
        reserve_b: 100000,
        initial_price: 1.0,
        fee_bps: 30,
      });
      setResult(data);
    } catch (e) {
      console.error('Comparison error:', e);
    } finally { setLoading(false); }
  };

  const modelLabels = { constant_product: 'Uniswap V2', stableswap: 'Curve', balancer: 'Balancer' };

  // Merge price snapshots from all models for overlay chart
  const mergedData = result?.results?.[0]?.price_snapshots?.map((_, i) => {
    const point = { step: i };
    result.results.forEach(r => {
      const snap = r.price_snapshots[i];
      if (snap) {
        point[`${r.model}_price`] = snap.amm_price;
        point.market_price = snap.market_price;
      }
    });
    return point;
  }) || [];

  return (
    <div className="border border-border rounded-xl bg-surface p-5">
      <div className="mb-5">
        <h3 className="text-sm font-medium text-white">AMM Model Comparison</h3>
        <p className="text-[10px] text-textDim mt-1">
          Compare Constant Product, StableSwap, and Balancer under identical market conditions.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Models</label>
          <div className="flex gap-1">
            {Object.entries(modelLabels).map(([id, label]) => (
              <button key={id} onClick={() => toggleModel(id)}
                className={`flex-1 py-2 rounded text-[10px] transition-colors ${
                  models.includes(id) ? 'bg-white text-black' : 'bg-white/5 text-textMuted hover:text-white'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Steps</label>
          <input type="number" value={steps} onChange={e => setSteps(parseInt(e.target.value) || 100)}
            className="w-full bg-surfaceElevated border border-border rounded px-2 py-2 text-[10px] text-white font-mono focus:outline-none" />
        </div>
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Volatility</label>
          <div className="flex gap-1">
            {[0.005, 0.02, 0.05, 0.1].map(v => (
              <button key={v} onClick={() => setVolatility(v)}
                className={`flex-1 py-2 rounded text-[10px] font-mono ${volatility === v ? 'bg-white text-black' : 'bg-white/5 text-textMuted hover:text-white'}`}>
                {(v * 100).toFixed(1)}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={run} disabled={loading || models.length < 2}
        className="w-full py-2.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50 mb-4">
        {loading ? 'Comparing...' : `Compare ${models.length} Models`}
      </button>

      {result?.results && (
        <div className="space-y-4 animate-slide-up">
          {/* Summary table */}
          <div className="grid gap-px bg-border rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${result.results.length + 1}, 1fr)` }}>
            <div className="bg-surface p-2.5">
              <p className="text-[9px] text-textDim uppercase tracking-wider">Metric</p>
            </div>
            {result.results.map(r => (
              <div key={r.model} className="bg-surface p-2.5">
                <p className="text-[10px] font-medium" style={{ color: MODEL_COLORS[r.model] }}>{modelLabels[r.model]}</p>
              </div>
            ))}
            {['Volume', 'Fees', 'IL %'].map(metric => (
              <React.Fragment key={metric}>
                <div className="bg-surfaceElevated p-2.5">
                  <p className="text-[9px] text-textDim">{metric}</p>
                </div>
                {result.results.map(r => (
                  <div key={r.model + metric} className="bg-surfaceElevated p-2.5">
                    <p className="text-xs font-mono text-white">
                      {metric === 'Volume' ? r.total_volume.toFixed(2) :
                       metric === 'Fees' ? r.total_fees.toFixed(4) :
                       `${r.il_percent.toFixed(3)}%`}
                    </p>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>

          {/* Price overlay chart */}
          <div>
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">Price Tracking Comparison</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mergedData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="step" tick={{ fill: '#555', fontSize: 8 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#555', fontSize: 8 }} width={40} />
                <Tooltip content={<Tip />} />
                <Line type="monotone" dataKey="market_price" stroke="rgba(255,255,255,0.15)" strokeWidth={1} dot={false} strokeDasharray="4 2" name="Market" />
                {result.results.map(r => (
                  <Line key={r.model} type="monotone" dataKey={`${r.model}_price`} stroke={MODEL_COLORS[r.model]} strokeWidth={1.5} dot={false} name={modelLabels[r.model]} />
                ))}
                <Legend wrapperStyle={{ fontSize: '9px' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="h-28 flex items-center justify-center text-textDim text-xs">
          Select at least 2 models and click "Compare" to see head-to-head results
        </div>
      )}
    </div>
  );
}

function BacktestSection({ tokens }) {
  const [limit,   setLimit]   = useState(24);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await runBacktest(limit);
      if (data.success) setResult(data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const snapData = result?.snapshots?.map(s => ({
    t: new Date(s.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    price: parseFloat((s.price || 0).toFixed(4)),
    fees:  parseFloat((s.fees  || 0).toFixed(4)),
  })) || [];

  return (
    <div className="border border-border rounded-xl bg-surface p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="text-sm font-medium text-white">Historical LP Backtest</h3>
          <p className="text-[10px] text-textDim mt-1">Real ETH price data through the AMM. LP returns vs HODLing.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={e => setLimit(parseInt(e.target.value))}
            className="bg-surfaceElevated border border-border rounded px-2 py-1 text-[10px] text-white focus:outline-none"
          >
            <option value={24}>24h</option>
            <option value={48}>48h</option>
            <option value={72}>72h</option>
            <option value={168}>7d</option>
          </select>
          <button
            onClick={run}
            disabled={loading}
            className="px-3 py-1 rounded text-[10px] font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {result?.summary && (
        <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden mb-5">
          {[
            { label: 'Periods', value: result.summary.periods },
            { label: 'Fees', value: parseFloat(result.summary.totalFees).toFixed(4), green: true },
            { label: 'IL', value: `${result.summary.impermanentLossPercent}%`, red: parseFloat(result.summary.impermanentLossPercent) < 0 },
            { label: 'Fee Return', value: `${result.summary.feeReturnPercent}%`, green: true },
            { label: 'Net P&L', value: `${result.summary.netPnlPercent}%`, green: parseFloat(result.summary.netPnlPercent) >= 0, red: parseFloat(result.summary.netPnlPercent) < 0 },
            { label: 'HODL Value', value: parseFloat(result.summary.holdValue).toFixed(2) },
          ].map(({ label, value, green, red }) => (
            <div key={label} className="bg-surface p-2.5">
              <p className="text-[9px] text-textDim uppercase tracking-wider mb-0.5">{label}</p>
              <p className={`text-xs font-mono font-medium ${green ? 'text-success' : red ? 'text-danger' : 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {snapData.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">Price</p>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={snapData}>
                <defs><linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                </linearGradient></defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="price" stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="url(#btGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-2">Cumulative Fees</p>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={snapData}>
                <defs><linearGradient id="feeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4ade80" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                </linearGradient></defs>
                <XAxis dataKey="t" hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip content={<Tip />} />
                <Area type="monotone" dataKey="fees" stroke="#4ade80" strokeWidth={1.5} fill="url(#feeGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="h-28 flex items-center justify-center text-textDim text-xs">
          Click "Run" to simulate LP returns over real ETH price data
        </div>
      )}
    </div>
  );
}

function MEVSection({ reserves, tokens, activePool }) {
  const [victim, setVictim] = useState('5000');
  const [frMult, setFrMult] = useState(0.5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await simulateMEV({ victimAmountIn: parseFloat(victim), tokenIn: 'A', poolId: activePool, frontRunMultiplier: frMult });
      if (data.success) setResult(data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const steps = result ? [
    { step: 'Front-run',  in: result.frontRun.amountIn, out: result.frontRun.amountOut, warn: true },
    { step: 'Victim tx',  in: result.victim.amountIn,   out: result.victim.amountOut },
    { step: 'Back-run',   in: result.backRun.amountIn,  out: result.backRun.amountOut, warn: true },
  ] : [];

  return (
    <div className="border border-border rounded-xl bg-surface p-5">
      <h3 className="text-sm font-medium text-white mb-1">MEV Sandwich Simulator</h3>
      <p className="text-[10px] text-textDim mb-4">Simulate how a bot front-runs and back-runs a victim transaction.</p>

      <div className="grid md:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Victim size ({tokens.A.symbol})</label>
          <input
            type="number" value={victim} onChange={e => setVictim(e.target.value)}
            className="w-full bg-surfaceElevated border border-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-white/20"
          />
        </div>
        <div>
          <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">Bot multiplier</label>
          <div className="flex gap-1.5">
            {[0.25, 0.5, 1.0, 2.0].map(m => (
              <button key={m}
                onClick={() => setFrMult(m)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-mono transition-colors ${frMult === m ? 'bg-white text-black' : 'bg-white/5 text-textMuted hover:text-white'}`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={run} disabled={loading}
        className="w-full py-2.5 rounded-lg text-xs font-medium bg-white/5 text-white border border-border hover:bg-white/10 transition-colors disabled:opacity-50 mb-4"
      >
        {loading ? 'Simulating...' : 'Run Simulation'}
      </button>

      {result && (
        <div className="space-y-2 animate-slide-up">
          {steps.map(({ step, in: amtIn, out: amtOut, warn }) => (
            <div key={step} className={`rounded-lg border p-3 ${warn ? 'border-white/10 bg-white/3' : 'border-border bg-surfaceElevated'}`}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-textMuted font-medium">{step}</span>
                <span className="font-mono text-white">
                  {parseFloat(amtIn).toFixed(2)} {tokens.A.symbol} &rarr; {parseFloat(amtOut).toFixed(4)} {tokens.B.symbol}
                </span>
              </div>
            </div>
          ))}

          <div className={`rounded-lg border p-4 ${parseFloat(result.mevProfit) > 0 ? 'bg-danger/5 border-danger/20' : 'bg-surfaceElevated border-border'}`}>
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-1">MEV Extracted</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-mono font-semibold ${parseFloat(result.mevProfit) > 0 ? 'text-danger' : 'text-textMuted'}`}>
                {parseFloat(result.mevProfit).toFixed(4)} {tokens.A.symbol}
              </span>
              <span className="text-[10px] text-textMuted font-mono">({result.mevProfitBps} bps)</span>
            </div>
            <p className="text-[10px] text-textDim mt-1">
              Victim got {result.victimSlippageExtra} extra slippage from front-run.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ILSection() {
  const [ilData,    setIlData]    = useState([]);
  const [entryP,    setEntryP]    = useState('1.0');
  const [currentP,  setCurrentP]  = useState('');
  const [ilResult,  setIlResult]  = useState(null);
  const [feePct,    setFeePct]    = useState('');

  const loadCurve = async () => {
    try {
      const { data } = await getILCurve();
      if (data.success) setIlData(data.data.map(d => ({ ratio: parseFloat(d.ratio), il: parseFloat(d.impermanentLossPercent) })));
    } catch {}
  };

  useEffect(() => { loadCurve(); }, []);

  const calc = () => {
    const p0 = parseFloat(entryP) || 1;
    const p1 = parseFloat(currentP) || p0;
    const ratio = p1 / p0;
    const sqrtR = Math.sqrt(ratio);
    const il = (2 * sqrtR / (1 + ratio) - 1) * 100;
    const fp  = parseFloat(feePct) || 0;
    setIlResult({ ratio: ratio.toFixed(4), il: il.toFixed(4), net: (il + fp).toFixed(4), feePct: fp });
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="border border-border rounded-xl bg-surface p-5">
        <h3 className="text-xs font-medium text-textMuted uppercase tracking-wider mb-1">IL Curve</h3>
        <p className="text-[10px] text-textDim mb-4">Impermanent loss vs price ratio</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={ilData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ilGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f87171" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="ratio" tickFormatter={v => `${v.toFixed(1)}x`} tick={{ fill: '#555', fontSize: 9 }} />
            <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill: '#555', fontSize: 9 }} width={36} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
            <Area type="monotone" dataKey="il" stroke="#f87171" strokeWidth={1.5} fill="url(#ilGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="border border-border rounded-xl bg-surface p-5">
        <h3 className="text-xs font-medium text-textMuted uppercase tracking-wider mb-4">IL Calculator</h3>
        <div className="space-y-3">
          {[
            { label: 'Entry price', value: entryP, set: setEntryP, ph: '1.0' },
            { label: 'Current price', value: currentP, set: setCurrentP, ph: '1.5' },
            { label: 'Fees earned (%)', value: feePct, set: setFeePct, ph: '0.0' },
          ].map(({ label, value, set, ph }) => (
            <div key={label}>
              <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">{label}</label>
              <input
                type="number" value={value} onChange={e => set(e.target.value)} placeholder={ph}
                className="w-full bg-surfaceElevated border border-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-white/20"
              />
            </div>
          ))}
          <button
            onClick={calc}
            className="w-full py-2.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors"
          >
            Calculate
          </button>

          {ilResult && (
            <div className="rounded-lg bg-surfaceElevated border border-border p-3 space-y-1.5 animate-slide-up text-[11px]">
              <Row label="Ratio"><span className="font-mono text-white">{ilResult.ratio}x</span></Row>
              <Row label="IL"><span className={`font-mono ${parseFloat(ilResult.il) < 0 ? 'text-danger' : 'text-success'}`}>{ilResult.il}%</span></Row>
              {ilResult.feePct > 0 && <Row label="Fees"><span className="font-mono text-success">+{ilResult.feePct}%</span></Row>}
              <div className="border-t border-border pt-1.5">
                <Row label="Net">
                  <span className={`font-mono font-semibold text-sm ${parseFloat(ilResult.net) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {ilResult.net}%
                  </span>
                </Row>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CLMMSection({ tokens }) {
  const [pa,       setPa]       = useState('0.9');
  const [pb,       setPb]       = useState('1.1');
  const [pCurrent, setPCurrent] = useState('1.0');
  const [amountIn, setAmountIn] = useState('100');
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await getConcentratedQuote({
        pa: parseFloat(pa), pb: parseFloat(pb),
        pCurrent: parseFloat(pCurrent), amountIn: parseFloat(amountIn),
      });
      if (data.success) setResult(data.data);
    } catch {}
    finally { setLoading(false); }
  };

  const range = parseFloat(pb) - parseFloat(pa);
  const rangePct = parseFloat(pCurrent) > 0 ? (range / parseFloat(pCurrent) * 100).toFixed(1) : '—';

  return (
    <div className="border border-border rounded-xl bg-surface p-5">
      <h3 className="text-sm font-medium text-white mb-1">Concentrated Liquidity (V3)</h3>
      <p className="text-[10px] text-textDim mb-5">Set a price range for higher capital efficiency than full-range V2.</p>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-3">
          {[
            { label: 'Min price (Pa)', value: pa, set: setPa },
            { label: 'Max price (Pb)', value: pb, set: setPb },
            { label: 'Current price',  value: pCurrent, set: setPCurrent },
            { label: `Amount (${tokens.A.symbol})`, value: amountIn, set: setAmountIn },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="text-[10px] text-textDim uppercase tracking-wider block mb-1">{label}</label>
              <input
                type="number" value={value} onChange={e => set(e.target.value)}
                className="w-full bg-surfaceElevated border border-border rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-white/20"
              />
            </div>
          ))}
          <button
            onClick={run} disabled={loading}
            className="w-full py-2.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? 'Calculating...' : 'Get Quote'}
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-surfaceElevated rounded-lg p-4">
            <p className="text-[10px] text-textDim uppercase tracking-wider mb-3">Price Range</p>
            <div className="relative h-6 bg-white/3 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-white/15 rounded-full"
                style={{
                  left: `${Math.max(0, ((parseFloat(pa) / (parseFloat(pb) * 1.2)) * 100))}%`,
                  right: `${Math.max(0, 100 - ((parseFloat(pb) / (parseFloat(pb) * 1.2)) * 100))}%`,
                }}
              />
              <div
                className="absolute w-1 h-full bg-white rounded-full"
                style={{ left: `${Math.min(95, Math.max(2, ((parseFloat(pCurrent) / (parseFloat(pb) * 1.2)) * 100)))}%` }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-textDim mt-1.5 font-mono">
              <span>{pa}</span>
              <span className="text-white">{pCurrent}</span>
              <span>{pb}</span>
            </div>
            <p className="text-[10px] text-textDim mt-2">Range: <span className="text-white font-mono">{rangePct}%</span></p>
          </div>

          {result && (
            <div className="bg-surfaceElevated rounded-lg p-4 space-y-2 animate-slide-up text-[11px]">
              <Row label="In range?">
                <span className={result.inRange ? 'text-success' : 'text-danger'}>{result.inRange ? 'Yes' : 'Out of range'}</span>
              </Row>
              {result.inRange && (
                <>
                  <Row label={`Out (${tokens.B.symbol})`}>
                    <span className="font-mono text-white font-medium">{parseFloat(result.amountOut).toFixed(4)}</span>
                  </Row>
                  <Row label="Price after">
                    <span className="font-mono text-white">{parseFloat(result.priceAfter).toFixed(6)}</span>
                  </Row>
                  <Row label="Capital efficiency">
                    <span className="font-mono text-success font-medium">{result.capitalEfficiencyVsV2}</span>
                  </Row>
                </>
              )}
            </div>
          )}

          <div className="bg-surfaceElevated rounded-lg p-3">
            <p className="text-[10px] text-textDim leading-relaxed">
              Narrower range = higher fee APR but risk of going out-of-range.
              V3 LPs actively manage positions for maximum yield.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-textMuted">{label}</span>
      {children}
    </div>
  );
}
