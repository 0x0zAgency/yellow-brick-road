require("@nomiclabs/hardhat-ethers");
const networks={
  hardhat:{chainId:31337},
  ganache:{url:process.env.GANACHE_RPC_URL || "http://127.0.0.1:8545",chainId:1337},
};
if(process.env.SEPOLIA_RPC_URL){
  networks.sepolia={url:process.env.SEPOLIA_RPC_URL,chainId:11155111,
    accounts:process.env.SEPOLIA_PRIVATE_KEY?[process.env.SEPOLIA_PRIVATE_KEY]:[]};
}
module.exports={
  solidity:{version:"0.8.24",settings:{optimizer:{enabled:true,runs:200}}},
  networks
};
