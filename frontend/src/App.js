import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ArrowPathIcon, CurrencyDollarIcon, PlusIcon, MinusIcon, ChartBarIcon } from '@heroicons/react/24/outline';

function App() {
  const [activeTab, setActiveTab] = useState('swap');
  const [reserves, setReserves] = useState({ reserveA: '0', reserveB: '0' });
  const [swapForm, setSwapForm] = useState({
    tokenIn: 'A',
    amountIn: '',
    amountOut: '',
    priceImpact: '0'
  });
  const [liquidityForm, setLiquidityForm] = useState({
    amountA: '',
    amountB: '',
    removeLiquidity: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success'); // 'success' or 'error'
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    fetchReserves();
    fetchTransactions();
    fetchStats();
    const interval = setInterval(() => {
      fetchReserves();
      fetchTransactions();
      fetchStats();
    }, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchReserves = async () => {
    try {
      const response = await axios.get('/api/reserves');
      if (response.data.success) {
        setReserves(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching reserves:', error);
    }
  };

  const getSwapQuote = useCallback(async () => {
    if (!swapForm.amountIn || swapForm.amountIn <= 0) {
      setSwapForm(prev => ({ ...prev, amountOut: '', priceImpact: '0' }));
      return;
    }

    try {
      const response = await axios.post('/api/swap/quote', {
        tokenIn: swapForm.tokenIn,
        amountIn: swapForm.amountIn
      });

      if (response.data.success) {
        setSwapForm(prev => ({
          ...prev,
          amountOut: response.data.data.amountOut,
          priceImpact: response.data.data.priceImpact
        }));
      }
    } catch (error) {
      console.error('Error getting quote:', error);
      showMessage('Error getting quote', 'error');
    }
  }, [swapForm.tokenIn, swapForm.amountIn]);

  const executeSwap = async () => {
    if (!swapForm.amountIn || !swapForm.amountOut) {
      showMessage('Please enter an amount to swap', 'error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/api/swap', {
        tokenIn: swapForm.tokenIn,
        amountIn: swapForm.amountIn
      });

      if (response.data.success) {
        showMessage('Swap executed successfully!', 'success');
        setSwapForm({ tokenIn: 'A', amountIn: '', amountOut: '', priceImpact: '0' });
        fetchReserves();
        fetchTransactions();
        fetchStats();
      }
    } catch (error) {
      showMessage('Error executing swap: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const addLiquidity = async () => {
    if (!liquidityForm.amountA || !liquidityForm.amountB) {
      showMessage('Please enter amounts for both tokens', 'error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/api/liquidity/add', {
        amountA: liquidityForm.amountA,
        amountB: liquidityForm.amountB
      });

      if (response.data.success) {
        showMessage('Liquidity added successfully!', 'success');
        setLiquidityForm(prev => ({ ...prev, amountA: '', amountB: '' }));
        fetchReserves();
        fetchTransactions();
        fetchStats();
      }
    } catch (error) {
      showMessage('Error adding liquidity: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const removeLiquidity = async () => {
    if (!liquidityForm.removeLiquidity) {
      showMessage('Please enter liquidity amount to remove', 'error');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('/api/liquidity/remove', {
        liquidity: liquidityForm.removeLiquidity
      });

      if (response.data.success) {
        showMessage('Liquidity removed successfully!', 'success');
        setLiquidityForm(prev => ({ ...prev, removeLiquidity: '' }));
        fetchReserves();
        fetchTransactions();
        fetchStats();
      }
    } catch (error) {
      showMessage('Error removing liquidity: ' + (error.response?.data?.error || error.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      const response = await axios.get('/api/transactions?limit=20');
      if (response.data.success) {
        setTransactions(response.data.data.transactions);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    getSwapQuote();
  }, [getSwapQuote]);

  const formatNumber = (num) => {
    return new Intl.NumberFormat().format(parseFloat(num) || 0);
  };

  const showMessage = (msg, type = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
    }, 5000); // Auto-hide after 5 seconds
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Crypto AMM</h1>
          <p className="text-blue-100">Automated Market Maker for Cryptocurrency</p>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="glass-effect rounded-xl p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Token A Reserves</h3>
                  <p className="text-2xl font-bold text-blue-200">{formatNumber(reserves.reserveA)}</p>
                </div>
                <CurrencyDollarIcon className="h-8 w-8 text-blue-300" />
              </div>
            </div>
            <div className="glass-effect rounded-xl p-6 card-hover">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Token B Reserves</h3>
                  <p className="text-2xl font-bold text-blue-200">{formatNumber(reserves.reserveB)}</p>
                </div>
                <CurrencyDollarIcon className="h-8 w-8 text-blue-300" />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="glass-effect rounded-xl p-6 mb-8">
            <div className="flex space-x-4 mb-6">
              <button
                onClick={() => setActiveTab('swap')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'swap'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                Swap
              </button>
              <button
                onClick={() => setActiveTab('liquidity')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'liquidity'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                Liquidity
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'analytics'
                    ? 'bg-blue-600 text-white'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                Analytics
              </button>
            </div>

            {/* Swap Tab */}
            {activeTab === 'swap' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      You Pay
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={swapForm.amountIn}
                        onChange={(e) => setSwapForm(prev => ({ ...prev, amountIn: e.target.value }))}
                        placeholder="0.0"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="absolute right-3 top-3">
                        <span className="text-white font-medium">Token {swapForm.tokenIn}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      You Receive
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={swapForm.amountOut}
                        readOnly
                        placeholder="0.0"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none"
                      />
                      <div className="absolute right-3 top-3">
                        <span className="text-white font-medium">Token {swapForm.tokenIn === 'A' ? 'B' : 'A'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <button
                    onClick={() => setSwapForm(prev => ({ ...prev, tokenIn: prev.tokenIn === 'A' ? 'B' : 'A' }))}
                    className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
                  >
                    <ArrowPathIcon className="h-6 w-6 text-white" />
                  </button>
                </div>

                {swapForm.priceImpact > 0 && (
                  <div className="text-center">
                    <p className="text-sm text-blue-200">
                      Price Impact: {swapForm.priceImpact}%
                    </p>
                  </div>
                )}

                <button
                  onClick={executeSwap}
                  disabled={loading || !swapForm.amountIn || !swapForm.amountOut}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {loading ? 'Swapping...' : 'Swap'}
                </button>
              </div>
            )}

            {/* Liquidity Tab */}
            {activeTab === 'liquidity' && (
              <div className="space-y-6">
                {/* Add Liquidity Section */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Add Liquidity</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Token A Amount
                      </label>
                      <input
                        type="number"
                        value={liquidityForm.amountA}
                        onChange={(e) => setLiquidityForm(prev => ({ ...prev, amountA: e.target.value }))}
                        placeholder="0.0"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Token B Amount
                      </label>
                      <input
                        type="number"
                        value={liquidityForm.amountB}
                        onChange={(e) => setLiquidityForm(prev => ({ ...prev, amountB: e.target.value }))}
                        placeholder="0.0"
                        className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={addLiquidity}
                    disabled={loading || !liquidityForm.amountA || !liquidityForm.amountB}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
                  >
                    <PlusIcon className="h-5 w-5" />
                    <span>{loading ? 'Adding Liquidity...' : 'Add Liquidity'}</span>
                  </button>
                </div>

                {/* Remove Liquidity Section */}
                <div className="border-t border-white/20 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Remove Liquidity</h3>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-white mb-2">
                      LP Token Amount
                    </label>
                    <input
                      type="number"
                      value={liquidityForm.removeLiquidity}
                      onChange={(e) => setLiquidityForm(prev => ({ ...prev, removeLiquidity: e.target.value }))}
                      placeholder="0.0"
                      className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={removeLiquidity}
                    disabled={loading || !liquidityForm.removeLiquidity}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center space-x-2"
                  >
                    <MinusIcon className="h-5 w-5" />
                    <span>{loading ? 'Removing Liquidity...' : 'Remove Liquidity'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
              <div className="space-y-6">
                {stats && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4">Pool Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="glass-effect rounded-lg p-4">
                        <p className="text-sm text-blue-200">Total Swaps</p>
                        <p className="text-xl font-bold text-white">{stats.stats.totalSwaps}</p>
                      </div>
                      <div className="glass-effect rounded-lg p-4">
                        <p className="text-sm text-blue-200">Total Volume</p>
                        <p className="text-xl font-bold text-white">{formatNumber(stats.stats.totalVolume)}</p>
                      </div>
                      <div className="glass-effect rounded-lg p-4">
                        <p className="text-sm text-blue-200">Liquidity Added</p>
                        <p className="text-xl font-bold text-white">{stats.stats.totalAddLiquidity}</p>
                      </div>
                      <div className="glass-effect rounded-lg p-4">
                        <p className="text-sm text-blue-200">LP Supply</p>
                        <p className="text-xl font-bold text-white">{formatNumber(stats.totalSupply)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Recent Transactions</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {transactions.length === 0 ? (
                      <p className="text-blue-200 text-center py-4">No transactions yet</p>
                    ) : (
                      transactions.map((tx) => (
                        <div key={tx.id} className="glass-effect rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-white font-medium capitalize">{tx.type.replace('_', ' ')}</p>
                              <p className="text-sm text-blue-200">
                                {new Date(tx.timestamp).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-right">
                              {tx.type === 'swap' && (
                                <>
                                  <p className="text-white">
                                    {formatNumber(tx.amountIn)} {tx.tokenIn} → {formatNumber(tx.amountOut)} {tx.tokenOut}
                                  </p>
                                </>
                              )}
                              {tx.type === 'add_liquidity' && (
                                <p className="text-white">
                                  +{formatNumber(tx.amountA)} A + {formatNumber(tx.amountB)} B
                                </p>
                              )}
                              {tx.type === 'remove_liquidity' && (
                                <p className="text-white">
                                  -{formatNumber(tx.amountA)} A - {formatNumber(tx.amountB)} B
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Message Display */}
          {message && (
            <div className={`glass-effect rounded-lg p-4 mb-6 border-2 ${
              messageType === 'error' ? 'border-red-400 bg-red-500/20' : 'border-green-400 bg-green-500/20'
            } animate-pulse`}>
              <div className="flex items-center justify-between">
                <p className={`text-center flex-1 ${
                  messageType === 'error' ? 'text-red-200' : 'text-green-200'
                }`}>
                  {message}
                </p>
                <button
                  onClick={() => setMessage('')}
                  className="ml-4 text-white hover:text-gray-300"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="glass-effect rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">How it works</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-100">
              <div>
                <h4 className="font-medium text-white mb-2">1. Swap Tokens</h4>
                <p>Trade between Token A and Token B using the constant product formula with a 0.3% fee.</p>
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">2. Add Liquidity</h4>
                <p>Provide both tokens to earn trading fees and receive liquidity tokens.</p>
              </div>
              <div>
                <h4 className="font-medium text-white mb-2">3. Automated Pricing</h4>
                <p>Prices are automatically calculated based on the ratio of reserves in the pool.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 