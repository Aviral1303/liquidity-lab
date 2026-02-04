const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const BigNumber = require('bignumber.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// AMM Contract ABI (simplified for demo)
const AMM_ABI = [
    "function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB)",
    "function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) public pure returns (uint256 amountOut)",
    "function swap(address tokenIn, uint256 amountIn) external returns (uint256 amountOut)",
    "function addLiquidity(uint256 amountADesired, uint256 amountBDesired) external returns (uint256 liquidity)",
    "function removeLiquidity(uint256 liquidity) external returns (uint256 amountA, uint256 amountB)",
    "function balanceOf(address owner) external view returns (uint256)",
    "function totalSupply() external view returns (uint256)"
];

const TOKEN_ABI = [
    "function balanceOf(address owner) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) external returns (bool)"
];

// Initialize provider and contracts
let provider, ammContract, tokenAContract, tokenBContract;

// AMM Core Logic (JavaScript implementation)
class AMMCore {
    constructor() {
        this.reserveA = new BigNumber(0);
        this.reserveB = new BigNumber(0);
        this.totalSupply = new BigNumber(0);
        this.balances = new Map();
        this.fee = new BigNumber(0.003); // 0.3%
    }

    getAmountOut(amountIn, reserveIn, reserveOut) {
        const amountInBN = new BigNumber(amountIn);
        const reserveInBN = new BigNumber(reserveIn);
        const reserveOutBN = new BigNumber(reserveOut);

        if (amountInBN.lte(0) || reserveInBN.lte(0) || reserveOutBN.lte(0)) {
            return 0;
        }

        const amountInWithFee = amountInBN.times(new BigNumber(1).minus(this.fee));
        const numerator = amountInWithFee.times(reserveOutBN);
        const denominator = reserveInBN.times(new BigNumber(1)).plus(amountInWithFee);
        
        return numerator.div(denominator).integerValue(BigNumber.ROUND_DOWN).toString();
    }

    swap(tokenIn, amountIn) {
        const amountInBN = new BigNumber(amountIn);
        const reserveIn = tokenIn === 'A' ? this.reserveA : this.reserveB;
        const reserveOut = tokenIn === 'A' ? this.reserveB : this.reserveA;

        const amountOut = this.getAmountOut(amountIn, reserveIn.toString(), reserveOut.toString());
        
        if (new BigNumber(amountOut).lte(0)) {
            throw new Error('Insufficient output amount');
        }

        // Update reserves
        if (tokenIn === 'A') {
            this.reserveA = this.reserveA.plus(amountInBN);
            this.reserveB = this.reserveB.minus(amountOut);
        } else {
            this.reserveB = this.reserveB.plus(amountInBN);
            this.reserveA = this.reserveA.minus(amountOut);
        }

        return amountOut;
    }

    addLiquidity(amountADesired, amountBDesired) {
        const amountABN = new BigNumber(amountADesired);
        const amountBBN = new BigNumber(amountBDesired);

        if (this.reserveA.eq(0) && this.reserveB.eq(0)) {
            // First liquidity provision
            this.reserveA = amountABN;
            this.reserveB = amountBBN;
            const liquidity = BigNumber.min(amountABN, amountBBN);
            this.totalSupply = liquidity;
            return liquidity.toString();
        } else {
            // Subsequent liquidity provision
            const amountBOptimal = amountABN.times(this.reserveB).div(this.reserveA);
            let amountA, amountB;

            if (amountBOptimal.lte(amountBBN)) {
                amountA = amountABN;
                amountB = amountBOptimal;
            } else {
                const amountAOptimal = amountBBN.times(this.reserveA).div(this.reserveB);
                amountA = amountAOptimal;
                amountB = amountBBN;
            }

            const liquidity = amountA.times(this.totalSupply).div(this.reserveA);
            
            this.reserveA = this.reserveA.plus(amountA);
            this.reserveB = this.reserveB.plus(amountB);
            this.totalSupply = this.totalSupply.plus(liquidity);

            return liquidity.toString();
        }
    }

    removeLiquidity(liquidity) {
        const liquidityBN = new BigNumber(liquidity);
        
        if (liquidityBN.lte(0) || this.totalSupply.eq(0)) {
            throw new Error('Insufficient liquidity');
        }

        const amountA = liquidityBN.times(this.reserveA).div(this.totalSupply);
        const amountB = liquidityBN.times(this.reserveB).div(this.totalSupply);

        if (amountA.lte(0) || amountB.lte(0)) {
            throw new Error('Insufficient liquidity to remove');
        }

        // Update reserves
        this.reserveA = this.reserveA.minus(amountA);
        this.reserveB = this.reserveB.minus(amountB);
        this.totalSupply = this.totalSupply.minus(liquidityBN);

        return {
            amountA: amountA.toString(),
            amountB: amountB.toString()
        };
    }

    getReserves() {
        return {
            reserveA: this.reserveA.toString(),
            reserveB: this.reserveB.toString()
        };
    }

    getTotalSupply() {
        return this.totalSupply.toString();
    }
}

// Initialize AMM core
const ammCore = new AMMCore();

// Transaction history
const transactionHistory = [];

// Helper function to add transaction to history
function addTransaction(type, data) {
    transactionHistory.push({
        id: transactionHistory.length + 1,
        type,
        timestamp: new Date().toISOString(),
        ...data
    });
    // Keep only last 100 transactions
    if (transactionHistory.length > 100) {
        transactionHistory.shift();
    }
}

// API Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'AMM API is running' });
});

