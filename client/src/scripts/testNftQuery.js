/**
 * 测试NFT查询功能的命令行脚本
 * 使用方法：node testNftQuery.js [nftId] [userAddress]
 */
const ethers = require('ethers');

// Uniswap V4 配置
const UNICHAIN_CONFIG = {
  rpcUrl: 'https://mainnet.unichain.org', // Primary RPC
};

// V4 PositionManager地址
const V4_POSITION_MANAGER_ADDRESS = "0x4529a01c7a0410167c5740c487a8de60232617bf";

// Uniswap V4 NonfungiblePositionManager ABI (仅查询相关方法)
const POSITION_MANAGER_ABI_V4 = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function totalSupply() external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
];

// ERC20 ABI
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

/**
 * 获取代币信息
 * @param {string} tokenAddress 代币地址
 * @param {ethers.providers.Provider} provider 提供者
 * @returns {Promise<Object>} 代币信息
 */
async function getTokenInfo(tokenAddress, provider) {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ERC20_ABI,
      provider
    );
    
    const [symbol, decimals] = await Promise.all([
      tokenContract.symbol().catch(() => 'Unknown'),
      tokenContract.decimals().catch(() => 18)
    ]);
    
    return { symbol, decimals: Number(decimals) };
  } catch (error) {
    console.warn(`获取代币 ${tokenAddress} 信息失败:`, error.message);
    return { symbol: 'Unknown', decimals: 18 };
  }
}

/**
 * 获取特定NFT ID的LP头寸信息
 */
