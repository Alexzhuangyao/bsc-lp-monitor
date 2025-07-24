import { ethers } from 'ethers';
// 移除未安装的依赖项
// import { useState, useEffect } from 'react';
// import { PoolManager, PositionQuery } from '@uniswap/v4-sdk';
// import { request, gql } from 'graphql-request';

// --- ABIs ---
const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external view returns (uint256 amountOut)"
];

const ROUTER_ABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)'
];

// --- Unichain & Uniswap Configuration ---
const UNICHAIN_CONFIG = {
  chainId: 130,
  rpcUrl: 'https://mainnet.unichain.org', // Primary RPC
  explorerUrl: 'https://uniscan.xyz/', // Explorer URL
  
  // Uniswap V4 Addresses
  uniswap_router: '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V4 Router on Unichain
  uniswap_quoter: '0xeE7Dc2d7d35d22A94C9aFEf73eb30382009a9afA', // Uniswap V4 Quoter on Unichain
  wrapped_native_token: '0x4200000000000000000000000000000000000006', // WETH地址
  
  // V4架构中的核心合约
  pool_manager: '0x943e6e07a7E8E791dAFC44083e54041D743C46E9', // Uniswap V4 PoolManager
  hooks_address: '0x0000000000000000000000000000000000000000' // 默认空Hooks
};

// Uniswap V4 Pool Manager ABI
const POOL_MANAGER_ABI = [
  'function balanceOf(address token, address account) external view returns (uint256)',
  'function getPosition(address owner, bytes32 poolId) external view returns (tuple(uint256 liquidity, uint256 amount0, uint256 amount1))',
  'function getPool(address tokenA, address tokenB, uint24 fee, address hooks) external view returns (bytes32)',
  'function getLiquidity(bytes32 poolId) external view returns (uint128)',
  'function getTick(bytes32 poolId) external view returns (int24)',
  // 增加事件
  'event ModifyPosition(bytes32 indexed poolId, address indexed sender, address indexed owner, int24 tickLower, int24 tickUpper, int256 liquidityDelta)',
  'event Transfer(bytes32 indexed poolId, address indexed from, address indexed to, uint256 amount)',
  'event Swap(bytes32 indexed poolId, address indexed sender, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
];

