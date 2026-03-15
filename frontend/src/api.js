import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Pools ──────────────────────────────────────────────────────────────────────
export const getPools          = ()              => api.get('/pools');
export const getReserves       = (pool)          => api.get('/reserves',  { params: { pool } });
export const getStats          = (pool)          => api.get('/stats',     { params: { pool } });
export const getAnalytics      = (pool)          => api.get('/analytics', { params: { pool } });
export const getLPSupply       = (pool)          => api.get('/liquidity/total-supply', { params: { pool } });

// ── Swap ──────────────────────────────────────────────────────────────────────
export const getSwapQuote  = (tokenIn, amountIn, poolId) =>
  api.post('/swap/quote', { tokenIn, amountIn, poolId });
export const executeSwap   = (tokenIn, amountIn, poolId, slippageBps) =>
  api.post('/swap', { tokenIn, amountIn, poolId, slippageBps });

// ── Liquidity ─────────────────────────────────────────────────────────────────
export const addLiquidity    = (amountA, amountB, poolId) =>
  api.post('/liquidity/add', { amountA, amountB, poolId });
export const removeLiquidity = (liquidity, poolId) =>
  api.post('/liquidity/remove', { liquidity, poolId });

// ── Transactions ──────────────────────────────────────────────────────────────
export const getTransactions = (limit = 50, pool, type) =>
  api.get('/transactions', { params: { limit, pool, type } });

// ── Charts ────────────────────────────────────────────────────────────────────
export const getPriceHistory   = (pool, limit) =>
  api.get('/price-history', { params: { pool, limit } });
export const getSlippageCurve  = (tokenIn, pool) =>
  api.get('/slippage-curve', { params: { tokenIn, pool } });
export const getILCurve        = ()              => api.get('/impermanent-loss-curve');
export const getIL             = (ratio, feePct) =>
  api.get('/impermanent-loss', { params: { ratio, feePct } });

// ── Market ────────────────────────────────────────────────────────────────────
export const getMarketPrice    = (pair)           =>
  api.get('/market-price', { params: { pair } });
export const getArbitrage      = (pair, pool)     =>
  api.get('/arbitrage', { params: { pair, pool } });
export const getOHLCV          = (symbol, interval, limit) =>
  api.get('/ohlcv', { params: { symbol, interval, limit } });

// ── Research ──────────────────────────────────────────────────────────────────
export const runBacktest          = (limit)   => api.get('/backtest', { params: { limit } });
export const simulateMEV          = (body)    => api.post('/mev/simulate', body);
export const getConcentratedQuote = (params)  => api.get('/concentrated-quote', { params });

// ── Research Engine (Python) ────────────────────────────────────────────────
export const runSimulation     = (body)  => api.post('/research/simulation/run', body);
export const compareModels     = (body)  => api.post('/research/simulation/compare', body);
export const replayHistorical  = (body)  => api.post('/research/replay', body);
export const detectArbitrage   = (body)  => api.post('/research/arbitrage/detect', body);
export const simulateMEVPython = (body)  => api.post('/research/mev/simulate', body);
export const getILCurvePython  = ()      => api.get('/research/analytics/il-curve');
export const getSlippageCurvePython = (body) => api.post('/research/analytics/slippage-curve', body);
export const getResearchHealth = ()      => api.get('/research/health');

// ── Utils ─────────────────────────────────────────────────────────────────────
export const getGasEstimate = (operation) =>
  api.get('/gas-estimate', { params: { operation } });
export const claimFaucet    = (address)   => api.post('/faucet', { address });
export const getHealth      = ()          => api.get('/health');

// ── Backwards-compat aliases ──────────────────────────────────────────────────
export const getBacktest  = (limit)         => runBacktest(limit);
export const getTotalSupply = ()            => getLPSupply();

// ── WebSocket connection helper ───────────────────────────────────────────────
export function createWsConnection(onMessage, onOpen, onClose) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host     = window.location.hostname;
  const port     = '3001';
  const url      = `${protocol}//${host}:${port}`;

  let ws;
  let reconnectTimer;
  let closed = false;

  function connect() {
    if (closed) return;
    ws = new WebSocket(url);
    ws.onopen    = () => { clearTimeout(reconnectTimer); onOpen?.(); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
    ws.onclose   = () => {
      onClose?.();
      if (!closed) reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror   = () => ws.close();
  }

  connect();
  return {
    close: () => {
      closed = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    },
    send: (data) => ws?.readyState === 1 && ws.send(JSON.stringify(data)),
  };
}
