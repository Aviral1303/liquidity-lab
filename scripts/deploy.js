const hre = require("hardhat");

async function main() {
  console.log("Deploying contracts...");

  // Deploy test tokens
  const TestToken = await hre.ethers.getContractFactory("TestToken");
  
  console.log("Deploying Token A...");
  const tokenA = await TestToken.deploy("Token A", "TKA");
  await tokenA.waitForDeployment();
  console.log("Token A deployed to:", await tokenA.getAddress());

  console.log("Deploying Token B...");
  const tokenB = await TestToken.deploy("Token B", "TKB");
  await tokenB.waitForDeployment();
  console.log("Token B deployed to:", await tokenB.getAddress());

  // Deploy AMM
  console.log("Deploying AMM...");
  const AMM = await hre.ethers.getContractFactory("AMM");
  const amm = await AMM.deploy(await tokenA.getAddress(), await tokenB.getAddress());
  await amm.waitForDeployment();
  console.log("AMM deployed to:", await amm.getAddress());

  console.log("\nDeployment Summary:");
  console.log("===================");
  console.log("Token A:", await tokenA.getAddress());
  console.log("Token B:", await tokenB.getAddress());
  console.log("AMM:", await amm.getAddress());

  // Add initial liquidity
  console.log("\nAdding initial liquidity...");
  const [deployer] = await hre.ethers.getSigners();
  
  // Mint tokens to deployer
  const mintAmount = hre.ethers.parseEther("1000000"); // 1M tokens
  await tokenA.mint(deployer.address, mintAmount);
  await tokenB.mint(deployer.address, mintAmount);
  
  // Approve AMM to spend tokens
  await tokenA.approve(await amm.getAddress(), mintAmount);
  await tokenB.approve(await amm.getAddress(), mintAmount);
  
  // Add liquidity
  const liquidityAmount = hre.ethers.parseEther("100000"); // 100K tokens each
  await amm.addLiquidity(liquidityAmount, liquidityAmount);
  
  console.log("Initial liquidity added successfully!");
  console.log("Liquidity amount: 100,000 tokens each");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 