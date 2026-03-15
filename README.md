# Crypto AMM (Automated Market Maker)

A complete implementation of an Automated Market Maker (AMM) for cryptocurrency trading, featuring a constant product formula similar to Uniswap V2.

---

## AMM Research Engine (New)

A **production-grade quantitative research platform** for AMM analysis. See [`amm-research-engine/README.md`](amm-research-engine/README.md) for details.

**Highlights:**
- Real market data (Binance, CoinGecko, The Graph)
- Multiple AMM models (Constant Product, Balancer, StableSwap)
- Trading simulation with retail/arbitrageur/LP agents
- Arbitrage detection, LP analytics, historical replay
- Streamlit dashboard, Jupyter notebooks

```bash
cd amm-research-engine && pip install -r requirements.txt
python scripts/run_simulation.py
streamlit run dashboard/streamlit_app.py
```

---

## AMM Demo — Features

### Core
- **Smart Contract AMM**: Solidity constant product (x×y=k), 0.3% fee
- **Swap & Liquidity**: Add/remove liquidity, swap with live quotes
- **React + Vite Frontend**: Dark UI with charts, pool stats, transaction history

### Advanced
- **Real Market Data**: Live CEX prices from CoinGecko/Binance
- **Arbitrage Detection**: AMM vs CEX comparison, opportunity alerts
- **MetaMask Wallet**: Connect wallet for future on-chain interaction
- **Historical Backtest**: Simulate LP returns over ETH price history
- **MEV Simulation**: Sandwich attack (front-run → victim → back-run)
- **Impermanent Loss**: IL curve, calculator, slippage analysis

### Deployment
- **Testnet Ready**: Sepolia & Base Sepolia config
- **Docker Support**: Single-command deployment

## Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Install dependencies**
   ```bash
   npm install
   cd frontend && npm install && cd ..
   ```

2. **Start the application**
   ```bash
   npm run dev
   ```

This will start both the backend API (port 3001) and frontend (port 3000).

### Smart Contract Development

1. **Compile contracts**
   ```bash
   npm run compile
   ```

2. **Run tests**
   ```bash
   npm run test:contracts
   ```

3. **Deploy to local network**
   ```bash
   npx hardhat node
   npm run deploy
   ```

4. **Deploy to Sepolia testnet**
   ```bash
   # Set PRIVATE_KEY and INFURA_URL in .env
   npm run deploy:sepolia
   ```

## Interview Demo Script

### Proving Deployed Contracts (6 on Sepolia)

1. **Header badge** — When contracts are deployed, a green **"6 deployed"** badge appears in the header. Click it to jump to the Testnet tab.
2. **Testnet tab** — Shows all 6 contract addresses (AMMFactory, AMM pools, tokens) with **Copy** and **View on Etherscan** links.
3. **Live swap** — Connect MetaMask to Sepolia, switch to **on-chain** mode (Swap card shows "on-chain" when connected), and execute a real swap. The tx hash proves it’s on-chain.
4. **Block explorer** — Share Etherscan links: `https://sepolia.etherscan.io/address/<AMM_ADDRESS>` so interviewers can verify the contract and transactions.

### Feature Walkthrough

1. **Show real market data** — AMM vs CEX card shows live ETH price from CoinGecko
2. **Execute a swap** — Demonstrate price impact and fee (simulation or on-chain)
3. **Arbitrage** — Explain when spread > 30 bps creates opportunity
4. **Backtest** — Run 24h/7d simulation, discuss LP fees vs IL
5. **MEV** — Simulate sandwich, explain extractable value
6. **Wallet** — Connect MetaMask, switch to Sepolia for on-chain swaps
7. **Architecture** — Walk through `docs/ARCHITECTURE.md` and `docs/DESIGN_DECISIONS.md`

## API Endpoints

### Core Endpoints
- `GET /api/health` - Health check
- `GET /api/reserves` - Get current reserves
- `POST /api/swap/quote` - Get swap quote with price impact
- `POST /api/swap` - Execute swap

### Liquidity Endpoints
- `POST /api/liquidity/add` - Add liquidity
- `POST /api/liquidity/remove` - Remove liquidity
- `GET /api/liquidity/total-supply` - Get total LP token supply

### Analytics Endpoints
- `GET /api/transactions` - Get transaction history (optional: `?limit=50`)
- `GET /api/stats` - Get pool statistics and metrics
- `GET /api/price-history` - Price history for charts
- `GET /api/slippage-curve` - Slippage by trade size
- `GET /api/impermanent-loss-curve` - IL vs price ratio

### Market Data & Research
- `GET /api/market-price?pair=ETH/USDT` - Live CEX price (CoinGecko/Binance)
- `GET /api/arbitrage?pair=ETH/USDT` - AMM vs CEX, arbitrage opportunity
- `GET /api/ohlcv` - Historical OHLCV for backtesting
- `GET /api/backtest?limit=24` - Simulate LP returns over price history
- `POST /api/mev/simulate` - Sandwich attack simulation

## Smart Contract Features

- Constant Product Formula (x * y = k)
- 0.3% Trading Fee
- Liquidity Provision with LP Tokens
- Automatic Price Calculation
- Reentrancy Protection

## Frontend Features

- Real-time reserve updates (every 5 seconds)
- Swap interface with price quotes
- Add/Remove liquidity management
- Price impact display
- Analytics dashboard with statistics
- Transaction history viewer
- Responsive design with glass morphism UI
- Loading states and error handling

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Using Docker directly

```bash
# Build the image
docker build -t crypto-amm .

# Run the container
docker run -p 3001:3001 -p 3000:3000 crypto-amm
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Testing

```bash
# Smart contract tests
npm run test:contracts

# All tests (contracts + backend API)
npm test
```

## Project Structure

```
AMM - Crypto/
├── contracts/          # Smart contracts
│   ├── AMM.sol        # Main AMM contract
│   └── TestToken.sol  # ERC20 test tokens
├── src/backend/       # Backend API
│   └── server.js      # Express.js server
├── frontend/          # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx    # Main app
│   │   ├── api.js     # API client
│   │   └── components/
│   └── index.html
├── scripts/           # Deployment scripts
├── test/              # Test files
├── Dockerfile         # Docker configuration
└── docker-compose.yml # Docker Compose config
```

## Usage Examples

### Swap Tokens

```javascript
// Get a quote
const quote = await fetch('/api/swap/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tokenIn: 'A', amountIn: '1000' })
});

// Execute swap
const swap = await fetch('/api/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tokenIn: 'A', amountIn: '1000' })
});
```

### Add Liquidity

```javascript
const addLiquidity = await fetch('/api/liquidity/add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amountA: '1000', amountB: '1000' })
});
```

### View Analytics

```javascript
// Get statistics
const stats = await fetch('/api/stats');

// Get transaction history
const transactions = await fetch('/api/transactions?limit=20');
```

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3001
NODE_ENV=development
```

## Troubleshooting

### Port Already in Use

If port 3001 is already in use, you can change it:

```bash
PORT=3002 npm run dev:backend
```

### Frontend Not Connecting to Backend

Make sure the proxy in `frontend/package.json` points to the correct backend port.

### Contract Compilation Errors

Ensure you have the correct Node.js version (v18, v20, or v22 recommended). Hardhat may have issues with Node.js v23+.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Security Considerations

- This is a demonstration project. Always audit smart contracts before using with real funds
- Never commit private keys or sensitive data
- Use environment variables for configuration
- Test thoroughly before deploying to mainnet

## License

MIT License 