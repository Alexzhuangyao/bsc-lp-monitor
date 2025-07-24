const { findAllNFTs } = require('../examples/queryAllNFTs');

// 获取命令行参数
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log("用法: node checkNFTs.js <钱包地址> <合约地址> [RPC URL]");
  console.log("示例: node checkNFTs.js 0xYourWallet 0x943e6e07a7E8E791dAFC44083e54041D743C46E9");
  process.exit(1);
}

const walletAddress = args[0];
const contractAddress = args[1];
const rpcUrl = args[2] || "https://mainnet.unichain.org";

console.log(`开始查询钱包 ${walletAddress} 在合约 ${contractAddress} 上的NFT...`);
console.log(`使用RPC: ${rpcUrl}`);

findAllNFTs(walletAddress, contractAddress, rpcUrl)
  .then(nfts => {
    console.log("\n查询结果:");
    console.log(`找到 ${nfts.length} 个NFT: ${nfts.join(', ')}`);
    
    if (nfts.length > 0) {
      console.log("\n您可以在LPPositions组件中使用以下NFT TokenID:");
      nfts.forEach((tokenId, index) => {
        console.log(`${index + 1}. TokenID: ${tokenId}`);
      });
    } else {
      console.log("\n没有找到NFT。可能的原因:");
      console.log("1. 钱包地址或合约地址不正确");
      console.log("2. 连接的网络不正确");
      console.log("3. NFT可能在不同的合约上");
      console.log("4. NFT可能使用不标准的ERC721接口");
    }
    
    console.log("\n如果您确定有NFT，请检查:");
    console.log("- 网络连接是否正确");
    console.log("- 合约地址是否正确");
    console.log("- 钱包地址是否正确");
  })
  .catch(error => {
    console.error("查询失败:", error);
  }); 