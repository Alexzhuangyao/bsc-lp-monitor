import { ethers } from "ethers";

// 1. 配置RPC和合约地址
const RPC_URL = "https://mainnet.unichain.org"; // Unichain主网RPC
const POOL_MANAGER_ADDRESS = "0x943e6e07a7E8E791dAFC44083e54041D743C46E9"; // Uniswap V4 PoolManager
const POOL_MANAGER_ABI = [
  'function balanceOf(address token, address account) external view returns (uint256)',
  'function getPosition(address owner, bytes32 poolId) external view returns (tuple(uint256 liquidity, uint256 amount0, uint256 amount1))',
  'function getPool(address tokenA, address tokenB, uint24 fee, address hooks) external view returns (bytes32)',
  'function getLiquidity(bytes32 poolId) external view returns (uint128)',
  'function getTick(bytes32 poolId) external view returns (int24)',
  'event ModifyPosition(bytes32 indexed poolId, address indexed sender, address indexed owner, int24 tickLower, int24 tickUpper, int256 liquidityDelta)'
];

// 2. 创建合约实例
const provider = new ethers.JsonRpcProvider(RPC_URL);
const poolManagerContract = new ethers.Contract(POOL_MANAGER_ADDRESS, POOL_MANAGER_ABI, provider);

// 3. 查询用户LP仓位示例函数
async function getUserV4Positions(userAddress) {
  console.log(`查询地址 ${userAddress} 的Uniswap V4 LP仓位...`);
  
  try {
    // 通过事件查询用户参与过的池子
    const eventFilter = {
      address: POOL_MANAGER_ADDRESS,
      topics: [
        // ModifyPosition事件的keccak256哈希值
        ethers.id("ModifyPosition(bytes32,address,address,int24,int24,int256)"),
        null, // poolId (任意)
        null, // sender (任意)
        ethers.zeroPadValue(ethers.getAddress(userAddress), 32) // owner (指定)
      ],
      fromBlock: -10000, // 最近10000个区块
      toBlock: "latest"
    };
    
    // 获取事件日志
    const logs = await provider.getLogs(eventFilter);
    console.log(`找到 ${logs.length} 条用户LP操作事件`);
    
    // 提取唯一的池子ID
    const poolIds = new Set();
    for (const log of logs) {
      try {
        poolIds.add(log.topics[1]); // 第二个主题是poolId
      } catch (e) { continue; }
    }
    
    // 查询每个池子中的用户仓位
    const positions = [];
    console.log(`查询 ${poolIds.size} 个唯一池子中的仓位...`);
    
    for (const poolId of poolIds) {
      try {
        // 获取用户在该池子的仓位
        const position = await poolManagerContract.getPosition(userAddress, poolId);
        
        // 如果流动性为0，跳过
        if (!position || position.liquidity === 0n) continue;
        
        // 获取池子的当前tick和总流动性
        const currentTick = await poolManagerContract.getTick(poolId);
        const totalLiquidity = await poolManagerContract.getLiquidity(poolId);
        
        // 添加到结果列表
        positions.push({
          poolId,
          liquidity: position.liquidity.toString(),
          amount0: position.amount0.toString(),
          amount1: position.amount1.toString(),
          currentTick: currentTick?.toString() || '0',
          totalLiquidity: totalLiquidity?.toString() || '0'
        });
      } catch (error) {
        console.warn(`查询池子 ${poolId} 失败:`, error.message);
      }
    }
    
    return positions;
  } catch (error) {
    console.error("查询LP仓位失败:", error);
    throw error;
  }
}

// 4. 调用并打印结果
async function main() {
  // 替换为您要查询的钱包地址
  const walletAddress = "0xYourWalletAddressHere";
  
  try {
    const positions = await getUserV4Positions(walletAddress);
    console.log(`找到 ${positions.length} 个LP仓位:`);
    console.table(positions);
  } catch (error) {
    console.error("查询失败:", error);
  }
}

// 如果直接运行此脚本
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

// 导出查询函数，以便可以从其他文件导入
export { getUserV4Positions }; 