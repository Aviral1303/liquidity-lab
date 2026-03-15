"""
Pydantic models for the AMM Research Engine API.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────────

class AMMModel(str, Enum):
    CONSTANT_PRODUCT = "constant_product"
    STABLESWAP = "stableswap"
    BALANCER = "balancer"


# ── Agent config ───────────────────────────────────────────────────────────────

class RetailAgentConfig(BaseModel):
    count: int = 1
    min_trade_usd: float = 100
    max_trade_usd: float = 10000
    threshold_bps: int = 50


class ArbitrageurAgentConfig(BaseModel):
    count: int = 1
    min_profit_bps: int = 10
    max_trade_ratio: float = 0.01


class LPAgentConfig(BaseModel):
    count: int = 0
    amount_a: float = 1000.0
    amount_b: float = 1000.0


class AgentsConfig(BaseModel):
    retail: RetailAgentConfig = Field(default_factory=RetailAgentConfig)
    arbitrageur: ArbitrageurAgentConfig = Field(default_factory=ArbitrageurAgentConfig)
    lp: LPAgentConfig = Field(default_factory=LPAgentConfig)


# ── Simulation ─────────────────────────────────────────────────────────────────

class SimulationRequest(BaseModel):
    steps: int = 100
    reserve_a: float = 100000.0
    reserve_b: float = 100000.0
    amm_model: AMMModel = AMMModel.CONSTANT_PRODUCT
    agents: AgentsConfig = Field(default_factory=AgentsConfig)
    fee_bps: int = 30
    price_volatility: float = 0.02
    initial_price: float = 1.0
    # StableSwap-specific
    amplification: float = 100.0
    # Balancer-specific
    weight_a: float = 0.5


class PriceSnapshot(BaseModel):
    step: int
    amm_price: float
    market_price: float
    reserve_a: float
    reserve_b: float
    volume_cumulative: float
    fees_cumulative: float


class SimulationEvent(BaseModel):
    step: int
    agent_id: str
    action_type: str
    details: dict[str, Any]
    success: bool


class SimulationResponse(BaseModel):
    events: list[SimulationEvent]
    final_reserves: list[float]
    total_volume: float
    total_fees: float
    price_snapshots: list[PriceSnapshot]


# ── Comparison ─────────────────────────────────────────────────────────────────

class ComparisonRequest(BaseModel):
    steps: int = 100
    reserve_a: float = 100000.0
    reserve_b: float = 100000.0
    models: list[AMMModel] = Field(
        default_factory=lambda: [
            AMMModel.CONSTANT_PRODUCT,
            AMMModel.STABLESWAP,
            AMMModel.BALANCER,
        ]
    )
    fee_bps: int = 30
    price_volatility: float = 0.02
    initial_price: float = 1.0
    amplification: float = 100.0
    weight_a: float = 0.5


class ModelResult(BaseModel):
    model: str
    final_reserves: list[float]
    total_volume: float
    total_fees: float
    il_percent: float
    price_snapshots: list[PriceSnapshot]


class ComparisonResponse(BaseModel):
    results: list[ModelResult]


# ── Replay ─────────────────────────────────────────────────────────────────────

class ReplayRequest(BaseModel):
    symbol: str = "BTC/USDT"
    timeframe: str = "1h"
    limit: int = 100
    reserve_a: float = 10.0
    reserve_b: float = 400000.0
    amm_model: AMMModel = AMMModel.CONSTANT_PRODUCT
    fee_bps: int = 30


class ReplaySnapshotOut(BaseModel):
    timestamp: str
    reserve_a: float
    reserve_b: float
    amm_price: float
    market_price: float
    volume_cumulative: float
    fees_cumulative: float


class ReplaySummary(BaseModel):
    total_steps: int
    total_volume: float
    total_fees: float
    final_amm_price: float
    final_market_price: float
    price_deviation_bps: float


class ReplayResponse(BaseModel):
    snapshots: list[ReplaySnapshotOut]
    summary: ReplaySummary


# ── Arbitrage ──────────────────────────────────────────────────────────────────

class ArbitrageRequest(BaseModel):
    reserve_a: float = 100000.0
    reserve_b: float = 100000.0
    cex_price: float = 1.0
    fee_bps: int = 30
    min_spread_bps: int = 35
    max_trade_ratio: float = 0.05


class ArbitrageResponse(BaseModel):
    opportunity_found: bool
    direction: str | None = None
    amm_price: float | None = None
    cex_price: float | None = None
    spread_bps: int | None = None
    estimated_profit_bps: int | None = None
    recommended_amount_in: float | None = None


# ── MEV / Sandwich ─────────────────────────────────────────────────────────────

class MEVRequest(BaseModel):
    reserve_a: float = 100000.0
    reserve_b: float = 100000.0
    victim_token_in: str = "A"
    victim_amount_in: float = 1000.0
    attacker_multiplier: float = 5.0
    fee_bps: int = 30


class SwapDetail(BaseModel):
    token_in: str
    amount_in: float
    amount_out: float
    fee_paid: float
    price_impact_bps: int


class MEVResponse(BaseModel):
    front_run: SwapDetail
    victim: SwapDetail
    back_run: SwapDetail
    mev_extracted: float
    victim_loss: float
    victim_loss_bps: int


# ── Analytics ──────────────────────────────────────────────────────────────────

class ILDataPoint(BaseModel):
    price_ratio: float
    il_percent: float


class ILCurveResponse(BaseModel):
    data_points: list[ILDataPoint]


class SlippageCurveRequest(BaseModel):
    reserve_a: float = 100000.0
    reserve_b: float = 100000.0
    fee_bps: int = 30
    trade_sizes: list[float] | None = None


class SlippageDataPoint(BaseModel):
    amount_in: float
    amount_out: float
    slippage_bps: float


class SlippageCurveResponse(BaseModel):
    data_points: list[SlippageDataPoint]
