/**
 * QuantAMM Deployment Script
 * Deploys: AMMFactory + TestTokens + AMM pairs + seeds initial liquidity
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network baseSepolia
 */
const hre = require('hardhat');
const fs  = require('fs');
const path = require('path');

async function main() {
  const network = hre.network.name;
  console.log(`\n🚀 Deploying QuantAMM to ${network}…`);
  console.log('='.repeat(50));

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeployer: ${deployer.address}`);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Balance:  ${hre.ethers.formatEther(balance)} ETH\n`);

  // ─── Deploy tokens ────────────────────────────────────────────────────────
  const TestToken = await hre.ethers.getContractFactory('TestToken');

  console.log('Deploying Token Alpha (TKA)…');
  const tokenA = await TestToken.deploy('Token Alpha', 'TKA');
  await tokenA.waitForDeployment();
  const addrA = await tokenA.getAddress();
  console.log(`  ✓ TKA: ${addrA}`);

  console.log('Deploying Token Beta (TKB)…');
  const tokenB = await TestToken.deploy('Token Beta', 'TKB');
  await tokenB.waitForDeployment();
  const addrB = await tokenB.getAddress();
  console.log(`  ✓ TKB: ${addrB}`);

  console.log('Deploying USD Coin Mock (USDC)…');
  const tokenC = await TestToken.deploy('USD Coin', 'USDC');
  await tokenC.waitForDeployment();
  const addrC = await tokenC.getAddress();
  console.log(`  ✓ USDC: ${addrC}`);

  // ─── Deploy Factory ───────────────────────────────────────────────────────
  console.log('\nDeploying AMMFactory…');
  const Factory = await hre.ethers.getContractFactory('AMMFactory');
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const addrFactory = await factory.getAddress();
  console.log(`  ✓ Factory: ${addrFactory}`);

  // ─── Create pairs via factory ─────────────────────────────────────────────
  console.log('\nCreating TKA/TKB pair…');
  const tx1 = await factory.createPair(addrA, addrB);
  const rcpt1 = await tx1.wait();
  const pairABaddr = await factory.getPair(addrA, addrB);
  console.log(`  ✓ TKA/TKB AMM: ${pairABaddr}`);

  console.log('Creating TKA/USDC pair…');
  const tx2 = await factory.createPair(addrA, addrC);
  await tx2.wait();
  const pairACaddr = await factory.getPair(addrA, addrC);
  console.log(`  ✓ TKA/USDC AMM: ${pairACaddr}`);

  // ─── Seed liquidity ───────────────────────────────────────────────────────
  const mintAmt = hre.ethers.parseEther('10000000'); // 10M per token
  await tokenA.mint(deployer.address, mintAmt);
  await tokenB.mint(deployer.address, mintAmt);
  await tokenC.mint(deployer.address, mintAmt);

  // TKA/TKB pool: 100k each (1:1)
  const AMM = await hre.ethers.getContractFactory('AMM');
  const pairAB = AMM.attach(pairABaddr);
  const liqAmt = hre.ethers.parseEther('100000');
  await tokenA.approve(pairABaddr, liqAmt);
  await tokenB.approve(pairABaddr, liqAmt);
  await pairAB.addLiquidity(liqAmt, liqAmt);
  console.log('\n  ✓ Seeded TKA/TKB with 100,000 each');

  // TKA/USDC pool: 50k TKA : 150M USDC (simulating $3000/TKA)
  const pairAC = AMM.attach(pairACaddr);
  const liqA2  = hre.ethers.parseEther('50000');
  const liqC2  = hre.ethers.parseEther('150000000'); // 150M USDC → price = 3000
  await tokenA.approve(pairACaddr, liqA2);
  await tokenC.approve(pairACaddr, liqC2);
  await pairAC.addLiquidity(liqA2, liqC2);
  console.log('  ✓ Seeded TKA/USDC with 50,000 TKA : 150,000,000 USDC');

  // ─── Print summary ────────────────────────────────────────────────────────
  const deployed = {
    network,
    chainId:      (await hre.ethers.provider.getNetwork()).chainId.toString(),
    deployer:     deployer.address,
    deployedAt:   new Date().toISOString(),
    contracts: {
      AMMFactory:    addrFactory,
      'AMM_TKA_TKB': pairABaddr,
      'AMM_TKA_USDC': pairACaddr,
      TokenAlpha:    addrA,
      TokenBeta:     addrB,
      USDC:          addrC,
    },
  };

  console.log('\n' + '='.repeat(50));
  console.log('Deployment Summary');
  console.log('='.repeat(50));
  Object.entries(deployed.contracts).forEach(([k, v]) => console.log(`${k.padEnd(20)} ${v}`));

  // Write addresses JSON for frontend (src/config + frontend/public)
  const outDir  = path.join(__dirname, '../src/config');
  const pubDir  = path.join(__dirname, '../frontend/public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(pubDir, { recursive: true });
  const json = JSON.stringify(deployed, null, 2);
  fs.writeFileSync(path.join(outDir, 'contracts.json'), json);
  fs.writeFileSync(path.join(pubDir, 'contracts.json'), json);
  console.log(`\n  ✓ Addresses saved to src/config/ and frontend/public/`);

  // ─── Etherscan verification (if not localhost) ────────────────────────────
  if (network !== 'localhost' && network !== 'hardhat') {
    console.log('\nVerifying on Etherscan (wait 30s for propagation)…');
    await new Promise(r => setTimeout(r, 30_000));
    for (const [name, addr] of [['TKA', addrA], ['TKB', addrB], ['USDC', addrC]]) {
      try {
        await hre.run('verify:verify', {
          address: addr,
          constructorArguments: name === 'TKA' ? ['Token Alpha', 'TKA'] : name === 'TKB' ? ['Token Beta', 'TKB'] : ['USD Coin', 'USDC'],
        });
        console.log(`  ✓ Verified ${name}`);
      } catch (e) {
        if (!e.message.includes('Already Verified')) console.log(`  ✗ ${name}: ${e.message}`);
      }
    }
    try {
      await hre.run('verify:verify', { address: addrFactory, constructorArguments: [] });
      console.log('  ✓ Verified AMMFactory');
    } catch (e) {
      if (!e.message.includes('Already Verified')) console.log(`  ✗ Factory: ${e.message}`);
    }
  }

  console.log('\n🎉 Done!\n');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
