/**
 * useOnChainReserves
 *
 * Reads live reserves directly from Sepolia contracts using a read-only
 * Alchemy provider — no MetaMask required. Falls back to backend API.
 *
 * This means the UI always shows real on-chain state, not simulation.
 */
import { useState, useEffect, useCallback } from 'react';

// Minimal ABI — only what we need to read
const AMM_ABI = [
  'function getReserves() view returns (uint256 rA, uint256 rB, uint32 ts)',
  'function totalSupply() view returns (uint256)',
  'function tokenA() view returns (address)',
  'function tokenB() view returns (address)',
];

const POOL_ADDRESSES = {
  'TKA/TKB':  '0xB138d15Dd1f372C9736af9Df885D40450f8F072d',
  'TKA/USDC': '0xcE1D80bf144ff848F05B25C753C981aBFC8c4B9b',
};

// Public Sepolia RPCs with fallback (rpc.sepolia.org is often unreliable)
const SEPOLIA_RPCS = [
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://sepolia.drpc.org',
  'https://1rpc.io/sepolia',
  'https://rpc.sepolia.org',
];

let ethersLib = null;
async function getEthers() {
  if (!ethersLib) ethersLib = await import('ethers');
  return ethersLib;
}

export function useOnChainReserves(poolId) {
  const [reserves,   setReserves]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [lastBlock,  setLastBlock]  = useState(null);
  const [chainPrice, setChainPrice] = useState(null);
  const [isLive,     setIsLive]     = useState(false);

  const fetchReserves = useCallback(async () => {
    const addr = POOL_ADDRESSES[poolId];
    if (!addr) return;

    try {
      const { JsonRpcProvider, Contract, formatEther } = await getEthers();

      // Try each RPC in order until one works
      let provider = null;
      for (const rpc of SEPOLIA_RPCS) {
        try {
          const p = new JsonRpcProvider(rpc);
          await Promise.race([p.getBlockNumber(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
          provider = p;
          break;
        } catch {}
      }
      if (!provider) throw new Error('All Sepolia RPCs failed');

      const amm = new Contract(addr, AMM_ABI, provider);

      const [rA, rB, ts] = await amm.getReserves();
      const supply = await amm.totalSupply();
      const block  = await provider.getBlockNumber();

      const reserveA = parseFloat(formatEther(rA));
      const reserveB = parseFloat(formatEther(rB));
      const price    = reserveA > 0 ? reserveB / reserveA : 0;
      const k        = reserveA * reserveB;

      setReserves({ reserveA, reserveB, totalSupply: parseFloat(formatEther(supply)), k, ts: Number(ts) });
      setChainPrice(price);
      setLastBlock(block);
      setIsLive(true);
      setError(null);
    } catch (e) {
      setError(e.message);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    setLoading(true);
    setIsLive(false);
    fetchReserves();
    const id = setInterval(fetchReserves, 15_000); // refresh every 15s
    return () => clearInterval(id);
  }, [fetchReserves]);

  return { reserves, chainPrice, lastBlock, loading, error, isLive, refetch: fetchReserves };
}

// Compute AMM output given reserves and input — same formula as the contract
export function ammQuote(amountIn, reserveIn, reserveOut, feeBps = 30) {
  if (!amountIn || !reserveIn || !reserveOut) return 0;
  const amtWithFee = amountIn * (10000 - feeBps);
  return (amtWithFee * reserveOut) / (reserveIn * 10000 + amtWithFee);
}

// Generate bonding curve points for x*y=k
export function bondingCurvePoints(reserveA, reserveB, points = 80) {
  const k = reserveA * reserveB;
  if (!k) return [];
  const minX = reserveA * 0.1;
  const maxX = reserveA * 4;
  const step = (maxX - minX) / points;
  const curve = [];
  for (let i = 0; i <= points; i++) {
    const x = minX + i * step;
    const y = k / x;
    curve.push({ x, y, price: y / x });
  }
  return curve;
}
