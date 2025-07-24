/**
 * 通过暴力搜索发现用户拥有的NFT
 * 使用方法：node findNFTs.js <钱包地址> [开始ID] [结束ID]
 */
const ethers = require('ethers');

// Unichain配置
const RPC_URL = 'https://mainnet.unichain.org';
const POSITION_MANAGER_ADDRESS = "0x4529a01c7a0410167c5740c487a8de60232617bf";

// 备用RPC配置，用于分担请求负载
const BACKUP_RPC_URLS = [
  'https://mainnet.unichain.org',
  'https://unichain.drpc.org',
  'https://unichain.api.onfinality.io/public'
];

// 简化的ABI
const ABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function balanceOf(address owner) external view returns (uint256)',
];

/**
 * 创建带有负载均衡和重试功能的provider
 */
function createRobustProvider() {
  // 随机选择一个RPC URL以分担负载
  const rpcUrl = BACKUP_RPC_URLS[Math.floor(Math.random() * BACKUP_RPC_URLS.length)];
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  console.log(`使用RPC: ${rpcUrl}`);
  return provider;
}

/**
 * 自动估算有效范围并暴力搜索NFT
 */
async function smartSearch(walletAddress, hints = []) {
  console.log("开始智能搜索...");
  console.log(`钱包地址: ${walletAddress}`);
  
  // 创建不同的provider以减轻单个RPC的负担
  const provider = createRobustProvider();
  // 注意：不再尝试访问provider.connection.url
  
  const contract = new ethers.Contract(POSITION_MANAGER_ADDRESS, ABI, provider);
  
  try {
    // 检查用户余额
    console.log("检查NFT余额...");
    const balance = await contract.balanceOf(walletAddress);
    console.log(`用户在余额检查中拥有 ${balance} 个NFT`);
    
    // 如果余额为0，尝试较小范围搜索
    if (balance === 0n) {
      console.log("余额为0，尝试小范围搜索(1-1000)验证...");
      return await bruteForceSearchNFTs(walletAddress, 1, 1000, 50);
    }
    
    // 如果提供了提示ID，优先搜索这些ID周围
    if (hints && hints.length > 0) {
      console.log(`发现 ${hints.length} 个提示ID，优先搜索周围区域...`);
      
      const foundTokens = [];
      
      // 搜索每个提示ID周围的±200范围
      for (const hint of hints) {
        const hintNum = parseInt(hint);
        if (isNaN(hintNum)) continue;
        
        const startRange = Math.max(1, hintNum - 200);
        const endRange = hintNum + 200;
        console.log(`搜索提示ID ${hintNum} 周围范围: ${startRange}-${endRange}`);
        
        const found = await bruteForceSearchNFTs(walletAddress, startRange, endRange, 50);
        found.forEach(id => {
          if (!foundTokens.includes(id)) foundTokens.push(id);
        });
      }
      
      if (foundTokens.length > 0) {
        console.log(`在提示区域找到 ${foundTokens.length} 个NFT`);
        return foundTokens;
      }
      
      console.log("提示区域没有找到NFT，进行更广泛搜索...");
    }
    
    // 第一阶段：大范围快速扫描找出可能的区域
    console.log("\n=== 第一阶段: 大范围快速扫描 ===");
    const potentialRanges = [];
    
    // 每隔1000检查一个ID，最多检查到100000
    for (let i = 1; i <= 100000; i += 1000) {
      try {
        const owner = await contract.ownerOf(i);
        if (owner.toLowerCase() === walletAddress.toLowerCase()) {
          console.log(`发现NFT在ID ${i}`);
          potentialRanges.push({start: Math.max(1, i - 500), end: i + 500});
        }
      } catch (error) {
        // ID不存在或不属于用户，继续
      }
      
      // 简单进度显示
      if (i % 10000 === 0) {
        console.log(`快速扫描进度: 已检查到 ${i}`);
      }
    }
    
    if (potentialRanges.length === 0) {
      console.log("快速扫描未找到任何NFT，尝试默认范围1-10000");
      return await bruteForceSearchNFTs(walletAddress, 1, 10000, 50);
    }
    
    // 第二阶段：针对有潜力的区域进行精细扫描
    console.log("\n=== 第二阶段: 精细扫描潜力区域 ===");
    const foundTokens = [];
    
    for (const range of potentialRanges) {
      console.log(`精细扫描区域: ${range.start}-${range.end}`);
      const found = await bruteForceSearchNFTs(walletAddress, range.start, range.end, 50);
      found.forEach(id => {
        if (!foundTokens.includes(id)) foundTokens.push(id);
      });
    }
    
    return foundTokens;
    
  } catch (error) {
    console.error("智能搜索过程中发生错误:", error);
    console.log("回退到标准暴力搜索...");
    return await bruteForceSearchNFTs(walletAddress, 1, 10000, 50);
  }
}

/**
 * 暴力搜索NFT，通过检查ID范围内的所有权
 */