// Uniswap V4 NonfungiblePositionManager ABI
const POSITION_MANAGER_ABI_V4 = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function totalSupply() external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function decreaseLiquidity(tuple(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  'function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) external payable returns (uint256 amount0, uint256 amount1)',
  'function multicall(bytes[] data) external payable returns (bytes[] results)',
  'function increaseLiquidity(tuple(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1)',
  'function mint(tuple(address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)'
];

// V4 PositionManager地址 (更新为用户提供的地址)
const V4_POSITION_MANAGER_ADDRESS = "0x4529a01c7a0410167c5740c487a8de60232617bf";

// 为Uniswap V4添加新的常量和结构
const FEE_AMOUNTS = {
  LOWEST: 100,  // 0.01%
  LOW: 500,     // 0.05%
  MEDIUM: 3000, // 0.3%
  HIGH: 10000   // 1%
};

// --- Token List for Unichain ---
const UNICHAIN_TOKENS = {
  NATIVE: {
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // 标准原生代币地址表示
    symbol: 'ETH', // Unichain的原生代币是ETH
    decimals: 18,
  },
  USDT: {
    address: '0x9151434b16b9763660705744891fA906F660EcC5', // USDT地址
    symbol: 'USDT',
    decimals: 6
  },
  WBTC: {
    address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', 
    symbol: 'WBTC',
    decimals: 8
  }
};

/**
 * Gets a quote for a swap from Uniswap V4.
 * 
 * @param {object} params - The parameters for the quote.
 * @param {string} params.fromTokenAddress - The address of the token to sell.
 * @param {string} params.toTokenAddress - The address of the token to buy.
 * @param {string} params.amount - The amount to sell.
 * @returns {Promise<object>} A promise that resolves to the quote details.
 */
const getQuote = async ({ fromTokenAddress, toTokenAddress, amount }) => {
  try {
    console.log("Getting Uniswap quote on Unichain...", { fromTokenAddress, toTokenAddress, amount });
    
    const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    const quoterContract = new ethers.Contract(
      UNICHAIN_CONFIG.uniswap_quoter, 
      QUOTER_ABI, 
      provider
    );
    
    // 设置默认手续费为0.3%
    const fee = 3000;
    
    // 调用quoter合约获取报价
    const amountOut = await quoterContract.quoteExactInputSingle(
      fromTokenAddress,
      toTokenAddress,
      fee,
      amount,
      0 // 不设置价格限制
    );
    
    console.log("Quote received:", amountOut.toString());
    
    // 模拟一些额外的数据，实际项目中可能需要从其他来源获取
    return {
      toTokenAmount: amountOut.toString(),
      priceImpactPercentage: "0.05",  // 示例值
      estimateGasFee: ethers.parseEther("0.001").toString(),  // 示例值
      tradeFee: "0.3",  // 0.3% 交易手续费
      dexRouterList: [
        {
          subRouterList: [
            {
              dexProtocol: [{ dexName: 'Uniswap V4' }]
            }
          ]
        }
      ]
    };

  } catch (error) {
    console.error("Failed to get quote from Uniswap on Unichain:", error);
    throw error;
  }
};

/**
 * Generates swap data for a Uniswap V4 trade.
 * 
 * @param {object} params - The parameters for the swap.
 * @returns {Promise<object>} A promise that resolves to the swap transaction data.
 */
const getSwapRoute = async (params) => {
  try {
    console.log("Getting Uniswap swap route on Unichain...", params);

    const { fromTokenAddress, toTokenAddress, amount, userWalletAddress, slippage } = params;
    
    // 解析滑点为十进制值（例如0.005表示0.5%）
    const slippageTolerance = parseFloat(slippage);
    
    // 计算最小输出金额（考虑滑点）
    const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    const quoterContract = new ethers.Contract(
      UNICHAIN_CONFIG.uniswap_quoter, 
      QUOTER_ABI, 
      provider
    );
    
    // 默认手续费为0.3%
    const fee = 3000;
    
    // 获取预计输出金额
    const expectedAmountOut = await quoterContract.quoteExactInputSingle(
      fromTokenAddress,
      toTokenAddress,
      fee,
      amount,
      0 // 不设置价格限制
    );
    
    // 考虑滑点的最小输出金额
    const amountOutMinimum = expectedAmountOut * (1 - slippageTolerance);
    
    // 创建路由器接口
    const routerInterface = new ethers.Interface(ROUTER_ABI);
    
    // 构建交易参数
    const swapParams = {
      tokenIn: fromTokenAddress,
      tokenOut: toTokenAddress,
      fee: fee,
      recipient: userWalletAddress,
      deadline: Math.floor(Date.now() / 1000) + 1800, // 30分钟后过期
      amountIn: amount,
      amountOutMinimum: amountOutMinimum.toString(),
      sqrtPriceLimitX96: 0 // 不设置价格限制
    };
    
    // 编码函数调用
    const data = routerInterface.encodeFunctionData('exactInputSingle', [swapParams]);
    
    // 判断是否是原生代币交易
    const isNativeToken = fromTokenAddress.toLowerCase() === UNICHAIN_TOKENS.NATIVE.address.toLowerCase();
    
    return {
      to: UNICHAIN_CONFIG.uniswap_router,
      data: data,
      value: isNativeToken ? amount : '0', // 如果是原生代币，则需要发送相应数量的ETH
    };

  } catch (error) {
    console.error("Failed to get swap route from Uniswap on Unichain:", error);
    throw error;
  }
};

/**
 * Checks if a token has sufficient allowance.
 * 
 * @param {object} params - The parameters for the check.
 * @returns {Promise<boolean>} True if allowance is sufficient, false otherwise.
 */
const checkAllowance = async ({ tokenAddress, owner, spender, amount, provider }) => {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const allowance = await tokenContract.allowance(owner, spender);
    return ethers.toBigInt(allowance) >= ethers.toBigInt(amount);
  } catch (error) {
    console.error("Failed to check allowance:", error);
    return false;
  }
};

