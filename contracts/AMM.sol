// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AMM is ReentrancyGuard, Ownable {
    IERC20 public immutable tokenA;
    IERC20 public immutable tokenB;
    
    uint256 public reserveA;
    uint256 public reserveB;
    uint256 public totalSupply;
    
    mapping(address => uint256) public balanceOf;
    
    uint256 private constant MINIMUM_LIQUIDITY = 10**3;
    uint256 private constant FEE_DENOMINATOR = 1000;
    uint256 private constant FEE_NUMERATOR = 3; // 0.3% fee
    
    event Swap(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    
    event AddLiquidity(
        address indexed sender,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );
    
    event RemoveLiquidity(
        address indexed sender,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );
    
    constructor(address _tokenA, address _tokenB) Ownable(msg.sender) {
        require(_tokenA != _tokenB, "AMM: IDENTICAL_ADDRESSES");
        require(_tokenA != address(0) && _tokenB != address(0), "AMM: ZERO_ADDRESS");
        
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }
    
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        _reserveA = reserveA;
        _reserveB = reserveB;
    }
    
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public 
        pure 
        returns (uint256 amountOut) 
    {
        require(amountIn > 0, "AMM: INSUFFICIENT_INPUT_AMOUNT");
        require(reserveIn > 0 && reserveOut > 0, "AMM: INSUFFICIENT_LIQUIDITY");
        
        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_NUMERATOR);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * FEE_DENOMINATOR) + amountInWithFee;
        amountOut = numerator / denominator;
    }
    
    function swap(address tokenIn, uint256 amountIn) 
        external 
        nonReentrant 
        returns (uint256 amountOut) 
    {
        require(tokenIn == address(tokenA) || tokenIn == address(tokenB), "AMM: INVALID_TOKEN");
        
        IERC20 tokenInContract = IERC20(tokenIn);
        IERC20 tokenOutContract = tokenIn == address(tokenA) ? tokenB : tokenA;
        
        uint256 reserveIn = tokenIn == address(tokenA) ? reserveA : reserveB;
        uint256 reserveOut = tokenIn == address(tokenA) ? reserveB : reserveA;
        
        amountOut = getAmountOut(amountIn, reserveIn, reserveOut);
        require(amountOut > 0, "AMM: INSUFFICIENT_OUTPUT_AMOUNT");
        
        // Transfer tokens from user to contract
        require(tokenInContract.transferFrom(msg.sender, address(this), amountIn), "AMM: TRANSFER_FAILED");
        
        // Update reserves
        if (tokenIn == address(tokenA)) {
            reserveA += amountIn;
            reserveB -= amountOut;
        } else {
            reserveB += amountIn;
            reserveA -= amountOut;
        }
        
        // Transfer tokens to user
        require(tokenOutContract.transfer(msg.sender, amountOut), "AMM: TRANSFER_FAILED");
        
        emit Swap(msg.sender, tokenIn, address(tokenOutContract), amountIn, amountOut);
    }
    
    function addLiquidity(uint256 amountADesired, uint256 amountBDesired) 
        external 
        nonReentrant 
        returns (uint256 liquidity) 
    {
        require(amountADesired > 0 && amountBDesired > 0, "AMM: INSUFFICIENT_INPUT_AMOUNT");
        
        uint256 amountA;
        uint256 amountB;
        
        if (reserveA == 0 && reserveB == 0) {
            amountA = amountADesired;
            amountB = amountBDesired;
            liquidity = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            uint256 amountBOptimal = (amountADesired * reserveB) / reserveA;
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= 1, "AMM: INSUFFICIENT_B_AMOUNT");
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                uint256 amountAOptimal = (amountBDesired * reserveA) / reserveB;
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= 1, "AMM: INSUFFICIENT_A_AMOUNT");
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
            liquidity = (amountA * totalSupply) / reserveA;
        }
        
        require(liquidity > 0, "AMM: INSUFFICIENT_LIQUIDITY_MINTED");
        
        // Transfer tokens from user to contract
        require(tokenA.transferFrom(msg.sender, address(this), amountA), "AMM: TRANSFER_FAILED");
        require(tokenB.transferFrom(msg.sender, address(this), amountB), "AMM: TRANSFER_FAILED");
        
        // Update reserves
        reserveA += amountA;
        reserveB += amountB;
        
        // Mint liquidity tokens
        _mint(msg.sender, liquidity);
        
        emit AddLiquidity(msg.sender, amountA, amountB, liquidity);
    }
    
    function removeLiquidity(uint256 liquidity) 
        external 
        nonReentrant 
        returns (uint256 amountA, uint256 amountB) 
    {
        require(liquidity > 0, "AMM: INSUFFICIENT_LIQUIDITY_BURNED");
        
        amountA = (liquidity * reserveA) / totalSupply;
        amountB = (liquidity * reserveB) / totalSupply;
        
        require(amountA > 0 && amountB > 0, "AMM: INSUFFICIENT_LIQUIDITY_BURNED");
        
        // Burn liquidity tokens
        _burn(msg.sender, liquidity);
        
        // Update reserves
        reserveA -= amountA;
        reserveB -= amountB;
        
        // Transfer tokens to user
        require(tokenA.transfer(msg.sender, amountA), "AMM: TRANSFER_FAILED");
        require(tokenB.transfer(msg.sender, amountB), "AMM: TRANSFER_FAILED");
        
        emit RemoveLiquidity(msg.sender, amountA, amountB, liquidity);
    }
    
    function _mint(address to, uint256 amount) internal {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    function _burn(address from, uint256 amount) internal {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }
    
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
} 