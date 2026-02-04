const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AMM", function () {
  let amm, tokenA, tokenB, owner, user1, user2;
  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy test tokens
    const TestToken = await ethers.getContractFactory("TestToken");
    tokenA = await TestToken.deploy("Token A", "TKA");
    tokenB = await TestToken.deploy("Token B", "TKB");

    // Deploy AMM
    const AMM = await ethers.getContractFactory("AMM");
    amm = await AMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());

    // Mint tokens to users
    await tokenA.mint(user1.address, INITIAL_SUPPLY);
    await tokenB.mint(user1.address, INITIAL_SUPPLY);
    await tokenA.mint(user2.address, INITIAL_SUPPLY);
    await tokenB.mint(user2.address, INITIAL_SUPPLY);
  });

  describe("Deployment", function () {
    it("Should set correct token addresses", async function () {
      expect(await amm.tokenA()).to.equal(await tokenA.getAddress());
      expect(await amm.tokenB()).to.equal(await tokenB.getAddress());
    });

    it("Should start with zero reserves", async function () {
      const [reserveA, reserveB] = await amm.getReserves();
      expect(reserveA).to.equal(0n);
      expect(reserveB).to.equal(0n);
    });
  });

  describe("Add Liquidity", function () {
    it("Should add initial liquidity correctly", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("1000");

      await tokenA.connect(user1).approve(await amm.getAddress(), amountA);
      await tokenB.connect(user1).approve(await amm.getAddress(), amountB);

      await amm.connect(user1).addLiquidity(amountA, amountB);

      const [reserveA, reserveB] = await amm.getReserves();
      expect(reserveA).to.equal(amountA);
      expect(reserveB).to.equal(amountB);

      const liquidity = await amm.balanceOf(user1.address);
      expect(liquidity).to.be.gt(0n);
    });

    it("Should calculate optimal amounts for subsequent liquidity", async function () {
      // Add initial liquidity
      const initialAmount = ethers.parseEther("1000");
      await tokenA.connect(user1).approve(await amm.getAddress(), initialAmount);
      await tokenB.connect(user1).approve(await amm.getAddress(), initialAmount);
      await amm.connect(user1).addLiquidity(initialAmount, initialAmount);

      // Add more liquidity with different ratios
      const newAmountA = ethers.parseEther("500");
      const newAmountB = ethers.parseEther("1000");

      await tokenA.connect(user2).approve(await amm.getAddress(), newAmountA);
      await tokenB.connect(user2).approve(await amm.getAddress(), newAmountB);

      await amm.connect(user2).addLiquidity(newAmountA, newAmountB);

      const [reserveA, reserveB] = await amm.getReserves();
      // The optimal amountB for 500 A is 500 B, so only 500 B will be added
      expect(reserveA).to.equal(ethers.parseEther("1500"));
      expect(reserveB).to.equal(ethers.parseEther("1500"));
    });
  });

  describe("Swap", function () {
    beforeEach(async function () {
      // Add initial liquidity
      const amount = ethers.parseEther("10000");
      await tokenA.connect(user1).approve(await amm.getAddress(), amount);
      await tokenB.connect(user1).approve(await amm.getAddress(), amount);
      await amm.connect(user1).addLiquidity(amount, amount);
    });

    it("Should swap token A for token B", async function () {
      const swapAmount = ethers.parseEther("100");
      const user1BalanceBefore = await tokenB.balanceOf(user1.address);

      await tokenA.connect(user1).approve(await amm.getAddress(), swapAmount);
      await amm.connect(user1).swap(await tokenA.getAddress(), swapAmount);

      const user1BalanceAfter = await tokenB.balanceOf(user1.address);
      expect(user1BalanceAfter).to.be.gt(user1BalanceBefore);
    });

    it("Should swap token B for token A", async function () {
      const swapAmount = ethers.parseEther("100");
      const user1BalanceBefore = await tokenA.balanceOf(user1.address);

      await tokenB.connect(user1).approve(await amm.getAddress(), swapAmount);
      await amm.connect(user1).swap(await tokenB.getAddress(), swapAmount);

      const user1BalanceAfter = await tokenA.balanceOf(user1.address);
      expect(user1BalanceAfter).to.be.gt(user1BalanceBefore);
    });

    it("Should apply correct fee", async function () {
      const swapAmount = ethers.parseEther("1000");
      const [reserveA, reserveB] = await amm.getReserves();
      
      // Calculate expected output with 0.3% fee
      const fee = 3n; // 0.3%
      const feeDenominator = 1000n;
      const amountInWithFee = swapAmount * (feeDenominator - fee);
      const numerator = amountInWithFee * reserveB;
      const denominator = (reserveA * feeDenominator) + amountInWithFee;
      const expectedOutput = numerator / denominator;

      await tokenA.connect(user1).approve(await amm.getAddress(), swapAmount);
      const tx = await amm.connect(user1).swap(await tokenA.getAddress(), swapAmount);
      const receipt = await tx.wait();

      // Check that the actual output matches expected (with some tolerance for rounding)
      const event = receipt.logs.find(log => log.eventName === "Swap");
      expect(event.args.amountOut).to.be.closeTo(expectedOutput, expectedOutput / 1000n);
    });

    it("Should revert for invalid token", async function () {
      const invalidToken = await ethers.deployContract("TestToken", ["Invalid", "INV"]);
      const swapAmount = ethers.parseEther("100");

      await tokenA.connect(user1).approve(await amm.getAddress(), swapAmount);
      
      await expect(
        amm.connect(user1).swap(await invalidToken.getAddress(), swapAmount)
      ).to.be.revertedWith("AMM: INVALID_TOKEN");
    });

    it("Should revert for insufficient liquidity", async function () {
      // Create a new AMM without any liquidity
      const TestToken = await ethers.getContractFactory("TestToken");
      const newTokenA = await TestToken.deploy("New Token A", "NTA");
      const newTokenB = await TestToken.deploy("New Token B", "NTB");
      
      const AMM = await ethers.getContractFactory("AMM");
      const newAmm = await AMM.deploy(await newTokenA.getAddress(), await newTokenB.getAddress());

      // Mint tokens to user
      await newTokenA.mint(user1.address, ethers.parseEther("1000"));
      
      const swapAmount = ethers.parseEther("1");
      await newTokenA.connect(user1).approve(await newAmm.getAddress(), swapAmount);

      // This should revert because there's no liquidity in the pool
      await expect(
        newAmm.connect(user1).swap(await newTokenA.getAddress(), swapAmount)
      ).to.be.revertedWith("AMM: INSUFFICIENT_LIQUIDITY");
    });
  });

  describe("Remove Liquidity", function () {
    beforeEach(async function () {
      // Add initial liquidity
      const amount = ethers.parseEther("1000");
      await tokenA.connect(user1).approve(await amm.getAddress(), amount);
      await tokenB.connect(user1).approve(await amm.getAddress(), amount);
      await amm.connect(user1).addLiquidity(amount, amount);
    });

    it("Should remove liquidity correctly", async function () {
      const liquidity = await amm.balanceOf(user1.address);
      const user1BalanceABefore = await tokenA.balanceOf(user1.address);
      const user1BalanceBBefore = await tokenB.balanceOf(user1.address);

      await amm.connect(user1).removeLiquidity(liquidity);

      const user1BalanceAAfter = await tokenA.balanceOf(user1.address);
      const user1BalanceBAfter = await tokenB.balanceOf(user1.address);

      expect(user1BalanceAAfter).to.be.gt(user1BalanceABefore);
      expect(user1BalanceBAfter).to.be.gt(user1BalanceBBefore);
    });

    it("Should revert for zero liquidity", async function () {
      await expect(
        amm.connect(user1).removeLiquidity(0n)
      ).to.be.revertedWith("AMM: INSUFFICIENT_LIQUIDITY_BURNED");
    });
  });

  describe("Price Calculation", function () {
    beforeEach(async function () {
      // Add initial liquidity
      const amount = ethers.parseEther("1000");
      await tokenA.connect(user1).approve(await amm.getAddress(), amount);
      await tokenB.connect(user1).approve(await amm.getAddress(), amount);
      await amm.connect(user1).addLiquidity(amount, amount);
    });

    it("Should calculate correct output amount", async function () {
      const amountIn = ethers.parseEther("100");
      const [reserveA, reserveB] = await amm.getReserves();

      const expectedOutput = await amm.getAmountOut(amountIn, reserveA, reserveB);
      expect(expectedOutput).to.be.gt(0n);

      // Verify the calculation
      const fee = 3n; // 0.3%
      const feeDenominator = 1000n;
      const amountInWithFee = amountIn * (feeDenominator - fee);
      const numerator = amountInWithFee * reserveB;
      const denominator = (reserveA * feeDenominator) + amountInWithFee;
      const calculatedOutput = numerator / denominator;

      expect(expectedOutput).to.equal(calculatedOutput);
    });

    it("Should show price impact for large trades", async function () {
      const smallAmount = ethers.parseEther("10");
      const largeAmount = ethers.parseEther("500");

      const smallOutput = await amm.getAmountOut(smallAmount, ethers.parseEther("1000"), ethers.parseEther("1000"));
      const largeOutput = await amm.getAmountOut(largeAmount, ethers.parseEther("1000"), ethers.parseEther("1000"));

      // Large trades should have worse rates (higher price impact)
      const smallRate = smallOutput * 1_000_000n / smallAmount;
      const largeRate = largeOutput * 1_000_000n / largeAmount;
      
      expect(smallRate).to.be.gt(largeRate);
    });
  });
}); 