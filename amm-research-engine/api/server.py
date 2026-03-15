"""
FastAPI server wrapping the AMM Research Engine.
"""

import math
import random
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

# Ensure the package root is on sys.path so that absolute imports
# like `from core import ...` work regardless of how the server is launched.
_ENGINE_ROOT = str(Path(__file__).resolve().parent.parent)
if _ENGINE_ROOT not in sys.path:
    sys.path.insert(0, _ENGINE_ROOT)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from core.constant_product import ConstantProductAMM
from core.stableswap import StableSwapAMM
from core.balancer import BalancerAMM
from core.base import AMMBase
from simulation.pool_state import SimulatedPool
from simulation.engine import SimulationEngine
from simulation.agents.retail import RetailTrader
from simulation.agents.arbitrageur import ArbitrageurAgent
from simulation.agents.lp import LiquidityProviderAgent
from arbitrage.detector import ArbitrageDetector
from analytics.impermanent_loss import calculate_impermanent_loss
from analytics.slippage import compute_slippage_curve

from .models import (
    AMMModel,
    SimulationRequest,
    SimulationResponse,
    SimulationEvent as SimEventOut,
    PriceSnapshot,
    ComparisonRequest,
    ComparisonResponse,
    ModelResult,
    ReplayRequest,
    ReplayResponse,
    ReplaySnapshotOut,
    ReplaySummary,
    ArbitrageRequest,
    ArbitrageResponse,
    MEVRequest,
    MEVResponse,
    SwapDetail,
    ILCurveResponse,
    ILDataPoint,
    SlippageCurveRequest,
    SlippageCurveResponse,
    SlippageDataPoint,
)

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AMM Research Engine API",
    version="0.1.0",
    description="Quantitative research API for AMM analysis, simulation, and analytics.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _dec_to_float(val: Any) -> float:
    """Recursively convert Decimal values to float."""
    if isinstance(val, Decimal):
        return float(val)
    return val


def _build_amm(
    model: AMMModel,
    reserve_a: float,
    reserve_b: float,
    fee_bps: int,
    amplification: float = 100.0,
    weight_a: float = 0.5,
) -> AMMBase:
    """Instantiate the requested AMM model."""
    if model == AMMModel.CONSTANT_PRODUCT:
        return ConstantProductAMM(reserve_a, reserve_b, fee_bps)
    elif model == AMMModel.STABLESWAP:
        return StableSwapAMM(reserve_a, reserve_b, amplification=amplification, fee_bps=fee_bps)
    elif model == AMMModel.BALANCER:
        return BalancerAMM(reserve_a, reserve_b, weight_a=weight_a, fee_bps=fee_bps)
    else:
        raise ValueError(f"Unknown AMM model: {model}")


def _build_agents(cfg) -> list:
    """Build agent list from AgentsConfig."""
    agents: list = []
    for i in range(cfg.retail.count):
        agents.append(
            RetailTrader(
                agent_id=f"retail_{i}",
                min_trade_usd=cfg.retail.min_trade_usd,
                max_trade_usd=cfg.retail.max_trade_usd,
                threshold_bps=cfg.retail.threshold_bps,
            )
        )
    for i in range(cfg.arbitrageur.count):
        agents.append(
            ArbitrageurAgent(
                agent_id=f"arb_{i}",
                min_profit_bps=cfg.arbitrageur.min_profit_bps,
                max_trade_ratio=cfg.arbitrageur.max_trade_ratio,
            )
        )
    for i in range(cfg.lp.count):
        agents.append(
            LiquidityProviderAgent(
                agent_id=f"lp_{i}",
                amount_a=cfg.lp.amount_a,
                amount_b=cfg.lp.amount_b,
            )
        )
    return agents


def _generate_price_series(
    steps: int,
    initial_price: float,
    volatility: float,
) -> list[tuple[datetime, Decimal]]:
    """Generate a geometric-Brownian-motion random walk price series."""
    prices: list[tuple[datetime, Decimal]] = []
    price = initial_price
    base_time = datetime.utcnow()
    for i in range(steps):
        ts = base_time + timedelta(seconds=i)
        prices.append((ts, Decimal(str(round(price, 10)))))
        # GBM step: dP/P = sigma * dW
        shock = random.gauss(0, volatility)
        price *= math.exp(shock)
        price = max(price, 1e-8)  # floor
    return prices