async function getNFTPositionInfo(tokenId) {
  try {
    console.log(`查询NFT ID ${tokenId} 的LP头寸信息...`);
    
    const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    console.log(`使用Provider: ${UNICHAIN_CONFIG.rpcUrl}`);
    console.log(`连接PositionManager合约: ${V4_POSITION_MANAGER_ADDRESS}`);
    
    // 创建合约实例
    const positionManager = new ethers.Contract(
      V4_POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI_V4,
      provider
    );
    
    // 获取合约代码
    console.log("检查合约代码...");
    const code = await provider.getCode(V4_POSITION_MANAGER_ADDRESS);
    console.log(`合约代码长度: ${code.length}`);
    
    if (code === "0x" || code === "") {
      console.error("错误: 合约代码不存在!");
      return null;
    }
    
    // 测试基本合约方法
    try {
      console.log("测试合约totalSupply方法...");
      const totalSupply = await positionManager.totalSupply();
      console.log(`合约总供应量: ${totalSupply.toString()}`);
    } catch (e) {
      console.warn("获取总供应量失败:", e.message);
    }
    
    // 获取头寸信息
    console.log(`获取TokenID ${tokenId} 的详细信息...`);
    let position;
    
    try {
      position = await positionManager.positions(tokenId);
      console.log("查询成功!");
      console.log(`头寸信息:`, {
        token0: position.token0,
        token1: position.token1,
        fee: position.fee.toString(),
        tickLower: position.tickLower.toString(),
        tickUpper: position.tickUpper.toString(),
        liquidity: position.liquidity.toString(),
        tokensOwed0: position.tokensOwed0.toString(),
        tokensOwed1: position.tokensOwed1.toString(),
      });
    } catch (error) {
      console.error(`获取TokenID ${tokenId} 详细信息失败:`, error.message);
      return null;
    }
    
    // 如果流动性为0，返回null
    if (position.liquidity === 0n) {
      console.log(`TokenID ${tokenId} 流动性为0，跳过`);
      return null;
    }
    
    // 获取代币信息
    console.log(`获取代币信息: token0=${position.token0}, token1=${position.token1}`);
    const token0Info = await getTokenInfo(position.token0, provider);
    const token1Info = await getTokenInfo(position.token1, provider);
    
    // 尝试获取所有者
    let owner = "未知";
    try {
      owner = await positionManager.ownerOf(tokenId);
      console.log(`TokenID ${tokenId} 的所有者: ${owner}`);
    } catch (ownerError) {
      console.warn(`获取TokenID ${tokenId} 所有者失败:`, ownerError.message);
    }
    
    // 构建结果对象
    const result = {
      tokenId: tokenId.toString(),
      token0: position.token0,
      token1: position.token1,
      token0Symbol: token0Info.symbol,
      token1Symbol: token1Info.symbol,
      token0Decimals: token0Info.decimals,
      token1Decimals: token1Info.decimals,
      fee: position.fee.toString(),
      tickLower: position.tickLower.toString(),
      tickUpper: position.tickUpper.toString(),
      liquidity: position.liquidity.toString(),
      tokensOwed0: ethers.formatUnits(position.tokensOwed0, token0Info.decimals),
      tokensOwed1: ethers.formatUnits(position.tokensOwed1, token1Info.decimals),
      owner: owner
    };
    
    console.log("查询结果:");
    console.log(JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error(`查询NFT ID ${tokenId} 失败:`, error);
    console.error("错误堆栈:", error.stack);
    return null;
  }
}

/**
 * 获取用户持有的所有NFT
 */
async function getUserNFTs(userAddress) {
  try {
    console.log(`查询用户 ${userAddress} 的NFT...`);
    
    const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    
    // 创建合约实例
    const positionManager = new ethers.Contract(
      V4_POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI_V4,
      provider
    );
    
    // 获取NFT余额
    console.log(`调用balanceOf(${userAddress})...`);
    const balance = await positionManager.balanceOf(userAddress);
    console.log(`用户拥有 ${balance.toString()} 个NFT`);
    
    const tokenIds = [];
    const balanceNumber = Number(balance);
    
    // 获取每个NFT的TokenID
    if (balanceNumber > 0) {
      console.log(`尝试获取 ${balanceNumber} 个NFT的TokenID...`);
      
      for (let i = 0; i < balanceNumber; i++) {
        try {
          console.log(`获取第 ${i} 个TokenID...`);
          const tokenId = await positionManager.tokenOfOwnerByIndex(userAddress, i);
          console.log(`第 ${i} 个TokenID: ${tokenId.toString()}`);
          tokenIds.push(tokenId.toString());
        } catch (error) {
          console.error(`获取TokenID ${i} 失败:`, error.message);
        }
      }
    }
    
    // 尝试通过Transfer事件查询
    if (tokenIds.length === 0) {
      console.log("尝试通过Transfer事件查询NFT...");
      
      const filter = {
        address: V4_POSITION_MANAGER_ADDRESS,
        topics: [
          ethers.id("Transfer(address,address,uint256)"),
          null,
          ethers.zeroPadValue(ethers.getAddress(userAddress), 32)
        ],
        fromBlock: -1000  // 最近1000个区块
      };
      
      const logs = await provider.getLogs(filter);
      console.log(`找到 ${logs.length} 条Transfer事件`);
      
      for (const log of logs) {
        try {
          const parsedLog = positionManager.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "Transfer") {
            const eventTokenId = parsedLog.args.tokenId.toString();
            console.log(`从日志解析到TokenID: ${eventTokenId}`);
            
            // 验证所有权
            try {
              const owner = await positionManager.ownerOf(eventTokenId);
              if (owner.toLowerCase() === userAddress.toLowerCase()) {
                console.log(`确认用户拥有TokenID: ${eventTokenId}`);
                if (!tokenIds.includes(eventTokenId)) {
                  tokenIds.push(eventTokenId);
                }
              }
            } catch (ownerError) {
              console.warn(`检查TokenID ${eventTokenId} 所有权失败:`, ownerError.message);
            }
          }
        } catch (parseError) {
          console.warn(`解析日志失败:`, parseError.message);
        }
      }
    }
    
    console.log(`===== 查询结果 =====`);
    console.log(`找到 ${tokenIds.length} 个NFT:`);
    console.log(tokenIds);
    
    return tokenIds;
  } catch (error) {
    console.error(`查询用户NFT失败:`, error);
    return [];
  }
}

// 执行主函数
async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase() || 'help';
  
  if (command === 'help' || !command) {
    console.log(`
使用方法:
  node testNftQuery.js nft <nftId>     - 查询特定NFT ID的LP位置信息
  node testNftQuery.js user <address>  - 查询用户持有的所有NFT ID
  node testNftQuery.js help            - 显示此帮助信息
    `);
    return;
  }
  
  if (command === 'nft') {
    const nftId = args[1];
    if (!nftId) {
      console.error("错误: 请提供NFT ID");
      return;
    }
    
    await getNFTPositionInfo(nftId);
  } else if (command === 'user') {
    const userAddress = args[1];
    if (!userAddress) {
      console.error("错误: 请提供用户地址");
      return;
    }
    
    await getUserNFTs(userAddress);
  } else {
    console.error(`未知命令: ${command}`);
    console.log("使用 'node testNftQuery.js help' 查看使用方法");
  }
}

main().catch(console.error); 