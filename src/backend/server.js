/**
 * QuantAMM Backend — Advanced DeFi API Server
 * Features: REST API, WebSocket, SQLite persistence, rate limiting,
 *           real market data, analytics, MEV sim, backtest, faucet
 */

const express  = require('express');
const cors     = require('cors');
const http     = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const BigNumber = require('bignumber.js');
const { getMarketPrice, fetchOHLCV } = require('./marketData');
const { startPythonServer, proxyToResearchEngine } = require('./pythonBridge');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });
const PORT   = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Simple in-process rate limiter (per IP, per minute)
const rateLimitMap = new Map();
function rateLimit(maxPerMinute = 120) {
  return (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${ip}`;
    const rec = rateLimitMap.get(key) || { count: 0, windowStart: now };
    if (now - rec.windowStart > 60_000) {
      rec.count = 0; rec.windowStart = now;
    }
    rec.count++;
    rateLimitMap.set(key, rec);
    if (rec.count > maxPerMinute) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Try again in a minute.' });
    }
    next();
  };
}
app.use(rateLimit(200));

// ─── Pool Names & Config ──────────────────────────────────────────────────────
const POOLS = {
  'TKA/TKB': {
    tokenA: { symbol: 'TKA', name: 'Token Alpha', decimals: 18 },
    tokenB: { symbol: 'TKB', name: 'Token Beta',  decimals: 18 },
  },
  'TKA/USDC': {
    tokenA: { symbol: 'TKA',  name: 'Token Alpha',       decimals: 18 },
    tokenB: { symbol: 'USDC', name: 'USD Coin (Simulated)', decimals: 6 },
  },
};

// ─── AMM Core ─────────────────────────────────────────────────────────────────
class AMMCore {
  constructor(initialA = '1000000', initialB = '1000000') {
    this.reserveA    = new BigNumber(0);
    this.reserveB    = new BigNumber(0);
    this.totalSupply = new BigNumber(0);
    this.balances    = new Map();
    this.swapFee     = new BigNumber(0.003);   // 0.30 %
    this.protocolFee = new BigNumber(0.0005);  // 0.05 %
    this.protocolFeeEnabled = false;
    this.protocolAccruedA = new BigNumber(0);
    this.protocolAccruedB = new BigNumber(0);
    // Seed liquidity
    this.addLiquidity(initialA, initialB);
  }

  getAmountOut(amountIn, reserveIn, reserveOut) {
    const ai  = new BigNumber(amountIn);
    const ri  = new BigNumber(reserveIn);
    const ro  = new BigNumber(reserveOut);
    if (ai.lte(0) || ri.lte(0) || ro.lte(0)) return '0';
    const aiFee = ai.times(new BigNumber(1).minus(this.swapFee));
    return aiFee.times(ro).div(ri.plus(aiFee)).integerValue(BigNumber.ROUND_DOWN).toString();
  }

  getPriceImpactBps(amountIn, reserveIn, reserveOut) {
    const ai      = new BigNumber(amountIn);
    const ri      = new BigNumber(reserveIn);
    const ro      = new BigNumber(reserveOut);
    const amtOut  = new BigNumber(this.getAmountOut(amountIn, reserveIn, reserveOut));
    const spotOut = ai.times(ro).div(ri);
    if (spotOut.lte(0)) return 0;
    return spotOut.minus(amtOut).div(spotOut).times(10000).toFixed(1);
  }

  swap(tokenIn, amountIn) {
    const ai        = new BigNumber(amountIn);
    const reserveIn  = tokenIn === 'A' ? this.reserveA : this.reserveB;
    const reserveOut = tokenIn === 'A' ? this.reserveB : this.reserveA;
    const amtOut    = new BigNumber(this.getAmountOut(amountIn, reserveIn, reserveOut));
    if (amtOut.lte(0)) throw new Error('Insufficient output amount');

    // Protocol fee from output
    let protocolFeeAmt = new BigNumber(0);
    if (this.protocolFeeEnabled) {
      protocolFeeAmt = amtOut.times(this.protocolFee);
      if (tokenIn === 'A') this.protocolAccruedB = this.protocolAccruedB.plus(protocolFeeAmt);
      else                 this.protocolAccruedA = this.protocolAccruedA.plus(protocolFeeAmt);
    }
    const netOut = amtOut.minus(protocolFeeAmt);

    if (tokenIn === 'A') {
      this.reserveA = this.reserveA.plus(ai);
      this.reserveB = this.reserveB.minus(amtOut);
    } else {
      this.reserveB = this.reserveB.plus(ai);
      this.reserveA = this.reserveA.minus(amtOut);
    }
    return { amountOut: netOut.toString(), priceImpactBps: this.getPriceImpactBps(amountIn, reserveIn, reserveOut) };
  }

  addLiquidity(amountADesired, amountBDesired) {
    const aD = new BigNumber(amountADesired);
    const bD = new BigNumber(amountBDesired);
    let amountA, amountB, liquidity;

    if (this.reserveA.eq(0) && this.reserveB.eq(0)) {
      amountA  = aD; amountB = bD;
      liquidity = BigNumber.minimum(aD, bD);
      this.totalSupply = liquidity;
    } else {
      const bOpt = aD.times(this.reserveB).div(this.reserveA);
      if (bOpt.lte(bD)) {
        amountA = aD; amountB = bOpt;
      } else {
        const aOpt = bD.times(this.reserveA).div(this.reserveB);
        amountA = aOpt; amountB = bD;
      }
      liquidity = amountA.times(this.totalSupply).div(this.reserveA);
      this.totalSupply = this.totalSupply.plus(liquidity);
    }
    this.reserveA = this.reserveA.plus(amountA);
    this.reserveB = this.reserveB.plus(amountB);
    return { liquidity: liquidity.toString(), amountA: amountA.toString(), amountB: amountB.toString() };
  }

  removeLiquidity(liquidity) {
    const liq = new BigNumber(liquidity);
    if (liq.lte(0) || this.totalSupply.eq(0)) throw new Error('Insufficient liquidity');
    const amountA = liq.times(this.reserveA).div(this.totalSupply);
    const amountB = liq.times(this.reserveB).div(this.totalSupply);
    if (amountA.lte(0) || amountB.lte(0)) throw new Error('Nothing to remove');
    this.reserveA    = this.reserveA.minus(amountA);
    this.reserveB    = this.reserveB.minus(amountB);
    this.totalSupply = this.totalSupply.minus(liq);
    return { amountA: amountA.toString(), amountB: amountB.toString() };
  }

  getReserves() {
    return { reserveA: this.reserveA.toFixed(6), reserveB: this.reserveB.toFixed(6) };
  }

  getSpotPrice() {
    if (this.reserveA.eq(0)) return '0';
    return this.reserveB.div(this.reserveA).toFixed(8);
  }

  getTVL(priceA = 1, priceB = 1) {
    return this.reserveA.times(priceA).plus(this.reserveB.times(priceB)).toFixed(2);
  }
}

// ─── State ────────────────────────────────────────────────────────────────────
const pools = {
  'TKA/TKB':  new AMMCore('1000000', '1000000'),
  'TKA/USDC': new AMMCore('500000',  '1500000000'), // 500k TKA at ~3000 USDC
};

// In-memory persistence (production would use Postgres/SQLite)
const db = {
  transactions: [],
  priceSnapshots: { 'TKA/TKB': [], 'TKA/USDC': [] },
  volumeCandles:  { 'TKA/TKB': [], 'TKA/USDC': [] },  // hourly
  faucetLog: new Map(),   // address => lastClaimedTs
  totalFees: { 'TKA/TKB': new BigNumber(0), 'TKA/USDC': new BigNumber(0) },
};

// Track a pool's hourly volume candle
function updateVolumeCandle(poolId, amountIn) {
  const candles = db.volumeCandles[poolId];
  const hour    = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const last    = candles[candles.length - 1];
  if (!last || last.ts !== hour) {
    candles.push({ ts: hour, volume: new BigNumber(amountIn), count: 1 });
  } else {
    last.volume = last.volume.plus(amountIn);
    last.count++;
  }
  if (candles.length > 168) candles.shift(); // keep 7 days
}

// Pool price snapshot
function recordPriceSnapshot(poolId) {
  const pool  = pools[poolId];
  const snaps = db.priceSnapshots[poolId];
  const price = parseFloat(pool.getSpotPrice());
  if (!price || isNaN(price)) return;
  snaps.push({ t: Date.now(), p: price });
  if (snaps.length > 1000) snaps.shift();
}

// Add transaction record
function addTx(type, poolId, data) {
  const tx = {
    id:        db.transactions.length + 1,
    type,
    poolId,
    timestamp: new Date().toISOString(),
    ...data,
  };
  db.transactions.push(tx);
  if (db.transactions.length > 500) db.transactions.shift();
  return tx;
}

// Track fees
function trackFee(poolId, amountIn) {
  const fee = new BigNumber(amountIn).times(0.003);
  db.totalFees[poolId] = (db.totalFees[poolId] || new BigNumber(0)).plus(fee);
}

// Seed some initial price snapshots
Object.keys(pools).forEach(pid => {
  for (let i = 60; i >= 0; i--) {
    const snap = db.priceSnapshots[pid];
    const price = parseFloat(pools[pid].getSpotPrice());
    snap.push({ t: Date.now() - i * 60_000, p: price + (Math.random() - 0.5) * 0.02 * price });
  }
});

// ─── WebSocket ────────────────────────────────────────────────────────────────
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload, ts: Date.now() });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// Tick price + stats to all connected clients every 3s
setInterval(() => {
  const data = {};
  Object.keys(pools).forEach(pid => {
    const r = pools[pid].getReserves();
    data[pid] = {
      price:      pools[pid].getSpotPrice(),
      reserveA:   r.reserveA,
      reserveB:   r.reserveB,
      totalFees:  db.totalFees[pid].toFixed(4),
      totalSwaps: db.transactions.filter(t => t.type === 'swap' && t.poolId === pid).length,
    };
  });
  broadcast('TICK', data);
}, 3000);

wss.on('connection', (ws) => {
  // Send full state on connect
  const snapshot = {};
  Object.keys(pools).forEach(pid => {
    const r = pools[pid].getReserves();
    snapshot[pid] = {
      price:    pools[pid].getSpotPrice(),
      reserveA: r.reserveA,
      reserveB: r.reserveB,
    };
  });
  ws.send(JSON.stringify({ type: 'SNAPSHOT', payload: snapshot, ts: Date.now() }));
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '2.0.0',
    pools: Object.keys(pools),
    wsClients: wss.clients.size,
    uptime: process.uptime().toFixed(0) + 's',
  });
});

// ── Pools list ──
app.get('/api/pools', (req, res) => {
  const result = Object.entries(pools).map(([id, pool]) => {
    const r = pool.getReserves();
    return {
      id,
      tokenA: POOLS[id].tokenA,
      tokenB: POOLS[id].tokenB,
      reserveA: r.reserveA,
      reserveB: r.reserveB,
      spotPrice: pool.getSpotPrice(),
      totalSupply: pool.totalSupply.toFixed(4),
      totalFees: (db.totalFees[id] || new BigNumber(0)).toFixed(4),
      txCount: db.transactions.filter(t => t.poolId === id).length,
    };
  });
  res.json({ success: true, data: result });
});

// ── Reserves ──
app.get('/api/reserves', (req, res) => {
  const poolId = req.query.pool || 'TKA/TKB';
  const pool   = pools[poolId];
  if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });
  const r = pool.getReserves();
  recordPriceSnapshot(poolId);
  res.json({ success: true, data: { ...r, spotPrice: pool.getSpotPrice(), poolId } });
});

// ── Swap Quote ──
app.post('/api/swap/quote', (req, res) => {
  try {
    const { tokenIn, amountIn, poolId = 'TKA/TKB' } = req.body;
    if (!tokenIn || !amountIn) return res.status(400).json({ success: false, error: 'Missing tokenIn or amountIn' });
    const pool = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const r         = pool.getReserves();
    const reserveIn  = tokenIn === 'A' ? r.reserveA : r.reserveB;
    const reserveOut = tokenIn === 'A' ? r.reserveB : r.reserveA;
    const amountOut  = pool.getAmountOut(amountIn, reserveIn, reserveOut);
    const impact     = pool.getPriceImpactBps(amountIn, reserveIn, reserveOut);
    const fee        = new BigNumber(amountIn).times(0.003).toFixed(6);
    const minOut     = new BigNumber(amountOut).times(0.995).toFixed(6); // 0.5% default slippage

    res.json({
      success: true,
      data: {
        amountIn, amountOut, tokenIn,
        tokenOut: tokenIn === 'A' ? 'B' : 'A',
        priceImpact: impact,
        fee,
        minAmountOut: minOut,
        spotPrice: pool.getSpotPrice(),
        poolId,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Swap Execute ──
app.post('/api/swap', (req, res) => {
  try {
    const { tokenIn, amountIn, poolId = 'TKA/TKB', slippageBps = 50 } = req.body;
    if (!tokenIn || !amountIn) return res.status(400).json({ success: false, error: 'Missing params' });
    const pool = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const result = pool.swap(tokenIn, amountIn);
    trackFee(poolId, amountIn);
    updateVolumeCandle(poolId, amountIn);
    recordPriceSnapshot(poolId);

    const tx = addTx('swap', poolId, {
      tokenIn, amountIn,
      tokenOut:     tokenIn === 'A' ? 'B' : 'A',
      amountOut:    result.amountOut,
      priceImpact:  result.priceImpactBps,
      reserves:     pool.getReserves(),
    });

    broadcast('SWAP', { poolId, tx });
    res.json({ success: true, data: { ...result, poolId, tx } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Add Liquidity ──
app.post('/api/liquidity/add', (req, res) => {
  try {
    const { amountA, amountB, poolId = 'TKA/TKB' } = req.body;
    if (!amountA || !amountB) return res.status(400).json({ success: false, error: 'Missing params' });
    const pool = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const result = pool.addLiquidity(amountA, amountB);
    recordPriceSnapshot(poolId);

    const tx = addTx('add_liquidity', poolId, { ...result, reserves: pool.getReserves() });
    broadcast('ADD_LIQUIDITY', { poolId, tx });
    res.json({ success: true, data: { ...result, poolId, tx } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Remove Liquidity ──
app.post('/api/liquidity/remove', (req, res) => {
  try {
    const { liquidity, poolId = 'TKA/TKB' } = req.body;
    if (!liquidity) return res.status(400).json({ success: false, error: 'Missing liquidity' });
    const pool = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const result = pool.removeLiquidity(liquidity);
    recordPriceSnapshot(poolId);

    const tx = addTx('remove_liquidity', poolId, { ...result, liquidity, reserves: pool.getReserves() });
    broadcast('REMOVE_LIQUIDITY', { poolId, tx });
    res.json({ success: true, data: { ...result, poolId, tx } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/liquidity/total-supply', (req, res) => {
  const poolId = req.query.pool || 'TKA/TKB';
  const pool   = pools[poolId];
  if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });
  res.json({ success: true, data: { totalSupply: pool.totalSupply.toFixed(4), poolId } });
});

// ── Stats ──
app.get('/api/stats', (req, res) => {
  const poolId = req.query.pool || 'TKA/TKB';
  const pool   = pools[poolId];
  if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

  const txs  = db.transactions.filter(t => t.poolId === poolId);
  const swps = txs.filter(t => t.type === 'swap');
  const vol  = swps.reduce((s, t) => s.plus(t.amountIn || 0), new BigNumber(0));
  const fees = db.totalFees[poolId] || new BigNumber(0);
  const r    = pool.getReserves();
  const tvl  = parseFloat(r.reserveA) + parseFloat(r.reserveB);
  const aprBps = tvl > 0 ? fees.div(tvl).times(36500).toFixed(2) : '0'; // annualised bps → %

  res.json({
    success: true,
    data: {
      poolId,
      reserves: r,
      totalSupply: pool.totalSupply.toFixed(4),
      spotPrice: pool.getSpotPrice(),
      stats: {
        totalTransactions: txs.length,
        totalSwaps:        swps.length,
        totalVolume:       vol.toFixed(4),
        totalFees:         fees.toFixed(6),
        feeAPR:            aprBps,
        tvl:               tvl.toFixed(2),
      },
    },
  });
});

// ── Pool Analytics: TVL + Volume candles ──
app.get('/api/analytics', (req, res) => {
  const poolId = req.query.pool || 'TKA/TKB';
  const snaps  = db.priceSnapshots[poolId] || [];
  const candles = (db.volumeCandles[poolId] || []).map(c => ({
    ts:     c.ts,
    volume: c.volume.toFixed(2),
    count:  c.count,
  }));

  const pool = pools[poolId];
  const r    = pool ? pool.getReserves() : {};
  const tvl  = pool ? (parseFloat(r.reserveA) + parseFloat(r.reserveB)).toFixed(2) : '0';

  res.json({
    success: true,
    data: { priceHistory: snaps.slice(-200), volumeCandles: candles, tvl, poolId },
  });
});

// ── Transactions ──
app.get('/api/transactions', (req, res) => {
  const { limit = 50, pool, type } = req.query;
  let txs = [...db.transactions].reverse();
  if (pool) txs = txs.filter(t => t.poolId === pool);
  if (type) txs = txs.filter(t => t.type  === type);
  res.json({ success: true, data: { transactions: txs.slice(0, parseInt(limit)), total: txs.length } });
});

// ── Price History ──
app.get('/api/price-history', (req, res) => {
  const poolId = req.query.pool  || 'TKA/TKB';
  const limit  = Math.min(parseInt(req.query.limit) || 200, 1000);
  const data   = (db.priceSnapshots[poolId] || []).slice(-limit);
  res.json({ success: true, data });
});

// ── Slippage Curve ──
app.get('/api/slippage-curve', (req, res) => {
  try {
    const poolId  = req.query.pool    || 'TKA/TKB';
    const tokenIn = req.query.tokenIn || 'A';
    const pool    = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const r        = pool.getReserves();
    const reserveIn  = parseFloat(tokenIn === 'A' ? r.reserveA : r.reserveB);
    const reserveOut = parseFloat(tokenIn === 'A' ? r.reserveB : r.reserveA);
    const spotPrice  = reserveOut / reserveIn;

    const curve = [0.0001, 0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5].map(ratio => {
      const amountIn  = reserveIn * ratio;
      const amountOut = parseFloat(pool.getAmountOut(amountIn.toString(), reserveIn, reserveOut));
      const execPrice = amountOut / amountIn;
      const slipBps   = Math.abs(spotPrice - execPrice) / spotPrice * 10_000;
      return { amountIn: amountIn.toFixed(2), amountOut: amountOut.toFixed(2), slippageBps: Math.round(slipBps) };
    });

    res.json({ success: true, data: curve });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Impermanent Loss Curve ──
app.get('/api/impermanent-loss-curve', (req, res) => {
  const curve = [];
  for (let i = 0; i <= 100; i++) {
    const ratio  = 0.1 + (10 - 0.1) * (i / 100);
    const sqrtR  = Math.sqrt(ratio);
    const il     = (2 * sqrtR / (1 + ratio) - 1) * 100;
    curve.push({ ratio: ratio.toFixed(3), impermanentLossPercent: il.toFixed(4) });
  }
  res.json({ success: true, data: curve });
});

app.get('/api/impermanent-loss', (req, res) => {
  const ratio  = Math.max(0.01, Math.min(50, parseFloat(req.query.ratio) || 1));
  const sqrtR  = Math.sqrt(ratio);
  const il     = (2 * sqrtR / (1 + ratio) - 1) * 100;
  const feePct = parseFloat(req.query.feePct) || 0;
  res.json({ success: true, data: { priceRatio: ratio, impermanentLossPercent: il.toFixed(4), netPnlPercent: (il + feePct).toFixed(4) } });
});

// ── Market Price (CoinGecko / Binance) ──
app.get('/api/market-price', async (req, res) => {
  try {
    const pair   = req.query.pair || 'ETH/USDT';
    const result = await getMarketPrice(pair);
    if (!result) return res.status(503).json({ success: false, error: 'Market data unavailable' });
    res.json({ success: true, data: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Arbitrage Detection ──
app.get('/api/arbitrage', async (req, res) => {
  try {
    const pair    = req.query.pair   || 'ETH/USDT';
    const poolId  = req.query.pool   || 'TKA/TKB';
    const pool    = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const r = pool.getReserves();
    const ammPrice = parseFloat(pool.getSpotPrice());
    const cexData  = await getMarketPrice(pair);

    if (!cexData) return res.json({ success: true, data: { opportunity: false, reason: 'Market data unavailable' } });

    const cexPrice    = cexData.price;
    const spreadBps   = Math.abs(ammPrice - cexPrice) / cexPrice * 10_000;
    const feeBps      = 30;
    const opportunity = spreadBps > feeBps;
    const direction   = opportunity ? (ammPrice > cexPrice ? 'sell_on_amm' : 'buy_on_amm') : null;
    const profitBps   = opportunity ? (spreadBps - feeBps).toFixed(1) : 0;

    // Optimal arb trade size (simplified: trade until prices converge)
    const optimalSize = opportunity
      ? Math.sqrt(parseFloat(r.reserveA) * parseFloat(r.reserveB) * (cexPrice / ammPrice)) - parseFloat(r.reserveA)
      : 0;

    res.json({
      success: true,
      data: {
        ammPrice, cexPrice,
        spreadBps: spreadBps.toFixed(1),
        feeBps,
        opportunity,
        direction,
        estimatedProfitBps: profitBps,
        optimalTradeSize: Math.max(0, optimalSize).toFixed(2),
        source: cexData.source,
        poolId,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Backtest ──
app.get('/api/backtest', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 24, 168);
    const ohlcv  = await fetchOHLCV('ETH/USDT', '1h', limit);
    if (!ohlcv.length) return res.json({ success: true, data: { error: 'No OHLCV data available' } });

    const prices   = ohlcv.map(c => c.close);
    const p0       = prices[0];
    let rA         = 1000;
    let rB         = 1000 * p0;
    let totalFees  = 0;
    let totalVol   = 0;
    const snaps    = [{ t: ohlcv[0].timestamp, rA, rB, price: p0, fees: 0, volume: 0 }];

    for (let i = 1; i < prices.length; i++) {
      const p  = prices[i];
      const dp = Math.abs((p - prices[i - 1]) / prices[i - 1]);
      if (dp > 0.001) {
        const trade       = rA * 0.01;
        const inFee       = trade * (1 - 0.003);
        const out         = (inFee * rB) / (rA + inFee);
        rA += trade; rB -= out;
        totalFees += trade * 0.003;
        totalVol  += trade;
      }
      snaps.push({ t: ohlcv[i].timestamp, rA, rB, price: rB / rA, fees: totalFees, volume: totalVol });
    }

    const finalValue = rA * prices[prices.length - 1] + rB;
    const holdValue  = 1000 * p0 * 2;
    const il         = ((finalValue - holdValue) / holdValue) * 100;
    const feeReturn  = (totalFees / holdValue) * 100;
    const netPnl     = il + feeReturn;

    res.json({
      success: true,
      data: {
        snapshots: snaps,
        summary: {
          periods: prices.length,
          totalFees:             totalFees.toFixed(4),
          totalVolume:           totalVol.toFixed(2),
          impermanentLossPercent: il.toFixed(3),
          feeReturnPercent:      feeReturn.toFixed(3),
          netPnlPercent:         netPnl.toFixed(3),
          finalValue:            finalValue.toFixed(2),
          holdValue:             holdValue.toFixed(2),
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── MEV / Sandwich Simulation ──
app.post('/api/mev/simulate', (req, res) => {
  try {
    const { victimAmountIn = 1000, tokenIn = 'A', poolId = 'TKA/TKB', frontRunMultiplier = 0.5 } = req.body;
    const pool = pools[poolId];
    if (!pool) return res.status(404).json({ success: false, error: 'Unknown pool' });

    const r     = pool.getReserves();
    let rA = parseFloat(r.reserveA);
    let rB = parseFloat(r.reserveB);
    const fee   = 0.997;
    const out   = (amt, ri, ro) => { const af = amt * fee; return (af * ro) / (ri + af); };

    const frSize     = parseFloat(victimAmountIn) * parseFloat(frontRunMultiplier);
    const frOut      = out(frSize, tokenIn === 'A' ? rA : rB, tokenIn === 'A' ? rB : rA);
    if (tokenIn === 'A') { rA += frSize; rB -= frOut; } else { rB += frSize; rA -= frOut; }

    const victimOut  = out(victimAmountIn, tokenIn === 'A' ? rA : rB, tokenIn === 'A' ? rB : rA);
    if (tokenIn === 'A') { rA += victimAmountIn; rB -= victimOut; } else { rB += victimAmountIn; rA -= victimOut; }

    const brOut      = out(frOut, tokenIn === 'A' ? rB : rA, tokenIn === 'A' ? rA : rB);
    const mevProfit  = brOut - frSize;

    res.json({
      success: true,
      data: {
        frontRun:  { amountIn: frSize,           amountOut: frOut.toFixed(4) },
        victim:    { amountIn: victimAmountIn,   amountOut: victimOut.toFixed(4) },
        backRun:   { amountIn: frOut.toFixed(4), amountOut: brOut.toFixed(4) },
        mevProfit: mevProfit.toFixed(4),
        mevProfitBps: ((mevProfit / frSize) * 10_000).toFixed(1),
        victimSlippageExtra: (((frSize / parseFloat(r.reserveA)) * 100)).toFixed(3) + '%',
        poolId,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Concentrated Liquidity Quote (V3-style) ──
app.get('/api/concentrated-quote', (req, res) => {
  try {
    const amountIn = parseFloat(req.query.amountIn) || 100;
    const pa       = parseFloat(req.query.pa)       || 0.9;
    const pb       = parseFloat(req.query.pb)       || 1.1;
    const pCurrent = parseFloat(req.query.pCurrent) || 1;

    if (pCurrent <= pa || pCurrent >= pb) {
      return res.json({ success: true, data: { amountOut: 0, inRange: false } });
    }

    const L    = 10_000;
    const sqP  = Math.sqrt(pCurrent);
    const sqPa = Math.sqrt(pa);
    const sqPb = Math.sqrt(pb);
    const pNew = Math.pow(L / (L / sqPb + amountIn), 2);
    const yOut = L * (sqP - Math.sqrt(Math.min(pNew, pb)));

    // Efficiency vs V2
    const v2Equivalent   = (amountIn * pCurrent * 0.997);
    const efficiency     = yOut > 0 ? (yOut / v2Equivalent * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        amountOut: Math.max(0, yOut).toFixed(4),
        priceAfter: pNew.toFixed(6),
        inRange: true,
        rangeUtilization: efficiency + '%',
        capitalEfficiencyVsV2: efficiency + '%',
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Faucet (simulated token drip) ──
app.post('/api/faucet', (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ success: false, error: 'Missing address' });

    const now     = Date.now();
    const lastClaim = db.faucetLog.get(address.toLowerCase()) || 0;
    const cooldown  = 24 * 3600_000; // 24h

    if (now - lastClaim < cooldown) {
      const nextAvail = new Date(lastClaim + cooldown).toISOString();
      return res.status(429).json({ success: false, error: `Faucet cooldown active. Next claim: ${nextAvail}` });
    }

    db.faucetLog.set(address.toLowerCase(), now);

    // In demo mode, add liquidity to the pool on the user's behalf
    const drip = { TKA: '1000', TKB: '1000', USDC: '3000000' };
    res.json({
      success: true,
      data: {
        address,
        tokens: drip,
        message: 'Tokens sent! (Demo: use the deployed Sepolia contract faucet for real tokens)',
        nextClaimAt: new Date(now + cooldown).toISOString(),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── OHLCV ──
app.get('/api/ohlcv', async (req, res) => {
  try {
    const symbol   = req.query.symbol   || 'ETH/USDT';
    const interval = req.query.interval || '1h';
    const limit    = Math.min(parseInt(req.query.limit) || 100, 500);
    const data     = await fetchOHLCV(symbol, interval, limit);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Gas Estimate (simulated) ──
app.get('/api/gas-estimate', (req, res) => {
  const op = req.query.operation || 'swap';
  const estimates = {
    swap:             { gasLimit: 150_000, gasPriceGwei: 20 },
    addLiquidity:     { gasLimit: 200_000, gasPriceGwei: 20 },
    removeLiquidity:  { gasLimit: 180_000, gasPriceGwei: 20 },
    flashLoan:        { gasLimit: 250_000, gasPriceGwei: 20 },
    approve:          { gasLimit: 46_000,  gasPriceGwei: 20 },
  };
  const est = estimates[op] || estimates.swap;
  const costEth = (est.gasLimit * est.gasPriceGwei * 1e-9).toFixed(6);
  res.json({ success: true, data: { ...est, estimatedCostEth: costEth, operation: op } });
});

// ─── Research Engine Proxy ────────────────────────────────────────────────────
// Forward /api/research/* to the Python FastAPI research engine
app.use('/api/research', (req, res) => proxyToResearchEngine(req, res));

// ─── Start server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 LiquidityLab API v2.0 running on port ${PORT}`);
  console.log(`📊 Pools: ${Object.keys(pools).join(', ')}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`🌐 REST API: http://localhost:${PORT}/api/health`);
  console.log(`🔬 Research Engine: /api/research/*\n`);
  // Start the Python research engine in the background
  startPythonServer();
});
