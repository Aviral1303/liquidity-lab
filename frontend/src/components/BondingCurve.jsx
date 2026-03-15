/**
 * BondingCurve — visualizes the x*y=k constant product curve
 *
 * Shows:
 * - The full hyperbola for the current pool
 * - Current price point (rA, rB)
 * - Where a trade would move the pool
 * - Price impact visually
 */
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ReferenceLine, CartesianGrid } from 'recharts';
import { bondingCurvePoints, ammQuote } from '../hooks/useOnChainReserves';

export function BondingCurve({ reserveA, reserveB, tradeAmount = 0, tokenIn = 'A', tokens }) {
  if (!reserveA || !reserveB || reserveA <= 0 || reserveB <= 0) {
    return (
      <div className="h-40 flex items-center justify-center text-textDim text-xs">
        Loading curve...
      </div>
    );
  }

  const curve = bondingCurvePoints(reserveA, reserveB, 100);

  // Current point
  const currentX = reserveA;
  const currentY = reserveB;
  const currentPrice = currentY / currentX;

  // Trade preview
  let newX = currentX;
  let newY = currentY;
  let amountOut = 0;
  if (tradeAmount > 0) {
    if (tokenIn === 'A') {
      amountOut = ammQuote(tradeAmount, currentX, currentY);
      newX = currentX + tradeAmount;
      newY = currentY - amountOut;
    } else {
      amountOut = ammQuote(tradeAmount, currentY, currentX);
      newY = currentY + tradeAmount;
      newX = currentX - amountOut;
    }
  }
  const newPrice = newY / newX;
  const impact = currentPrice > 0 ? Math.abs((newPrice - currentPrice) / currentPrice * 100) : 0;

  // Format large numbers
  const fmt = (n) => {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(2);
  };

  const CustomDot = ({ cx, cy, payload }) => {
    // Don't render dots on the curve itself
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-textDim uppercase tracking-wider">x · y = k (Bonding Curve)</p>
        <p className="text-[10px] font-mono text-textDim">k = {fmt(reserveA * reserveB)}</p>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={curve} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => fmt(v)}
            tick={{ fill: '#555', fontSize: 8 }}
            tickCount={5}
          />
          <YAxis
            dataKey="y"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={v => fmt(v)}
            tick={{ fill: '#555', fontSize: 8 }}
            width={36}
            tickCount={5}
          />
          <Tooltip
            contentStyle={{ background: '#000', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', fontSize: '10px', padding: '6px 10px' }}
            formatter={(v, name) => [fmt(v), name === 'y' ? tokens?.B?.symbol || 'B' : tokens?.A?.symbol || 'A']}
            labelFormatter={v => `${tokens?.A?.symbol || 'A'}: ${fmt(v)}`}
          />
          {/* The curve */}
          <Line
            type="monotone"
            dataKey="y"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 2, fill: '#fff' }}
          />
          {/* Current position */}
          <ReferenceDot
            x={currentX}
            y={currentY}
            r={5}
            fill="#ffffff"
            stroke="#000"
            strokeWidth={1.5}
            label={{ value: 'Now', position: 'top', fill: '#888', fontSize: 9 }}
          />
          {/* Trade destination */}
          {tradeAmount > 0 && (
            <ReferenceDot
              x={newX}
              y={newY}
              r={5}
              fill={impact > 5 ? '#f87171' : impact > 1 ? '#fbbf24' : '#4ade80'}
              stroke="#000"
              strokeWidth={1.5}
              label={{ value: 'After', position: 'top', fill: '#888', fontSize: 9 }}
            />
          )}
          {/* Vertical line at current */}
          <ReferenceLine
            x={currentX}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="3 3"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Current state */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        <Stat label={`${tokens?.A?.symbol || 'A'} Reserve`} value={fmt(reserveA)} />
        <Stat label={`${tokens?.B?.symbol || 'B'} Reserve`} value={fmt(reserveB)} />
        <Stat label="Price" value={currentPrice < 0.01 ? currentPrice.toFixed(4) : currentPrice.toFixed(2)} />
      </div>

      {tradeAmount > 0 && (
        <div className="mt-2 pt-2 border-t border-border grid grid-cols-3 gap-2">
          <Stat label="Amount out" value={fmt(amountOut)} highlight />
          <Stat label="New price" value={newPrice < 0.01 ? newPrice.toFixed(4) : newPrice.toFixed(2)} />
          <Stat
            label="Impact"
            value={`${impact.toFixed(2)}%`}
            color={impact > 5 ? 'text-danger' : impact > 1 ? 'text-warning' : 'text-success'}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight, color }) {
  return (
    <div>
      <p className="text-[9px] text-textDim uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-mono font-medium mt-0.5 ${color || (highlight ? 'text-white' : 'text-textMuted')}`}>{value}</p>
    </div>
  );
}
