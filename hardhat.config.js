require("@nomiclabs/hardhat-ethers");
module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { hardhat: { chainId: 31337 } }
};
