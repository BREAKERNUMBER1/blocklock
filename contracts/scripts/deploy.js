const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Deploying to ${network} with account: ${deployer.address}`);

  if (network === "mainnet") {
    console.log("MAINNET DEPLOYMENT: Using real contract addresses.");
    console.log("  Goofball Gang NFT: 0xf1987f66553460a4f0730ce17484f5a9a2e883a6");
    console.log("  $GOOF Token:       0x84802079Fde7658F9D0969810693a2FA1870EEdF");
    console.log("  No contracts to deploy on mainnet — update .env with real addresses.");
    return;
  }

  // Deploy mock NFT
  const MockGoofballGang = await hre.ethers.getContractFactory("MockGoofballGang");
  const nft = await MockGoofballGang.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log(`MockGoofballGang deployed: ${nftAddress}`);

  // Deploy mock ERC20
  const MockGoof = await hre.ethers.getContractFactory("MockGoof");
  const token = await MockGoof.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`MockGoof deployed:         ${tokenAddress}`);

  // Mint some test tokens and NFTs to deployer for testing
  const mintNFTTx = await nft.mint(deployer.address);
  await mintNFTTx.wait();
  console.log(`Minted test NFT to ${deployer.address}`);

  const mintTokenTx = await token.mint(deployer.address, hre.ethers.parseEther("100"));
  await mintTokenTx.wait();
  console.log(`Minted 100 test GOOF to ${deployer.address}`);

  // Mint to test wallet
  const TEST_WALLET = "0x2F05Da43f6D2143B12B9eF7835E1e1E7c5B7dbCf";
  const mintNFTTx2 = await nft.mint(TEST_WALLET);
  await mintNFTTx2.wait();
  console.log(`Minted test NFT to ${TEST_WALLET}`);

  const mintTokenTx2 = await token.mint(TEST_WALLET, hre.ethers.parseEther("100"));
  await mintTokenTx2.wait();
  console.log(`Minted 100 test GOOF to ${TEST_WALLET}`);

  console.log("\n--- Copy these into your backend .env ---");
  console.log(`NFT_CONTRACT_ADDRESS=${nftAddress}`);
  console.log(`GOOF_TOKEN_ADDRESS=${tokenAddress}`);
  console.log(`NETWORK=sepolia`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
