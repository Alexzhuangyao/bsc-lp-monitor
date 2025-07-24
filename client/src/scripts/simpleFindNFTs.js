/**
 * 简单NFT查询脚本 - 使用标准ERC721 Enumerable接口方法
 * 使用方法: node simpleFindNFTs.js <钱包地址> [合约地址]
 */

const { ethers } = require('ethers');

// 默认配置
const DEFAULT_RPC_URL = 'https://mainnet.unichain.org';
const DEFAULT_CONTRACT_ADDRESS = '0x4529a01c7a0410167c5740c487a8de60232617bf'; // Uniswap V4 Position Manager

// ERC721 接口的最小ABI
const ERC721_ABI = [
  // 查询总数
  'function balanceOf(address owner) view returns (uint256)',
  // 查询指定索引的tokenId (标准ERC721 Enumerable接口，但不是所有合约都实现)
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  // 查询token所有者
  'function ownerOf(uint256 tokenId) view returns (address)',
  // 查询token详情 (Uniswap Position Manager特有)
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
];

/**
 * 查询钱包拥有的所有NFT
 */
async function findNFTs(walletAddress, contractAddress = DEFAULT_CONTRACT_ADDRESS, rpcUrl = DEFAULT_RPC_URL) {
  console.log('======= 开始查询NFT =======');
  console.log(`钱包地址: ${walletAddress}`);
  console.log(`合约地址: ${contractAddress}`);
  console.log(`RPC URL: ${rpcUrl}`);
  
  try {
    // 连接到RPC
    console.log('\n正在连接到网络...');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    // 等待网络连接
    const network = await provider.getNetwork();
    console.log(`已连接到网络: chainId=${network.chainId.toString()}`);
    
    // 创建合约实例
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    // 查询NFT余额
    console.log(`\n查询钱包 ${walletAddress} 的NFT余额...`);
    const balance = await contract.balanceOf(walletAddress);
    console.log(`钱包拥有 ${balance.toString()} 个NFT`);
    
    if (balance === 0n) {
      console.log('没有找到NFT，结束查询');
      return [];
    }
    
    // 先尝试使用tokenOfOwnerByIndex方法查询
    console.log('\n尝试使用tokenOfOwnerByIndex方法查询...');
    const tokenIds = [];
    
    try {
      // 测试第一个索引，看方法是否可用
      const testId = await contract.tokenOfOwnerByIndex(walletAddress, 0);
      console.log(`测试成功，tokenOfOwnerByIndex可用，第一个TokenID: ${testId.toString()}`);
      
      // 查询所有Token IDs
      for (let i = 0; i < balance; i++) {
        try {
          console.log(`查询索引 ${i}...`);
          const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
          console.log(`  ✅ 索引 ${i} 对应的TokenID: ${tokenId.toString()}`);
          tokenIds.push(tokenId.toString());
          
          // 如果是Uniswap Position Manager，尝试获取头寸详情
          try {
            const position = await contract.positions(tokenId);
            console.log(`  💰 该NFT的LP详情:`, {
              token0: position.token0,
              token1: position.token1,
              fee: position.fee.toString(),
              liquidity: position.liquidity.toString()
            });
          } catch (posError) {
            console.log(`  ⚠️ 无法获取头寸详情:`, posError.message);
          }
        } catch (error) {
          console.error(`  ❌ 获取索引 ${i} 的TokenID失败:`, error.message);
          break; // 如果中途失败，跳出循环
        }
        
        // 每次查询之间暂停一下，避免请求过快
        if (i < Number(balance) - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error(`\n❌ tokenOfOwnerByIndex方法不可用，错误: ${error.message}`);
      console.log('将使用暴力搜索方法查找NFT...');
      
      // 使用暴力搜索
      await bruteForceSearch(walletAddress, contract);
    }
    
    // 输出结果摘要
    console.log('\n======= 查询结果摘要 =======');
    if (tokenIds.length > 0) {
      console.log(`找到 ${tokenIds.length} 个NFT TokenID:`);
      console.log(tokenIds);
      
      // 保存结果到文件
      try {
        const fs = require('fs');
        const filename = `nft_${walletAddress.substring(0, 8)}.json`;
        fs.writeFileSync(filename, JSON.stringify({
          wallet: walletAddress,
          contract: contractAddress,
          tokens: tokenIds,
          timestamp: new Date().toISOString()
        }, null, 2));
        console.log(`\n结果已保存到文件: ${filename}`);
      } catch (fileError) {
        console.error('保存结果到文件失败:', fileError.message);
      }
    } else {
      console.log('未找到任何NFT');
    }
    
    return tokenIds;
  } catch (error) {
    console.error('\n❌ 发生错误:', error.message);
    console.error('错误堆栈:', error.stack);
    return [];
  }
}

/**
 * 暴力搜索NFT
 */
async function bruteForceSearch(walletAddress, contract) {
  console.log('\n开始暴力搜索NFT...');
  console.log('这可能需要一些时间，因为我们需要检查大量ID...');
  
  // 创建更高效的搜索策略
  const searchRanges = [
    { start: 1, end: 100 },      // 先搜索小范围可能的ID
    { start: 100, end: 1000 },   // 然后扩大到更大范围
    { start: 1000, end: 10000 }, // 最后搜索更广范围
  ];
  
  const tokenIds = [];
  
  for (const range of searchRanges) {
    console.log(`\n搜索ID范围: ${range.start} - ${range.end}`);
    
    // 使用批量处理提高效率
    const batchSize = 20;
    let found = 0;
    
    for (let i = range.start; i <= range.end; i += batchSize) {
      // 创建一批查询
      const batch = [];
      const endOfBatch = Math.min(i + batchSize - 1, range.end);
      
      for (let j = i; j <= endOfBatch; j++) {
        batch.push(checkOwnership(j, contract, walletAddress));
      }
      
      // 执行批处理
      const results = await Promise.all(batch);
      const validIds = results.filter(Boolean);
      
      if (validIds.length > 0) {
        found += validIds.length;
        tokenIds.push(...validIds);
        console.log(`  ✅ 找到 ${validIds.length} 个NFT: ${validIds.join(', ')}`);
        
        // 获取NFT详情
        for (const id of validIds) {
          try {
            const position = await contract.positions(id);
            console.log(`  💰 NFT #${id} LP详情:`, {
              token0: position.token0,
              token1: position.token1,
              fee: position.fee.toString(),
              liquidity: position.liquidity.toString()
            });
          } catch (error) {
            console.log(`  ⚠️ 无法获取NFT #${id} 详情:`, error.message);
          }
        }
      }
      
      // 显示进度
      if ((i - range.start) % 100 === 0 || i + batchSize > range.end) {
        const progress = Math.round(((i - range.start) / (range.end - range.start)) * 100);
        console.log(`  🔍 搜索进度: ${progress}% (${i}/${range.end}), 已找到: ${found} 个NFT`);
      }
    }
    
    if (found > 0) {
      console.log(`\n在范围 ${range.start}-${range.end} 中找到 ${found} 个NFT`);
      
      // 如果找到了NFT，不再搜索更大范围
      if (found >= 5) { // 假设balanceOf返回的是5
        console.log('已找到足够的NFT，停止搜索');
        break;
      }
    }
  }
  
  return tokenIds;
}

/**
 * 检查NFT所有权
 */
async function checkOwnership(tokenId, contract, walletAddress) {
  try {
    const owner = await contract.ownerOf(tokenId);
    if (owner.toLowerCase() === walletAddress.toLowerCase()) {
      return tokenId.toString();
    }
  } catch (error) {
    // NFT不存在或不属于该钱包，忽略错误
  }
  return null;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('用法: node simpleFindNFTs.js <钱包地址> [合约地址] [RPC URL]');
    return;
  }
  
  const walletAddress = args[0];
  const contractAddress = args[1] || DEFAULT_CONTRACT_ADDRESS;
  const rpcUrl = args[2] || DEFAULT_RPC_URL;
  
  await findNFTs(walletAddress, contractAddress, rpcUrl);
}

// 执行主函数
main().then(() => {
  console.log('\n查询完成');
  process.exit(0);
}).catch(error => {
  console.error('\n发生严重错误:', error);
  process.exit(1);
}); 