def _run_simulation_internal(
    amm: AMMBase,
    agents: list,
    price_series: list[tuple[datetime, Decimal]],
) -> tuple[list[SimEventOut], list[PriceSnapshot], float, float, list[float]]:
    """Run a simulation and return processed results."""
    pool = SimulatedPool(amm)
    engine = SimulationEngine(pool, agents)

    events_out: list[SimEventOut] = []
    snapshots: list[PriceSnapshot] = []

    cumulative_volume = Decimal("0")
    cumulative_fees = Decimal("0")

    for step_idx, (ts, market_price) in enumerate(price_series):
        step_events = engine.step(ts, market_price)

        for ev in step_events:
            cumulative_volume = engine.total_volume
            cumulative_fees = engine.total_fees
            events_out.append(
                SimEventOut(
                    step=step_idx,
                    agent_id=ev.agent_id,
                    action_type=ev.action_type,
                    details={k: str(v) for k, v in ev.details.items()},
                    success=ev.success,
                )
            )

        r_a, r_b = pool.get_reserves()
        amm_price = float(r_b / r_a) if r_a > 0 else 0.0
        snapshots.append(
            PriceSnapshot(
                step=step_idx,
                amm_price=amm_price,
                market_price=float(market_price),
                reserve_a=float(r_a),
                reserve_b=float(r_b),
                volume_cumulative=float(engine.total_volume),
                fees_cumulative=float(engine.total_fees),
            )
        )

    r_a, r_b = pool.get_reserves()
    return (
        events_out,
        snapshots,
        float(engine.total_volume),
        float(engine.total_fees),
        [float(r_a), float(r_b)],
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────


@app.get("/api/health")
def health_check():
    return {"status": "ok", "engine": "amm-research-engine", "version": "0.1.0"}


# ── Simulation ─────────────────────────────────────────────────────────────────


@app.post("/api/simulation/run", response_model=SimulationResponse)
def run_simulation(req: SimulationRequest):
    try:
        amm = _build_amm(
            req.amm_model,
            req.reserve_a,
            req.reserve_b,
            req.fee_bps,
            amplification=req.amplification,
            weight_a=req.weight_a,
        )
        agents = _build_agents(req.agents)
        price_series = _generate_price_series(req.steps, req.initial_price, req.price_volatility)

        events, snapshots, total_vol, total_fees, final_res = _run_simulation_internal(
            amm, agents, price_series
        )

        return SimulationResponse(
            events=events,
            final_reserves=final_res,
            total_volume=total_vol,
            total_fees=total_fees,
            price_snapshots=snapshots,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Comparison ─────────────────────────────────────────────────────────────────


@app.post("/api/simulation/compare", response_model=ComparisonResponse)
def compare_models(req: ComparisonRequest):
    try:
        # Generate ONE shared price series for fair comparison
        price_series = _generate_price_series(req.steps, req.initial_price, req.price_volatility)
        initial_price = float(price_series[0][1])

        results: list[ModelResult] = []
        for model in req.models:
            amm = _build_amm(
                model,
                req.reserve_a,
                req.reserve_b,
                req.fee_bps,
                amplification=req.amplification,
                weight_a=req.weight_a,
            )
            # Default agents for comparison: 1 retail + 1 arb
            agents = [
                RetailTrader("retail_0"),
                ArbitrageurAgent("arb_0"),
            ]

            _, snapshots, total_vol, total_fees, final_res = _run_simulation_internal(
                amm, agents, price_series
            )

            # Compute IL
            final_price = float(price_series[-1][1])
            il_pct = float(
                calculate_impermanent_loss(initial_price, final_price) * 100
            )

            results.append(
                ModelResult(
                    model=model.value,
                    final_reserves=final_res,
                    total_volume=total_vol,
                    total_fees=total_fees,
                    il_percent=il_pct,
                    price_snapshots=snapshots,
                )
            )

        return ComparisonResponse(results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Replay ─────────────────────────────────────────────────────────────────────


@app.post("/api/replay", response_model=ReplayResponse)
def replay_historical(req: ReplayRequest):
    try:
        import pandas as pd
        from data.binance import BinanceDataProvider

        provider = BinanceDataProvider()
        ohlcv_list = provider.get_ohlcv(
            symbol=req.symbol,
            timeframe=req.timeframe,
            limit=req.limit,
        )

        if not ohlcv_list:
            raise HTTPException(
                status_code=400,
                detail=f"No OHLCV data returned for {req.symbol}. Check symbol and connectivity.",
            )

        df = pd.DataFrame(
            [
                {
                    "timestamp": c.timestamp,
                    "open": c.open,
                    "high": c.high,
                    "low": c.low,
                    "close": c.close,
                    "volume": c.volume,
                }
                for c in ohlcv_list
            ]
        )

        from replay.replayer import HistoricalReplayer

        replayer = HistoricalReplayer(
            initial_reserve_a=req.reserve_a,
            initial_reserve_b=req.reserve_b,
            fee_bps=req.fee_bps,
        )
        replayer.replay(df, price_col="close", timestamp_col="timestamp")

        snapshots_out: list[ReplaySnapshotOut] = []
        for s in replayer.snapshots:
            snapshots_out.append(
                ReplaySnapshotOut(
                    timestamp=s.timestamp.isoformat() if isinstance(s.timestamp, datetime) else str(s.timestamp),
                    reserve_a=float(s.reserve_a),
                    reserve_b=float(s.reserve_b),
                    amm_price=float(s.price_a),
                    market_price=float(s.market_price),
                    volume_cumulative=float(s.volume_cumulative),
                    fees_cumulative=float(s.fees_cumulative),
                )
            )

        if not snapshots_out:
            raise HTTPException(status_code=400, detail="Replay produced no snapshots.")

        last = snapshots_out[-1]
        deviation_bps = 0.0
        if last.market_price > 0:
            deviation_bps = abs(last.amm_price - last.market_price) / last.market_price * 10000

        summary = ReplaySummary(
            total_steps=len(snapshots_out),
            total_volume=last.volume_cumulative,
            total_fees=last.fees_cumulative,
            final_amm_price=last.amm_price,
            final_market_price=last.market_price,
            price_deviation_bps=deviation_bps,
        )

        return ReplayResponse(snapshots=snapshots_out, summary=summary)
    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Arbitrage ──────────────────────────────────────────────────────────────────


@app.post("/api/arbitrage/detect", response_model=ArbitrageResponse)
def detect_arbitrage(req: ArbitrageRequest):
    try:
        amm_price = req.reserve_b / req.reserve_a if req.reserve_a > 0 else 0.0

        detector = ArbitrageDetector(
            amm_fee_bps=req.fee_bps,
            min_spread_bps=req.min_spread_bps,
        )
        opp = detector.detect(
            amm_price=amm_price,
            cex_price=req.cex_price,
            reserve_a=req.reserve_a,
            reserve_b=req.reserve_b,
            max_trade_ratio=req.max_trade_ratio,
        )

        if opp is None:
            return ArbitrageResponse(opportunity_found=False)

        return ArbitrageResponse(
            opportunity_found=True,
            direction=opp.direction,
            amm_price=float(opp.amm_price),
            cex_price=float(opp.cex_price),
            spread_bps=opp.spread_bps,
            estimated_profit_bps=opp.estimated_profit_bps,
            recommended_amount_in=float(opp.recommended_amount_in),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── MEV / Sandwich ─────────────────────────────────────────────────────────────


@app.post("/api/mev/simulate", response_model=MEVResponse)
def simulate_mev(req: MEVRequest):
    """
    Simulate a sandwich attack:
    1. Attacker front-runs with a swap in the same direction as victim.
    2. Victim swap executes at worse price.
    3. Attacker back-runs (reverse swap) to lock in profit.
    """
    try:
        # Build a fresh pool for the sandwich simulation
        amm = ConstantProductAMM(req.reserve_a, req.reserve_b, req.fee_bps)
        pool = SimulatedPool(amm)

        victim_token_in = req.victim_token_in if req.victim_token_in in ("A", "B") else "A"
        victim_token_out = "B" if victim_token_in == "A" else "A"
        attacker_amount = req.victim_amount_in * req.attacker_multiplier

        # ── 1. Front-run: attacker swaps in the SAME direction as victim ──
        fr_result = pool.swap(victim_token_in, Decimal(str(attacker_amount)))
        front_run = SwapDetail(
            token_in=victim_token_in,
            amount_in=float(fr_result.amount_in),
            amount_out=float(fr_result.amount_out),
            fee_paid=float(fr_result.fee_paid),
            price_impact_bps=fr_result.price_impact_bps,
        )

        # ── 2. Victim swap (at worse price due to front-run) ──
        # Also compute what the victim WOULD have gotten without the attack
        amm_clean = ConstantProductAMM(req.reserve_a, req.reserve_b, req.fee_bps)
        pool_clean = SimulatedPool(amm_clean)
        clean_result = pool_clean.swap(victim_token_in, Decimal(str(req.victim_amount_in)))
        clean_amount_out = float(clean_result.amount_out)

        v_result = pool.swap(victim_token_in, Decimal(str(req.victim_amount_in)))
        victim = SwapDetail(
            token_in=victim_token_in,
            amount_in=float(v_result.amount_in),
            amount_out=float(v_result.amount_out),
            fee_paid=float(v_result.fee_paid),
            price_impact_bps=v_result.price_impact_bps,
        )

        # ── 3. Back-run: attacker swaps the output token back ──
        br_result = pool.swap(victim_token_out, fr_result.amount_out)
        back_run = SwapDetail(
            token_in=victim_token_out,
            amount_in=float(br_result.amount_in),
            amount_out=float(br_result.amount_out),
            fee_paid=float(br_result.fee_paid),
            price_impact_bps=br_result.price_impact_bps,
        )

        # MEV extracted = attacker's net gain in input token
        # Attacker spent `attacker_amount` of token_in, got back `back_run.amount_out` of token_in
        mev_extracted = float(br_result.amount_out) - attacker_amount

        # Victim loss = what they would have gotten minus what they actually got
        victim_loss = clean_amount_out - float(v_result.amount_out)
        victim_loss_bps = (
            int(victim_loss / clean_amount_out * 10000) if clean_amount_out > 0 else 0
        )

        return MEVResponse(
            front_run=front_run,
            victim=victim,
            back_run=back_run,
            mev_extracted=mev_extracted,
            victim_loss=victim_loss,
            victim_loss_bps=victim_loss_bps,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Analytics ──────────────────────────────────────────────────────────────────


@app.get("/api/analytics/il-curve", response_model=ILCurveResponse)
def il_curve():
    """Return IL data points for price ratios from 0.1 to 5.0."""
    data_points: list[ILDataPoint] = []
    # Generate 50 ratios from 0.1 to 5.0
    for i in range(50):
        ratio = 0.1 + (5.0 - 0.1) * i / 49
        il = calculate_impermanent_loss(Decimal("1"), Decimal(str(ratio)))
        data_points.append(
            ILDataPoint(
                price_ratio=round(ratio, 4),
                il_percent=round(float(il) * 100, 6),
            )
        )
    return ILCurveResponse(data_points=data_points)


@app.post("/api/analytics/slippage-curve", response_model=SlippageCurveResponse)
def slippage_curve(req: SlippageCurveRequest):
    try:
        results = compute_slippage_curve(
            reserve_in=req.reserve_a,
            reserve_out=req.reserve_b,
            fee_bps=req.fee_bps,
            trade_sizes=req.trade_sizes,
        )
        data_points = [
            SlippageDataPoint(
                amount_in=round(amt_in, 6),
                amount_out=round(amt_out, 6),
                slippage_bps=round(slip, 4),
            )
            for amt_in, amt_out, slip in results
        ]
        return SlippageCurveResponse(data_points=data_points)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Main ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