/**
 * Creates an approval transaction.
 * 
 * @param {object} params - The parameters for the approval.
 * @returns {Promise<ethers.TransactionResponse>}
 */
const approveToken = async ({ tokenAddress, spender, wallet }) => {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const tx = await tokenContract.approve(spender, ethers.MaxUint256);
    console.log(`Approval transaction sent: ${tx.hash}`);
    return tx;
  } catch (error) {
    console.error("Failed to send approval transaction:", error);
    throw error;
  }
};

/**
 * 获取用户在Uniswap V4中的LP仓位信息
 * 
 * @param {object} params - 参数对象
 * @param {string} params.walletAddress - 用户钱包地址
 * @param {ethers.providers.Provider} params.provider - 以太坊提供者
 * @returns {Promise<Array>} LP仓位信息数组
 */
const getV4LiquidityPositions = async ({ walletAddress, provider }) => {
  // 增加缓存机制
  const cacheKey = `v4_positions_${walletAddress}`;
  const cachedPositions = localStorage.getItem(cacheKey);
  const cacheTime = localStorage.getItem(`${cacheKey}_time`);
  
  // 使用5分钟缓存
  if (cachedPositions && cacheTime && (Date.now() - parseInt(cacheTime) < 5 * 60 * 1000)) {
    console.log("使用缓存的LP仓位数据");
    return JSON.parse(cachedPositions);
  }
  
  try {
    console.log("获取Uniswap V4 LP仓位信息...", { walletAddress });
    
    const poolManager = new ethers.Contract(
      UNICHAIN_CONFIG.pool_manager, 
      POOL_MANAGER_ABI, 
      provider
    );
    
    const positions = [];
    const tokens = Object.values(UNICHAIN_TOKENS);
    const processedPools = {}; // 用于跟踪已处理的池子
    
    // 使用事件日志获取用户参与过的池子，比遍历所有组合更高效
    console.log("查询用户LP活动事件...");
    
    try {
      // 尝试从事件日志中查找用户参与过的池子
      const eventFilter = {
        address: UNICHAIN_CONFIG.pool_manager,
        topics: [null, ethers.zeroPadValue(ethers.getAddress(walletAddress), 32)],
        fromBlock: -10000, // 查询最近10000个区块的事件
        toBlock: "latest"
      };
      
      const logs = await provider.getLogs(eventFilter);
      console.log(`找到 ${logs.length} 条相关事件记录`);
      
      // 从日志中解析池子ID
      const poolIds = new Set();
      for (const log of logs) {
        try {
          // 尝试从日志中提取poolId (根据实际合约事件结构调整)
          const decodedLog = poolManager.interface.parseLog(log);
          if (decodedLog && decodedLog.args && decodedLog.args.poolId) {
            poolIds.add(decodedLog.args.poolId);
          }
        } catch (e) {
          // 忽略解析错误
          continue;
        }
      }
      
      // 查询用户在这些池子中的仓位
      console.log(`从日志中找到 ${poolIds.size} 个可能的池子`);
      
      if (poolIds.size > 0) {
        for (const poolId of poolIds) {
          if (processedPools[poolId]) continue;
          processedPools[poolId] = true;
          
          try {
            // 获取用户在该池子的仓位信息
            const position = await poolManager.getPosition(walletAddress, poolId);
            
            // 如果用户在该池子没有流动性，则跳过
            if (!position || position.liquidity === 0n) {
              continue;
            }
            
            // 获取池子信息
            const poolInfo = await getPoolInfo(poolId, poolManager, tokens);
            
            // 构建仓位对象
            positions.push({
              poolId: poolId,
              token0: poolInfo.token0,
              token1: poolInfo.token1,
              fee: poolInfo.fee,
              liquidity: position.liquidity.toString(),
              amount0: ethers.formatUnits(position.amount0, poolInfo.token0Decimals),
              amount1: ethers.formatUnits(position.amount1, poolInfo.token1Decimals),
              token0Symbol: poolInfo.token0Symbol,
              token1Symbol: poolInfo.token1Symbol,
              token0Decimals: poolInfo.token0Decimals,
              token1Decimals: poolInfo.token1Decimals,
              currentTick: poolInfo.currentTick,
              totalLiquidity: poolInfo.totalLiquidity
            });
          } catch (poolError) {
            console.warn(`查询池子 ${poolId} 失败:`, poolError);
          }
        }
      }
    } catch (eventError) {
      console.warn("事件查询失败，回退到常用代币对扫描方法:", eventError);
      
      // 如果事件查询失败，回退到优化后的代币对扫描方法
      // 只查询可能性较高的代币对而不是所有组合
      const highPriorityPairs = [
        // ETH-USDT
        { token0: UNICHAIN_TOKENS.NATIVE.address, token1: UNICHAIN_TOKENS.USDT.address, fee: FEE_AMOUNTS.MEDIUM },
        // WBTC-ETH
        { token0: UNICHAIN_TOKENS.WBTC.address, token1: UNICHAIN_TOKENS.NATIVE.address, fee: FEE_AMOUNTS.MEDIUM },
        // WBTC-USDT
        { token0: UNICHAIN_TOKENS.WBTC.address, token1: UNICHAIN_TOKENS.USDT.address, fee: FEE_AMOUNTS.MEDIUM },
      ];
      
      // 添加其他常用费率
      const allPairs = [...highPriorityPairs];
      for (const pair of highPriorityPairs) {
        allPairs.push({ ...pair, fee: FEE_AMOUNTS.LOW });
        allPairs.push({ ...pair, fee: FEE_AMOUNTS.HIGH });
      }
      
      console.log(`扫描 ${allPairs.length} 个高优先级代币对...`);
      
      // 查询这些代币对
      for (const pair of allPairs) {
        try {
          // 获取池子ID
          const poolId = await poolManager.getPool(
            pair.token0,
            pair.token1,
            pair.fee,
            UNICHAIN_CONFIG.hooks_address
          );
          
          if (processedPools[poolId]) continue;
          processedPools[poolId] = true;
          
          // 如果池子不存在或ID为零，则跳过
          if (!poolId || poolId === ethers.ZeroHash) {
            continue;
          }
          
          // 获取用户在该池子的仓位信息
          const position = await poolManager.getPosition(walletAddress, poolId);
          
          // 如果用户在该池子没有流动性，则跳过
          if (!position || position.liquidity === 0n) {
            continue;
          }
          
          // 获取池子信息
          const poolInfo = await getPoolInfo(poolId, poolManager, tokens);
          
          // 构建仓位对象
          positions.push({
            poolId: poolId,
            token0: pair.token0,
            token1: pair.token1,
            fee: pair.fee,
            liquidity: position.liquidity.toString(),
            amount0: ethers.formatUnits(position.amount0, poolInfo.token0Decimals),
            amount1: ethers.formatUnits(position.amount1, poolInfo.token1Decimals),
            token0Symbol: poolInfo.token0Symbol,
            token1Symbol: poolInfo.token1Symbol,
            token0Decimals: poolInfo.token0Decimals,
            token1Decimals: poolInfo.token1Decimals,
            currentTick: poolInfo.currentTick,
            totalLiquidity: poolInfo.totalLiquidity
          });
        } catch (pairError) {
          console.warn(`查询代币对失败: ${pair.token0}-${pair.token1}-${pair.fee}`, pairError);
        }
      }
    }
    
    console.log(`找到 ${positions.length} 个LP仓位`);
    
    // 存入缓存
    localStorage.setItem(cacheKey, JSON.stringify(positions));
    localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    
    return positions;
  } catch (error) {
    console.error("获取V4 LP仓位失败:", error);
    throw error;
  }
};