async function bruteForceSearchNFTs(walletAddress, startId = 1, endId = 10000, batchSize = 50) {
  const provider = createRobustProvider();
  // 不再尝试访问provider.connection.url
  console.log(`NFT合约地址: ${POSITION_MANAGER_ADDRESS}`);
  console.log(`搜索范围: ${startId}-${endId}`);
  
  const contract = new ethers.Contract(POSITION_MANAGER_ADDRESS, ABI, provider);
  const foundTokens = [];
  let progressCounter = 0;
  const totalToCheck = endId - startId + 1;
  
  // 保存到文件功能
  const fs = require('fs');
  const saveToFile = (data) => {
    try {
      fs.writeFileSync(`nft_results_${walletAddress.substring(0, 8)}.json`, 
                     JSON.stringify({
                       wallet: walletAddress,
                       tokens: data,
                       timestamp: new Date().toISOString()
                     }, null, 2));
      console.log(`结果已保存到文件 nft_results_${walletAddress.substring(0, 8)}.json`);
    } catch (error) {
      console.error("保存结果到文件失败:", error.message);
    }
  };

  // 分批查询，避免请求过多导致RPC限制
  for (let i = startId; i <= endId; i += batchSize) {
    const batch = [];
    const endBatch = Math.min(i + batchSize - 1, endId);
    
    // 创建批次的promise
    for (let j = i; j <= endBatch; j++) {
      batch.push(checkOwnership(j, contract, walletAddress));
    }
    
    // 等待批次完成
    const results = await Promise.all(batch);
    const validInBatch = results.filter(Boolean);
    foundTokens.push(...validInBatch);
    
    // 显示进度
    progressCounter += batchSize;
    const progressPct = Math.min(100, Math.round((progressCounter / totalToCheck) * 100));
    console.log(`进度: ${progressPct}% (${Math.min(progressCounter, totalToCheck)}/${totalToCheck}) | 已找到: ${foundTokens.length} 个NFT`);
    
    if (validInBatch.length > 0) {
      console.log(`本批次发现: ${validInBatch.join(', ')}`);
      // 每当发现新令牌，就保存结果
      saveToFile(foundTokens);
    }
    
    // 每批次后稍微暂停，避免RPC请求过于频繁
    if (i + batchSize <= endId) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log("\n===== 搜索完成 =====");
  console.log(`在ID范围 ${startId}-${endId} 内找到 ${foundTokens.length} 个NFT:`);
  console.log(foundTokens);
  
  // 保存最终结果
  if (foundTokens.length > 0) {
    saveToFile(foundTokens);
  }
  
  // 尝试获取找到的NFT的详细信息
  if (foundTokens.length > 0) {
    console.log("\n===== NFT详情 =====");
    const details = [];
    
    for (const tokenId of foundTokens) {
      try {
        // 使用新的provider以减轻负担
        const detailProvider = createRobustProvider();
        const detailContract = new ethers.Contract(POSITION_MANAGER_ADDRESS, ABI, detailProvider);
        
        const position = await detailContract.positions(tokenId);
        const detail = {
          tokenId,
          token0: position.token0,
          token1: position.token1,
          fee: position.fee.toString(),
          tickLower: position.tickLower.toString(),
          tickUpper: position.tickUpper.toString(),
          liquidity: position.liquidity.toString(),
        };
        
        console.log(`TokenID ${tokenId}:`, detail);
        details.push(detail);
        
        // 保存详细信息
        try {
          fs.writeFileSync(`nft_details_${walletAddress.substring(0, 8)}.json`, 
                         JSON.stringify({
                           wallet: walletAddress,
                           details: details,
                           timestamp: new Date().toISOString()
                         }, null, 2));
        } catch (error) {
          console.error("保存详细信息到文件失败:", error.message);
        }
        
      } catch (error) {
        console.error(`获取TokenID ${tokenId} 信息失败:`, error.message);
      }
      
      // 每次查询后短暂暂停
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return foundTokens;
}

/**
 * 检查特定ID的NFT所有权
 */
async function checkOwnership(tokenId, contract, walletAddress) {
  try {
    const owner = await contract.ownerOf(tokenId);
    if (owner.toLowerCase() === walletAddress.toLowerCase()) {
      return tokenId;
    }
  } catch (error) {
    // 忽略错误（大多数ID不存在或不属于用户）
  }
  return null;
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log("用法: node findNFTs.js <钱包地址> [开始ID] [结束ID]");
    console.log("  或: node findNFTs.js smart <钱包地址> [提示ID1] [提示ID2] ...");
    return;
  }
  
  // 智能搜索模式
  if (args[0].toLowerCase() === 'smart') {
    if (args.length < 2) {
      console.log("智能搜索模式需要提供钱包地址: node findNFTs.js smart <钱包地址> [提示ID]");
      return;
    }
    
    const walletAddress = args[1];
    const hints = args.slice(2);
    
    console.log(`使用智能搜索模式查找钱包 ${walletAddress} 拥有的NFT...`);
    await smartSearch(walletAddress, hints);
    return;
  }
  
  // 常规搜索模式
  const walletAddress = args[0];
  const startId = args[1] ? parseInt(args[1]) : 1;
  const endId = args[2] ? parseInt(args[2]) : 10000;
  
  console.log(`搜索钱包 ${walletAddress} 拥有的NFT...`);
  await bruteForceSearchNFTs(walletAddress, startId, endId);
}

main().catch(error => {
  console.error("发生错误:", error);
}); 