app.get('/api/reserves', (req, res) => {
    try {
        const reserves = ammCore.getReserves();
        res.json({
            success: true,
            data: reserves
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/swap/quote', (req, res) => {
    try {
        const { tokenIn, amountIn } = req.body;
        
        if (!tokenIn || !amountIn) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const reserves = ammCore.getReserves();
        const reserveIn = tokenIn === 'A' ? reserves.reserveA : reserves.reserveB;
        const reserveOut = tokenIn === 'A' ? reserves.reserveB : reserves.reserveA;

        const amountOut = ammCore.getAmountOut(amountIn, reserveIn, reserveOut);
        
        res.json({
            success: true,
            data: {
                amountIn,
                amountOut,
                tokenIn,
                tokenOut: tokenIn === 'A' ? 'B' : 'A',
                priceImpact: calculatePriceImpact(amountIn, reserveIn, amountOut, reserveOut)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/swap', (req, res) => {
    try {
        const { tokenIn, amountIn } = req.body;
        
        if (!tokenIn || !amountIn) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const amountOut = ammCore.swap(tokenIn, amountIn);
        
        const swapData = {
            amountIn,
            amountOut,
            tokenIn,
            tokenOut: tokenIn === 'A' ? 'B' : 'A',
            reserves: ammCore.getReserves()
        };

        addTransaction('swap', swapData);
        
        res.json({
            success: true,
            data: swapData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/liquidity/add', (req, res) => {
    try {
        const { amountA, amountB } = req.body;
        
        if (!amountA || !amountB) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const liquidity = ammCore.addLiquidity(amountA, amountB);
        
        const liquidityData = {
            amountA,
            amountB,
            liquidity,
            reserves: ammCore.getReserves()
        };

        addTransaction('add_liquidity', liquidityData);
        
        res.json({
            success: true,
            data: liquidityData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/liquidity/remove', (req, res) => {
    try {
        const { liquidity } = req.body;
        
        if (!liquidity) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameter: liquidity'
            });
        }

        const result = ammCore.removeLiquidity(liquidity);
        
        const removeData = {
            liquidity,
            amountA: result.amountA,
            amountB: result.amountB,
            reserves: ammCore.getReserves()
        };

        addTransaction('remove_liquidity', removeData);
        
        res.json({
            success: true,
            data: removeData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/liquidity/total-supply', (req, res) => {
    try {
        const totalSupply = ammCore.getTotalSupply();
        res.json({
            success: true,
            data: { totalSupply }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/transactions', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const transactions = transactionHistory.slice(-limit).reverse();
        res.json({
            success: true,
            data: { transactions, total: transactionHistory.length }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const reserves = ammCore.getReserves();
        const totalSupply = ammCore.getTotalSupply();
        const swaps = transactionHistory.filter(t => t.type === 'swap');
        const addLiquidity = transactionHistory.filter(t => t.type === 'add_liquidity');
        const removeLiquidity = transactionHistory.filter(t => t.type === 'remove_liquidity');

        let totalVolume = new BigNumber(0);
        swaps.forEach(swap => {
            totalVolume = totalVolume.plus(swap.amountIn);
        });

        res.json({
            success: true,
            data: {
                reserves,
                totalSupply,
                stats: {
                    totalTransactions: transactionHistory.length,
                    totalSwaps: swaps.length,
                    totalAddLiquidity: addLiquidity.length,
                    totalRemoveLiquidity: removeLiquidity.length,
                    totalVolume: totalVolume.toString()
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function to calculate price impact
function calculatePriceImpact(amountIn, reserveIn, amountOut, reserveOut) {
    const amountInBN = new BigNumber(amountIn);
    const reserveInBN = new BigNumber(reserveIn);
    const amountOutBN = new BigNumber(amountOut);
    const reserveOutBN = new BigNumber(reserveOut);

    const priceBefore = reserveOutBN.div(reserveInBN);
    const priceAfter = reserveOutBN.minus(amountOutBN).div(reserveInBN.plus(amountInBN));
    
    const priceImpact = priceBefore.minus(priceAfter).div(priceBefore).times(100);
    
    return priceImpact.toFixed(4);
}

// Initialize with some liquidity for demo
ammCore.addLiquidity('1000000', '1000000'); // 1M tokens each

app.listen(PORT, () => {
    console.log(`AMM API server running on port ${PORT}`);
    console.log('Demo liquidity added: 1,000,000 tokens each');
}); 