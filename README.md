# Crypto AMM (Automated Market Maker)

A complete implementation of an Automated Market Maker (AMM) for cryptocurrency trading, featuring a constant product formula similar to Uniswap V2.

## Features

- **Smart Contract AMM**: Solidity implementation with constant product formula
- **Swap Functionality**: Trade between two tokens with automatic pricing
- **Liquidity Management**: Add and remove liquidity to earn trading fees
- **Modern Frontend**: React-based UI with real-time updates
- **Backend API**: Express.js server with AMM logic
- **Comprehensive Testing**: Full test suite for smart contracts
- **Price Impact Calculation**: Real-time price impact for trades
- **Transaction History**: Track all swaps and liquidity operations
- **Analytics Dashboard**: View pool statistics, volume, and metrics
- **0.3% Trading Fee**: Standard DeFi trading fee structure
- **Docker Support**: Easy deployment with Docker and Docker Compose

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

# Frontend tests
cd frontend && npm test
```

## Project Structure

```
AMM - Crypto/
├── contracts/          # Smart contracts
│   ├── AMM.sol        # Main AMM contract
│   └── TestToken.sol  # ERC20 test tokens
├── src/backend/       # Backend API
│   └── server.js      # Express.js server
├── frontend/          # React frontend
│   ├── src/
│   │   ├── App.js     # Main component
│   │   └── index.js   # Entry point
│   └── public/        # Static assets
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