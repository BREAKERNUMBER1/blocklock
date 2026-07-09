const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const recipient = "0xf68986a4aba8920ddecf9960a2dfd02e8221dd42";

  const nftAddress   = "0xfB0629a6BC669feb4E2aa45a589732342D7eFA5f";
  const goofAddress  = "0x6e615f25f26C2a9aAFCF891a9e9322Cd015De2e8";

  const nft  = await hre.ethers.getContractAt("MockGoofballGang", nftAddress, deployer);
  const goof = await hre.ethers.getContractAt("MockGoof", goofAddress, deployer);

  console.log(`Minting test NFT to ${recipient}...`);
  const nftTx = await nft.mint(recipient);
  await nftTx.wait();
  console.log("NFT minted. Tx:", nftTx.hash);

  console.log(`Minting 10 test GOOF to ${recipient}...`);
  const goofTx = await goof.mint(recipient, hre.ethers.parseEther("10"));
  await goofTx.wait();
  console.log("GOOF minted. Tx:", goofTx.hash);

  console.log("Done!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
