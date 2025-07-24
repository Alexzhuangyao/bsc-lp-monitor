import { ethers } from "ethers";
import { queryV4Positions, UNICHAIN_CONFIG, POOL_MANAGER_ABI } from '../services/uniswapService';

/**
 * 示例脚本：查询Uniswap V4 LP仓位
 * 这个脚本演示了如何直接使用queryV4Positions函数查询用户的LP仓位
 */

// 示例1：使用默认配置查询仓位
async function example1(userAddress) {
  try {
    console.log("示例1：使用默认配置查询LP仓位");
    console.log(`查询地址: ${userAddress}`);
    
    const positions = await queryV4Positions(userAddress);
    
    console.log("查询结果:");
    console.table(positions);
    
    return positions;
  } catch (error) {
    console.error("查询失败:", error);
  }
}

// 示例2：使用自定义RPC查询仓位
async function example2(userAddress, rpcUrl) {
  try {
    console.log("示例2：使用自定义RPC查询LP仓位");
    console.log(`查询地址: ${userAddress}`);
    console.log(`RPC URL: ${rpcUrl}`);
    
    const customProvider = new ethers.JsonRpcProvider(rpcUrl);
    const positions = await queryV4Positions(userAddress, customProvider);
    
    console.log("查询结果:");
    console.table(positions);
    
    return positions;
  } catch (error) {
    console.error("查询失败:", error);
  }
}

// 示例3：自定义实现查询逻辑
async function example3(userAddress) {
  try {
    console.log("示例3：手动实现查询逻辑");
    console.log(`查询地址: ${userAddress}`);
    
    // 1. 配置RPC和合约地址
    const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    const poolManagerAddress = UNICHAIN_CONFIG.pool_manager;

    // 2. 创建合约实例
    const poolManager = new ethers.Contract(poolManagerAddress, POOL_MANAGER_ABI, provider);

    // 3. 查询用户LP活动事件
    console.log("查询LP活动事件...");
    
    // 查询事件
    const eventFilter = {
      address: poolManagerAddress,
      topics: [
        ethers.id("ModifyPosition(bytes32,address,address,int24,int24,int256)"),
        null,
        null,
        ethers.zeroPadValue(ethers.getAddress(userAddress), 32)
      ],
      fromBlock: -10000,
      toBlock: "latest"
    };
    
    const logs = await provider.getLogs(eventFilter);
    console.log(`找到 ${logs.length} 条相关事件`);
    
    // 4. 提取池子ID并查询仓位
    const poolIds = new Set();
    for (const log of logs) {
      try {
        poolIds.add(log.topics[1]);
      } catch (e) {}
    }
    
    console.log(`找到 ${poolIds.size} 个唯一池子ID`);
    
    // 5. 获取仓位详情
    const positions = [];
    for (const poolId of poolIds) {
      try {
        const position = await poolManager.getPosition(userAddress, poolId);
        
        if (position && position.liquidity > 0n) {
          positions.push({
            poolId,
            liquidity: position.liquidity.toString(),
            amount0: position.amount0.toString(),
            amount1: position.amount1.toString()
          });
        }
      } catch (error) {
        console.warn(`查询池子 ${poolId} 失败`);
      }
    }
    
    console.log("查询结果:");
    console.table(positions);
    
    return positions;
  } catch (error) {
    console.error("查询失败:", error);
  }
}

// 导出示例函数
export { example1, example2, example3 };

// 如果直接运行此脚本，执行示例1
if (typeof require !== 'undefined' && require.main === module) {
  const userAddress = process.argv[2] || "0xYourWalletAddress"; // 替换为您的钱包地址
  example1(userAddress)
    .then(() => process.exit(0))
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
} 