/**
 * 简化版LP仓位查询函数 - 类似用户示例代码格式
 * @param {string} userAddress 用户钱包地址
 * @param {ethers.providers.Provider} provider 可选，使用自定义provider
 * @returns {Promise<Array>} LP仓位信息数组
 */
const queryV4Positions = async (userAddress, customProvider = null) => {
  try {
    // 1. 配置RPC和合约地址
    const provider = customProvider || new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    const poolManagerAddress = UNICHAIN_CONFIG.pool_manager;

    // 2. 创建合约实例
    const poolManager = new ethers.Contract(poolManagerAddress, POOL_MANAGER_ABI, provider);

    // 3. 查询用户LP活动事件
    console.log(`正在查询用户 ${userAddress} 的LP仓位...`);
    
    // 通过事件查找用户参与过的池子
    const eventFilter = {
      address: poolManagerAddress,
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
    
    // 获取所有匹配的事件日志
    const logs = await provider.getLogs(eventFilter);
    console.log(`找到 ${logs.length} 条用户LP操作事件记录`);
    
    // 4. 提取唯一的池子ID
    const poolIds = new Set();
    for (const log of logs) {
      try {
        // 从日志主题中提取poolId
        poolIds.add(log.topics[1]); // 第二个主题是poolId
      } catch (e) {
        continue;
      }
    }
    
    // 5. 查询每个池子中的用户仓位
    const positions = [];
    const uniquePoolIds = Array.from(poolIds);
    console.log(`从事件中找到 ${uniquePoolIds.length} 个唯一池子`);
    
    for (const poolId of uniquePoolIds) {
      try {
        // 获取用户在该池子的仓位
        const position = await poolManager.getPosition(userAddress, poolId);
        
        // 如果流动性为0，跳过
        if (!position || position.liquidity === 0n) continue;
        
        // 获取池子信息
        const currentTick = await poolManager.getTick(poolId);
        const liquidity = await poolManager.getLiquidity(poolId);
        
        // 添加到结果列表
        positions.push({
          poolId: poolId,
          liquidity: position.liquidity.toString(),
          amount0: position.amount0.toString(),
          amount1: position.amount1.toString(),
          tick: currentTick?.toString() || '0',
          totalLiquidity: liquidity?.toString() || '0'
        });
      } catch (error) {
        console.warn(`查询池子 ${poolId} 失败:`, error);
      }
    }
    
    console.log(`成功获取 ${positions.length} 个LP仓位`);
    return positions;
    
  } catch (error) {
    console.error("查询LP仓位失败:", error);
    throw error;
  }
};

/**
 * 使用Uniswap V4 PositionManager查询NFT LP头寸
 * @param {string} userAddress 用户钱包地址
 * @param {ethers.providers.Provider} customProvider 可选，自定义provider
 * @returns {Promise<Array>} LP头寸信息数组
 */
async function queryV4NFTPositions(userAddress, customProvider = null) {
  try {
    console.log(`查询用户 ${userAddress} 的Uniswap V4 NFT LP头寸...`);
    console.log(`使用Position Manager合约: ${V4_POSITION_MANAGER_ADDRESS}`);
    
    // 1. 设置Provider和合约
    const provider = customProvider || new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    
    try {
      // 检查连接的网络
      const network = await provider.getNetwork();
      console.log(`当前连接的网络: chainId=${network.chainId}, name=${network.name || '未知'}`);
    } catch (networkError) {
      console.error("获取网络信息失败:", networkError);
    }
    
    // 尝试检查用户余额
    try {
      const nativeBalance = await provider.getBalance(userAddress);
      console.log(`用户原生代币余额: ${ethers.formatEther(nativeBalance)} ETH`);
    } catch (balanceError) {
      console.error("获取用户余额失败:", balanceError);
    }
    
    const positionManager = new ethers.Contract(
      V4_POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI_V4,
      provider
    );
    
    // 2. 检查合约是否存在
    console.log("检查Position Manager合约是否存在...");
    const code = await provider.getCode(V4_POSITION_MANAGER_ADDRESS);
    if (code === "0x" || code === "") {
      console.warn("❌ PositionManager合约在该网络上不存在");
      return [];
    }
    console.log("✅ PositionManager合约存在");
    
    // 尝试调用合约方法
    try {
      // 获取合约名称，验证合约是否正常工作
      const name = await positionManager.name().catch(e => "获取合约名称失败: " + e.message);
      const symbol = await positionManager.symbol().catch(e => "获取合约符号失败: " + e.message);
      console.log(`合约名称: ${name}, 符号: ${symbol}`);
    } catch (contractError) {
      console.error("调用基本合约方法失败:", contractError);
    }
    
    // 3. 获取用户拥有的NFT数量
    console.log(`调用balanceOf(${userAddress})获取NFT数量...`);
    let balance;
    try {
      balance = await positionManager.balanceOf(userAddress);
      console.log(`获取到NFT余额: ${balance.toString()}`);
    } catch (balanceError) {
      console.error("获取NFT余额失败:", balanceError);
      // 尝试调用totalSupply方法，验证合约接口是否正常
      try {
        const totalSupply = await positionManager.totalSupply();
        console.log(`合约总供应量: ${totalSupply.toString()}`);
      } catch (e) {
        console.error("获取总供应量失败:", e);
      }
      throw new Error("获取NFT余额失败: " + balanceError.message);
    }
    
    console.log(`用户拥有 ${balance.toString()} 个NFT LP头寸`);
    
    if (balance === 0n) return [];
    
    // 4. 获取每个NFT的TokenID
    const tokenIds = [];
    const balanceNumber = Number(balance);
    
    console.log(`开始获取 ${balanceNumber} 个NFT的TokenID...`);
    for (let i = 0; i < balanceNumber; i++) {
      try {
        console.log(`获取第 ${i} 个TokenID...`);
        const tokenId = await positionManager.tokenOfOwnerByIndex(userAddress, i);
        console.log(`第 ${i} 个TokenID: ${tokenId.toString()}`);
        tokenIds.push(tokenId);
      } catch (error) {
        console.error(`获取TokenID ${i} 失败:`, error);
        
        // 尝试使用ownerOf方法替代查询
        console.log("尝试使用备用方法查询NFT...");
        
        // 尝试从事件日志查询用户拥有的NFT
        try {
          console.log("从事件日志查询NFT...");
          const filter = {
            address: V4_POSITION_MANAGER_ADDRESS,
            topics: [
              ethers.id("Transfer(address,address,uint256)"),
              null,
              ethers.zeroPadValue(ethers.getAddress(userAddress), 32)
            ],
            fromBlock: -10000
          };
          
          const transferLogs = await provider.getLogs(filter);
          console.log(`找到 ${transferLogs.length} 条Transfer事件`);
          
          // 解析日志获取tokenId
          for (const log of transferLogs) {
            try {
              const parsedLog = positionManager.interface.parseLog(log);
              if (parsedLog && parsedLog.name === "Transfer") {
                const eventTokenId = parsedLog.args.tokenId;
                
                // 验证这个NFT是否真的属于用户
                try {
                  const currentOwner = await positionManager.ownerOf(eventTokenId);
                  if (currentOwner.toLowerCase() === userAddress.toLowerCase()) {
                    console.log(`确认用户拥有TokenID: ${eventTokenId.toString()}`);
                    if (!tokenIds.some(id => id.toString() === eventTokenId.toString())) {
                      tokenIds.push(eventTokenId);
                    }
                  }
                } catch (ownerError) {
                  console.warn(`检查TokenID ${eventTokenId} 所有权失败:`, ownerError.message);
                }
              }
            } catch (parseError) {
              console.warn("解析事件日志失败:", parseError.message);
            }
          }
        } catch (eventError) {
          console.error("从事件查询NFT失败:", eventError);
        }
      }
    }
    
    console.log(`成功获取 ${tokenIds.length} 个TokenID: ${tokenIds.map(id => id.toString()).join(', ')}`);
    
    // 5. 获取每个NFT头寸的详细信息
    const positions = [];
    
    for (const tokenId of tokenIds) {
      try {
        // 检查NFT所有者
        try {
          const owner = await positionManager.ownerOf(tokenId);
          console.log(`TokenID ${tokenId} 的所有者: ${owner}`);
          if (owner.toLowerCase() !== userAddress.toLowerCase()) {
            console.warn(`TokenID ${tokenId} 不属于用户 ${userAddress}`);
            continue;
          }
        } catch (ownerError) {
          console.error(`检查TokenID ${tokenId} 所有者失败:`, ownerError);
          continue;
        }
        
        // 获取头寸详细信息
        console.log(`获取TokenID ${tokenId} 的详细信息...`);
        const position = await positionManager.positions(tokenId);
        
        // 如果流动性为0，跳过
        if (position.liquidity === 0n) {
          console.log(`TokenID ${tokenId} 流动性为0，跳过`);
          continue;
        }
        
        // 获取代币信息
        console.log(`获取TokenID ${tokenId} 的代币信息...`);
        console.log(`代币0地址: ${position.token0}`);
        console.log(`代币1地址: ${position.token1}`);
        
        const token0Info = await getTokenInfo(position.token0, provider);
        const token1Info = await getTokenInfo(position.token1, provider);
        
        console.log(`代币0信息: 符号=${token0Info.symbol}, 小数位=${token0Info.decimals}`);
        console.log(`代币1信息: 符号=${token1Info.symbol}, 小数位=${token1Info.decimals}`);
        
        // 构建头寸信息
        const positionInfo = {
          tokenId: tokenId.toString(),
          token0: position.token0,
          token1: position.token1,
          token0Symbol: token0Info.symbol,
          token1Symbol: token1Info.symbol,
          token0Decimals: token0Info.decimals,
          token1Decimals: token1Info.decimals,
          fee: position.fee,
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          liquidity: position.liquidity.toString(),
          tokensOwed0: ethers.formatUnits(position.tokensOwed0, token0Info.decimals),
          tokensOwed1: ethers.formatUnits(position.tokensOwed1, token1Info.decimals),
          feeGrowth0: position.feeGrowthInside0LastX128.toString(),
          feeGrowth1: position.feeGrowthInside1LastX128.toString()
        };
        
        console.log(`构建的头寸信息:`, positionInfo);
        positions.push(positionInfo);
      } catch (error) {
        console.error(`获取TokenID ${tokenId} 详细信息失败:`, error);
      }
    }
    
    console.log(`成功解析 ${positions.length} 个LP头寸详情`);
    return positions;
  } catch (error) {
    console.error("查询NFT LP头寸失败:", error);
    return [];
  }
}

/**
 * 获取代币信息
 * @param {string} tokenAddress 代币地址
 * @param {ethers.providers.Provider} provider 提供者
 * @returns {Promise<Object>} 代币信息
 */
async function getTokenInfo(tokenAddress, provider) {
  try {
    // 预设代币列表
    const knownTokens = {
      [UNICHAIN_TOKENS.NATIVE.address.toLowerCase()]: {
        symbol: 'ETH',
        decimals: 18
      },
      [UNICHAIN_TOKENS.USDT.address.toLowerCase()]: {
        symbol: 'USDT',
        decimals: 6
      },
      [UNICHAIN_TOKENS.WBTC.address.toLowerCase()]: {
        symbol: 'WBTC',
        decimals: 8
      }
    };
    
    // 检查是否是已知代币
    const normalizedAddress = tokenAddress.toLowerCase();
    if (knownTokens[normalizedAddress]) {
      return knownTokens[normalizedAddress];
    }
    
    // 尝试从链上获取
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
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
 * 获取池子详细信息
 * @param {string} poolId 池子ID
 * @param {Contract} poolManager 池子管理器合约
 * @param {Array} tokens 代币列表
 */
async function getPoolInfo(poolId, poolManager, tokens) {
  try {
    // 获取池子的当前tick
    const currentTick = await poolManager.getTick(poolId);
    
    // 获取池子的总流动性
    const totalLiquidity = await poolManager.getLiquidity(poolId);
    
    // 从poolId中提取token0、token1和fee
    // 注意：这里的提取方法可能需要根据实际合约调整
    // 假设poolId是由token0+token1+fee的某种组合生成的
    // 实际项目中，您可能需要调用合约方法获取这些信息
    
    // 临时使用mock数据
    const token0 = tokens[0].address;
    const token1 = tokens[1].address;
    const fee = FEE_AMOUNTS.MEDIUM;
    
    // 找到代币信息
    const token0Info = tokens.find(t => t.address.toLowerCase() === token0.toLowerCase()) || { symbol: 'Unknown', decimals: 18 };
    const token1Info = tokens.find(t => t.address.toLowerCase() === token1.toLowerCase()) || { symbol: 'Unknown', decimals: 18 };
    
    return {
      token0,
      token1,
      fee,
      token0Symbol: token0Info.symbol,
      token1Symbol: token1Info.symbol,
      token0Decimals: token0Info.decimals,
      token1Decimals: token1Info.decimals,
      currentTick: currentTick ? currentTick.toString() : '0',
      totalLiquidity: totalLiquidity ? totalLiquidity.toString() : '0'
    };
  } catch (error) {
    console.error("获取池子信息失败:", error);
    // 返回默认值
    return {
      token0: tokens[0].address,
      token1: tokens[1].address,
      fee: FEE_AMOUNTS.MEDIUM,
      token0Symbol: 'Unknown',
      token1Symbol: 'Unknown',
      token0Decimals: 18,
      token1Decimals: 18,
      currentTick: '0',
      totalLiquidity: '0'
    };
  }
}

/**
 * 通过ID获取Uniswap V4 Position信息
 * @param {string|number} tokenId - Position ID
 * @param {Object} customProvider - 可选的自定义provider
 * @returns {Promise<Object|null>} - Position信息对象
 */
async function getV4PositionById(tokenId, customProvider = null) {
  try {
    const provider = customProvider || new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
    
    // 创建Position Manager合约实例
    const positionManager = new ethers.Contract(
      V4_POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI_V4,
      provider
    );
    
    console.log(`获取NFT ID ${tokenId} 的头寸信息...`);
    
    // 获取头寸信息
    const position = await positionManager.positions(tokenId);
    
    // 如果流动性为0，则返回null
    if (position.liquidity.toString() === '0') {
      console.log(`NFT ID ${tokenId} 的流动性为0`);
      return null;
    }
    
    // 获取代币信息
    const token0Contract = new ethers.Contract(position.token0, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(position.token1, ERC20_ABI, provider);
    
    // 查询代币信息
    const [token0Symbol, token0Decimals, token1Symbol, token1Decimals] = await Promise.all([
      token0Contract.symbol().catch(() => 'Unknown'),
      token0Contract.decimals().catch(() => 18),
      token1Contract.symbol().catch(() => 'Unknown'),
      token1Contract.decimals().catch(() => 18)
    ]);
    
    // 检查所有权
    let owner = ethers.ZeroAddress;
    try {
      owner = await positionManager.ownerOf(tokenId);
    } catch (error) {
      console.warn(`无法获取NFT ID ${tokenId} 的所有者:`, error.message);
    }
    
    // 构造返回结果
    const positionInfo = {
      tokenId: tokenId.toString(),
      token0: position.token0,
      token1: position.token1,
      token0Symbol,
      token1Symbol,
      token0Decimals: Number(token0Decimals),
      token1Decimals: Number(token1Decimals),
      fee: position.fee,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      liquidity: position.liquidity.toString(),
      tokensOwed0: position.tokensOwed0.toString(),
      tokensOwed1: position.tokensOwed1.toString(),
      owner
    };
    
    console.log(`成功获取NFT ID ${tokenId} 的头寸信息:`, {
      token0: token0Symbol,
      token1: token1Symbol,
      fee: Number(position.fee) / 10000 + '%',
      liquidity: position.liquidity.toString()
    });
    
    return positionInfo;
  } catch (error) {
    console.error(`获取NFT ID ${tokenId} 头寸信息失败:`, error);
    return null;
  }
}

// Unified export
export {
  UNICHAIN_CONFIG,
  UNICHAIN_TOKENS,
  POOL_MANAGER_ABI,
  FEE_AMOUNTS,
  POSITION_MANAGER_ABI_V4,
  V4_POSITION_MANAGER_ADDRESS,
  getQuote,
  getSwapRoute,
  checkAllowance,
  approveToken,
  getV4LiquidityPositions,
  queryV4Positions,
  queryV4NFTPositions,
  getV4PositionById
}; 