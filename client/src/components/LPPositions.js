import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Text, Button, IconButton, VStack, HStack, Flex, Spinner,
  useToast, Input, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalFooter, ModalCloseButton, useDisclosure, Icon,
  Card, CardBody, Badge, Tooltip, Table, Thead, Tbody, Tr, Th, Td, Link,
  Switch, InputGroup, InputLeftElement, InputRightElement
} from '@chakra-ui/react';
import { ExternalLinkIcon, RepeatIcon, CloseIcon, MinusIcon, AddIcon, SearchIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import { 
  getSwapRoute, 
  approveToken, 
  checkAllowance, 
  UNICHAIN_CONFIG, 
  UNICHAIN_TOKENS,
  queryV4NFTPositions,
  V4_POSITION_MANAGER_ADDRESS,
  POSITION_MANAGER_ABI_V4,
  getV4PositionById
} from '../services/uniswapService';
import { getUserPositionsWithDetails } from '../services/subgraphService';

// 授权状态缓存
const allowanceCache = {
  data: {},
  expiry: 5 * 60 * 1000, // 5分钟过期
  
  async check(tokenAddress, owner, spender, provider) {
    const key = `${tokenAddress}_${owner}_${spender}`;
    const now = Date.now();
    
    if (this.data[key] && now - this.data[key].timestamp < this.expiry) {
      return this.data[key].allowance;
    }
    
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const allowance = await tokenContract.allowance(owner, spender);
    
    this.data[key] = {
      allowance,
      timestamp: now
    };
    
    return allowance;
  }
};

// 修改 OKX 相关配置
const OKX_CONFIG = {
  ROUTER: '0x9b9efa5Efa731EA9Bbb0369E91fA17Abf249CFD4',  // 更新为正确的路由地址
  APPROVE_ROUTER: '0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6',
  ADAPTERS: {
    PANCAKESWAP: '0x52f00F202A941f9B969690460f09A8853b889ea9',
    BISWAP: '0x6BE6A437A1172e6C220246eCB3A92a45AF9f0Cbc'
  }
};

// 更新合约地址和 ABI
const CONTRACTS = {
  POOL_MANAGER: UNICHAIN_CONFIG.pool_manager, // Uniswap V4 Pool Manager
  HOOKS: UNICHAIN_CONFIG.hooks_address      // Hooks地址
};

// 添加工厂合约 ABI
const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

const POSITION_MANAGER_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)',
  'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function decreaseLiquidity(tuple(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, uint256 deadline)) external payable returns (uint256 amount0, uint256 amount1)',
  'function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Requested, uint128 amount1Requested)) external payable returns (uint128 amount0, uint128 amount1)',
  'function multicall(bytes[] data) external payable returns (bytes[] results)',
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
];

const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function feeGrowthGlobal0X128() external view returns (uint256)',
  'function feeGrowthGlobal1X128() external view returns (uint256)',
  'function liquidity() external view returns (uint128)',
  'function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)'
];

const ERC20_ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function name() external view returns (string)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)'
];

// const UNICHAIN_CHAIN_ID = 130; // 暂时不使用，但保留以备将来需要

// 修改 tick 到价格的转换函数
const tickToPrice = (tick) => {
  if (tick === null || tick === undefined) return 0;
  try {
    // 将 tick 转换为数字
    const tickNum = Number(tick);
    
    // 检查 tick 是否在合理范围内
    if (Math.abs(tickNum) > 887272) {
      // 如果 tick 超出范围，使用 BigNumber 计算
      const value = ethers.toBigInt(tickNum);
      const base = ethers.toBigInt(1001); // 1.0001 * 10000
      const exp = value / ethers.toBigInt(1);
      
      let result;
      if (exp >= 0) {
        result = base ** (exp / ethers.toBigInt(10000));
      } else {
        result = ethers.toBigInt(1) / (base ** (-exp / ethers.toBigInt(10000)));
      }
      
      return Number(result) / 10000;
    }
    
    // 对于正常范围的 tick，使用标准计算
    return Math.pow(1.0001, tickNum);
  } catch (error) {
    console.error('Error calculating price from tick:', {
      tick,
      error: error.message
    });
    return 0;
  }
};

// 添加价格格式化函数
const formatPriceString = (price) => {
  if (!price || isNaN(price)) return '0';
  
  try {
    // 处理非常小的数字
    if (price < 0.0001) {
      return price.toExponential(4);
    }
    // 处理非常大的数字
    if (price > 10000) {
      return price.toExponential(4);
    }
    // 处理一般数字
    if (price < 1) {
      return price.toPrecision(4);
    }
    // 处理整数部分的数字
  return price.toPrecision(6);
  } catch (error) {
    console.error('Error formatting price:', error);
    return '0';
  }
};

// 检查池子是否存在
const checkPoolExists = async (poolAddress, provider) => {
  try {
    if (!ethers.isAddress(poolAddress)) {
      return false;
    }

    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const slot0 = await pool.slot0();
    return slot0 && typeof slot0.tick !== 'undefined';
  } catch (error) {
    return false;
  }
};

// 修改 getCurrentTick 函数
const getCurrentTick = async (poolAddress, provider) => {
  try {
    if (!poolAddress) {
      throw new Error('poolAddress is required');
    }

    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const slot0 = await pool.slot0();
    
    if (!slot0 || typeof slot0.tick === 'undefined') {
      throw new Error('Invalid slot0 result');
    }
    return Number(slot0.tick);
  } catch (error) {
    console.error('getCurrentTick error:', error);
    return null;
  }
};

// 添加Unichain RPC节点
const UNICHAIN_RPC_ENDPOINTS = [
  'https://mainnet.unichain.org',
  'https://unichain.api.onfinality.io/public',
  'https://unichain-rpc.publicnode.com',
  'https://unichain.drpc.org'
];

// 修改 getWorkingProvider 函数
const getWorkingProvider = async (forceNew = false) => {
  const maxRetries = UNICHAIN_RPC_ENDPOINTS.length;
  let lastError;
  let attempts = 0;

  // 随机打乱RPC节点顺序
  const shuffledEndpoints = [...UNICHAIN_RPC_ENDPOINTS]
    .sort(() => Math.random() - 0.5);

  for (const rpcUrl of shuffledEndpoints) {
    attempts++;
    try {
      console.log(`尝试连接RPC节点 (${attempts}/${maxRetries}): ${rpcUrl}`);
      
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // 测试连接
      await provider.getBlockNumber();
      
      console.log(`✅ 成功连接到RPC节点: ${rpcUrl}`);
      return provider;
    } catch (error) {
      console.warn(`❌ RPC节点连接失败 (${rpcUrl}):`, error.message);
      lastError = error;
      
      // 如果是最后一次尝试，等待一段时间再重试
      if (attempts === maxRetries) {
        console.log('所有RPC节点都连接失败，等待5秒后重试...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts = 0; // 重置尝试次数，继续尝试
      }
    }
  }

  throw new Error(`无法连接到任何RPC节点: ${lastError?.message}`);
};

// 修改 RPC 请求限制器
const RPC_RATE_LIMIT = {
  requests: {},
  windowMs: 1000,  // 1秒窗口
  maxRequests: 5,  // 每个节点每1秒最多5个请求
  cleanupInterval: null,
  
  init() {
    // 定期清理过期的请求记录
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        Object.keys(this.requests).forEach(rpcUrl => {
          this.requests[rpcUrl] = this.requests[rpcUrl].filter(time => 
            time > now - this.windowMs
          );
        });
      }, this.windowMs);
    }
  },
  
  canMakeRequest(rpcUrl) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.requests[rpcUrl]) {
      this.requests[rpcUrl] = [];
    }
    
    // 清理过期的请求记录
    this.requests[rpcUrl] = this.requests[rpcUrl].filter(time => time > windowStart);
    
    // 检查是否超出限制
    if (this.requests[rpcUrl].length >= this.maxRequests) {
      return false;
    }
    
    // 记录新请求
    this.requests[rpcUrl].push(now);
    return true;
  },
  
  async waitForAvailability(rpcUrl) {
    let attempts = 0;
    const maxAttempts = 5;
    const retryDelay = 1000; // 1秒
    
    while (attempts < maxAttempts) {
      if (this.canMakeRequest(rpcUrl)) {
        return true;
      }
      attempts++;
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
    return false;
  }
};

// 初始化 RPC 限制器
RPC_RATE_LIMIT.init();

// 添加 getPoolAddress 函数
const getPoolAddress = async (token0, token1, fee, provider) => {
  const maxRetries = 3;
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      if (!provider) {
        provider = await getWorkingProvider();
      }

      const factoryContract = new ethers.Contract(CONTRACTS.FACTORY, FACTORY_ABI, provider);
      const poolAddress = await factoryContract.getPool(token0, token1, fee);
      
      if (poolAddress === ethers.ZeroAddress) {
        console.log('池子不存在:', { token0, token1, fee });
        return null;
      }

      return poolAddress;
    } catch (error) {
      console.warn(`获取池子地址失败，重试 ${i + 1}/${maxRetries}:`, error);
      lastError = error;
      
      // 如果是配额超限或连接错误，尝试切换到新的 RPC 节点
      if (error.message.includes('quota') || 
          error.message.includes('rate limit') ||
          error.message.includes('connection') ||
          error.message.includes('network') ||
          error.message.includes('timeout')) {
        try {
          provider = await getWorkingProvider(true); // 强制获取新的 provider
          continue;
        } catch (e) {
          console.error('无法获取新的RPC节点:', e);
        }
      }
      
      // 等待时间随重试次数增加
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  throw lastError;
};

// 添加 getClosedPool 和 saveClosedPool 函数
const getClosedPool = (walletAddress) => {
  try {
    const saved = localStorage.getItem(`closedPool_${walletAddress}`);
    if (!saved) return [];
    
    // 解析存储的数据，确保返回唯一的 TokenID 数组
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    
    // 确保数组中的元素都是唯一的字符串类型的 TokenID
    return [...new Set(parsed.map(id => id.toString()))];
  } catch (error) {
    console.error('加载已关闭池子列表失败:', error);
    return [];
  }
};

const saveClosedPool = (walletAddress, pool) => {
  try {
    // 确保数组中的元素都是唯一的字符串类型的 TokenID
    const uniquePool = [...new Set(pool.map(id => id.toString()))];
    localStorage.setItem(`closedPool_${walletAddress}`, JSON.stringify(uniquePool));
  } catch (error) {
    console.error('保存已关闭池子列表失败:', error);
  }
};

// 添加计算代币数量和价格的函数
const calculateTokenAmounts = async (position) => {
  try {
    // 获取当前 tick
    const currentTick = position.currentTick;
    // 从 position 对象中正确获取 tickLower 和 tickUpper
    const tickLower = Number(position.tickLower);
    const tickUpper = Number(position.tickUpper);
    
    // 验证 tick 值
    if (tickLower === undefined || tickUpper === undefined) {
      throw new Error('Invalid tick values');
    }

    // 计算价格
    const currentPrice = tickToPrice(currentTick);
    const lowerPrice = tickToPrice(tickLower);
    const upperPrice = tickToPrice(tickUpper);

    // 判断是否在区间内
    const isActive = currentTick >= tickLower && currentTick <= tickUpper;

    // 获取代币数量
    const amount0 = position.tokensOwed0?.toString() || '0';
    const amount1 = position.tokensOwed1?.toString() || '0';
    
    // 格式化价格
    const formattedCurrentPrice = formatPriceString(currentPrice);
    const formattedLowerPrice = formatPriceString(lowerPrice);
    const formattedUpperPrice = formatPriceString(upperPrice);

    return {
      amount0,
      amount1,
      isActive,
      currentPrice: formattedCurrentPrice,
      lowerPrice: formattedLowerPrice,
      upperPrice: formattedUpperPrice
    };
  } catch (error) {
    console.error('计算代币数量和价格信息时出错:', error);
    return { 
      amount0: '0', 
      amount1: '0', 
      isActive: false,
      currentPrice: '0',
      lowerPrice: '0',
      upperPrice: '0'
    };
  }
};

// 添加 positions 缓存相关函数
const POSITIONS_CACHE_KEY = 'lpPositionsCache_';
const POSITIONS_CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟过期

const getPositionsCache = (walletAddress) => {
  try {
    const cached = localStorage.getItem(POSITIONS_CACHE_KEY + walletAddress);
    if (!cached) return null;

    const { positions, timestamp } = JSON.parse(cached);
    
    // 检查缓存是否过期
    if (Date.now() - timestamp > POSITIONS_CACHE_EXPIRY) {
      localStorage.removeItem(POSITIONS_CACHE_KEY + walletAddress);
      return null;
    }

    // 将字符串转回对象
    const deserializedPositions = positions.map(pos => {
      if (!pos) {
        console.warn('发现无效的缓存position对象，跳过');
        return null;
      }

      try {
        return {
          tokenId: pos.tokenId,
          token0: pos.position.token0,
          token1: pos.position.token1,
          fee: pos.position.fee,
          tickLower: Number(pos.position.tickLower),
          tickUpper: Number(pos.position.tickUpper),
          liquidity: pos.position.liquidity,
          feesEarned0: pos.position.tokensOwed0,
          feesEarned1: pos.position.tokensOwed1,
          token0Symbol: pos.token0Symbol,
          token1Symbol: pos.token1Symbol,
          token0Name: pos.token0Name,
          token1Name: pos.token1Name,
          token0Decimals: Number(pos.token0Decimals),
          token1Decimals: Number(pos.token1Decimals),
          currentTick: Number(pos.currentTick),
          isActive: pos.isActive,
          currentPrice: pos.currentPrice,
          lowerPrice: pos.lowerPrice,
          upperPrice: pos.upperPrice,
          poolAddress: pos.poolAddress,
          poolLiquidity: pos.poolLiquidity,
          historicalPrice: pos.historicalPrice || pos.currentPrice,
          lastPriceUpdateTime: pos.lastPriceUpdateTime || Date.now()
        };
      } catch (error) {
        console.warn(`反序列化position对象失败 (TokenID: ${pos.tokenId}):`, error);
        return null;
      }
    }).filter(Boolean); // 过滤掉null值

    console.log('从缓存加载positions成功，数量:', deserializedPositions.length);
    return deserializedPositions;
  } catch (error) {
    console.error('加载positions缓存失败:', error);
    return null;
  }
};

const savePositionsCache = (walletAddress, positions) => {
  try {
    if (!Array.isArray(positions)) {
      console.warn('positions不是数组，跳过缓存');
      return;
    }

    // 在缓存之前转换 BigInt 为字符串
    const serializablePositions = positions.map(pos => {
      if (!pos) {
        console.warn('发现无效的position对象，跳过');
        return null;
      }

      try {
        // 构造符合格式的position对象
        const positionObj = {
          tokenId: pos.tokenId?.toString() || '',
          position: {
            token0: pos.token0 || '',
            token1: pos.token1 || '',
            fee: pos.fee?.toString() || '0',
            tickLower: pos.tickLower?.toString() || '0',
            tickUpper: pos.tickUpper?.toString() || '0',
            liquidity: pos.liquidity?.toString() || '0',
            tokensOwed0: pos.feesEarned0?.toString() || '0',
            tokensOwed1: pos.feesEarned1?.toString() || '0'
          },
          token0Symbol: pos.token0Symbol || '',
          token1Symbol: pos.token1Symbol || '',
          token0Name: pos.token0Name || '',
          token1Name: pos.token1Name || '',
          token0Decimals: pos.token0Decimals?.toString() || '18',
          token1Decimals: pos.token1Decimals?.toString() || '18',
          currentTick: pos.currentTick?.toString() || '0',
          isActive: pos.isActive || false,
          currentPrice: pos.currentPrice || '0',
          lowerPrice: pos.lowerPrice || '0',
          upperPrice: pos.upperPrice || '0',
          poolAddress: pos.poolAddress || '',
          poolLiquidity: pos.poolLiquidity?.toString() || '0',
          historicalPrice: pos.historicalPrice || pos.currentPrice || '0',
          lastPriceUpdateTime: pos.lastPriceUpdateTime || Date.now()
        };

        return positionObj;
      } catch (error) {
        console.warn(`序列化position对象失败 (TokenID: ${pos.tokenId}):`, error);
        return null;
      }
    }).filter(Boolean);

    const cache = {
      positions: serializablePositions,
      timestamp: Date.now()
    };

    localStorage.setItem(POSITIONS_CACHE_KEY + walletAddress, JSON.stringify(cache));
    console.log('positions缓存保存成功，数量:', serializablePositions.length);
  } catch (error) {
    console.error('保存positions缓存失败:', error);
  }
};

// 添加 fetchSinglePosition 函数
const fetchSinglePosition = async (tokenId, provider, closedPool) => {
  try {
    // 检查是否在已关闭的池子列表中
    if (closedPool.includes(tokenId.toString())) {
      return null;
    }

    const positionManager = new ethers.Contract(
      CONTRACTS.POSITION_MANAGER,
      POSITION_MANAGER_ABI,
      provider
    );

    // 获取position信息
    const position = await positionManager.positions(tokenId);
    
    if (position.liquidity.toString() === '0') {
            return null;
          }

    // 获取代币信息
    const token0Contract = new ethers.Contract(position.token0, ERC20_ABI, provider);
    const token1Contract = new ethers.Contract(position.token1, ERC20_ABI, provider);

    const [
      token0Symbol,
      token0Name,
      token0Decimals,
      token1Symbol,
      token1Name,
      token1Decimals
    ] = await Promise.all([
      token0Contract.symbol(),
      token0Contract.name(),
      token0Contract.decimals(),
      token1Contract.symbol(),
      token1Contract.name(),
      token1Contract.decimals()
    ]);

    // 获取池子信息
    const poolAddress = await getPoolAddress(position.token0, position.token1, position.fee, provider);
          if (!poolAddress) {
            return null;
          }

    const poolExists = await checkPoolExists(poolAddress, provider);
          if (!poolExists) {
            return null;
          }

    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);
          const [fetchedTick, totalPoolLiquidity] = await Promise.all([
      getCurrentTick(poolAddress, provider),
            poolContract.liquidity()
          ]);
          
          if (fetchedTick === null) {
            return null;
          }

          const {
            amount0,
            amount1,
            isActive,
            currentPrice,
            lowerPrice,
            upperPrice
          } = await calculateTokenAmounts({
            ...position,
            currentTick: fetchedTick,
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
            poolAddress
          });

    const newPosition = {
      tokenId: tokenId.toString(),
      token0: position.token0,
      token1: position.token1,
      token0Symbol,
      token1Symbol,
      token0Name,
      token1Name,
      token0Decimals,
      token1Decimals,
      amount0,
      amount1,
      fee: position.fee,
      tickLower: position.tickLower,
      tickUpper: position.tickUpper,
      currentTick: fetchedTick,
      liquidity: position.liquidity.toString(),
      isActive,
      currentPrice,
      lowerPrice,
      upperPrice,
      poolAddress,
      poolLiquidity: totalPoolLiquidity.toString(),
      feesEarned0: position.tokensOwed0.toString(),
      feesEarned1: position.tokensOwed1.toString(),
      historicalPrice: currentPrice, // 初始时设置为当前价格
      lastPriceUpdateTime: Date.now() // 添加最后更新时间
    };

    return newPosition;
  } catch (error) {
    console.error('获取单个LP仓位信息失败:', error);
    return null;
  }
};

// 修改检查和授权代币的函数
const checkAndApproveToken = async (tokenAddress, amount, wallet) => {
  try {
    console.log('检查代币授权状态...');
    
    const allowance = await allowanceCache.check(
      tokenAddress,
      wallet.address,
      OKX_CONFIG.APPROVE_ROUTER,
      wallet
    );
    
    if (allowance >= amount) {
      console.log('代币已有足够授权');
      return true;
    }
    
    console.log('需要新的授权，准备发送授权交易...');
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(
      OKX_CONFIG.APPROVE_ROUTER,
      ethers.MaxUint256,
      { 
        gasLimit: 100000,
        gasPrice: ethers.parseUnits('0.1', 'gwei')
      }
    );
    
    console.log('授权交易已发送:', approveTx.hash);
    const receipt = await approveTx.wait();
    
    if (receipt.status === 1) {
      console.log('授权交易成功确认');
      return true;
    } else {
      console.error('授权交易失败');
      return false;
    }
  } catch (error) {
    console.error('授权过程出错:', error);
    return false;
  }
};

function LPPositions({ walletAddress, privateKey }) {
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { 
    isOpen: isHistoryOpen, 
    onOpen: onHistoryOpen, 
    onClose: onHistoryClose 
  } = useDisclosure();

  // 添加自动刷新间隔配置
  const AUTO_REFRESH_INTERVAL = 15 * 1000; // 15秒刷新一次
  const MIN_MANUAL_REFRESH_INTERVAL = 5 * 1000; // 手动刷新最小间隔5秒

  // 添加最后刷新时间状态
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(true);

  // 添加状态变量
  const [positions, setPositions] = useState(() => {
    const cached = getPositionsCache(walletAddress);
    return cached || [];
  });
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [removingLiquidity, setRemovingLiquidity] = useState(false);
  const [monitoringStates, setMonitoringStates] = useState(() => {
    try {
      const saved = localStorage.getItem(`monitoringStates_${walletAddress}`);
      if (!saved) {
        const allEnabled = {};
        positions.forEach(pos => {
          allEnabled[pos.tokenId] = true;
        });
        return allEnabled;
      }
      const parsed = JSON.parse(saved);
      positions.forEach(pos => {
        if (parsed[pos.tokenId] === undefined) {
          parsed[pos.tokenId] = true;
        }
      });
      return parsed;
    } catch {
      const allEnabled = {};
      positions.forEach(pos => {
        allEnabled[pos.tokenId] = true;
      });
      return allEnabled;
    }
  });
  const [isMonitoringActive] = useState(true);
  const [processedPositions, setProcessedPositions] = useState(new Set());
  const [closedPool, setClosedPool] = useState(() => getClosedPool(walletAddress));
  const [manualNFTId, setManualNFTId] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 添加策略状态
  const [strategyStates, setStrategyStates] = useState(() => {
    try {
      const saved = localStorage.getItem(`strategies_${walletAddress}`);
      if (!saved) {
        const defaultStates = {};
        positions.forEach(pos => {
          defaultStates[pos.tokenId] = {
            upperBoundRebalance: true,
            lowerBoundWithdraw: true,
            priceDropWithdraw: false,
            priceDropThreshold: 5
          };
        });
        return defaultStates;
      }
      return JSON.parse(saved);
    } catch {
      return {};
    }
  });

  // 添加交易查询函数
  const checkTransactionStatus = useCallback(async (txHash, provider, maxAttempts = 5) => {
    console.log(`开始查询交易状态: ${txHash}`);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          console.log(`交易状态查询成功:`, {
            status: receipt.status,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed.toString()
          });
          return receipt;
        }
        console.log(`第 ${i + 1}/${maxAttempts} 次查询: 交易尚未确认，等待5秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error(`查询交易状态出错 (尝试 ${i + 1}/${maxAttempts}):`, error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    return null;
  }, []);

  // 修改handleTokenSwap函数
  const handleTokenSwap = useCallback(async (fromTokenAddress, toTokenAddress, amount, isRebalancing) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 5000; // 5秒延迟

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🚀 开始执行Unichain链代币交换... (第 ${attempt}/${MAX_RETRIES} 次尝试)`);

        const provider = await getWorkingProvider();
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // 1. 检查授权
        const isApproved = await checkAllowance({
          tokenAddress: fromTokenAddress,
          owner: wallet.address,
          spender: UNICHAIN_CONFIG.uniswap_router,
          amount: ethers.toBigInt(amount),
          provider
        });

        if (!isApproved) {
          console.log('需要新的授权，准备发送授权交易...');
          const approveTx = await approveToken({
            tokenAddress: fromTokenAddress,
            spender: UNICHAIN_CONFIG.uniswap_router,
            wallet
          });
          await approveTx.wait();
          console.log('授权成功');
        }

        // 2. 获取交换路由
        console.log('📊 获取交换交易数据...');
        const swapTxData = await getSwapRoute({
          fromTokenAddress,
          toTokenAddress,
          amount: amount.toString(),
          userWalletAddress: walletAddress,
          slippage: '0.005'
        });

        if (!swapTxData || !swapTxData.to || !swapTxData.data) {
          throw new Error('获取交换路由失败');
        }

        // 3. 发送交易
        const tx = {
          to: swapTxData.to,
          data: swapTxData.data,
          value: swapTxData.value || '0',
          gasLimit: 1000000,
          gasPrice: await provider.getFeeData().then(p => p.gasPrice)
        };
        
        const sentTx = await wallet.sendTransaction(tx);
        console.log('📡 交易已发送:', sentTx.hash);
        
        toast({
          title: '交易已发送',
          description: `交易哈希: ${sentTx.hash}`,
          status: 'info',
          duration: 5000,
          isClosable: true,
        });

        console.log('⏳ 等待交易确认...');
        const receipt = await sentTx.wait();

        if (receipt.status !== 1) {
          throw new Error('交换交易失败');
        }

        // ... (rest of the logic to parse receipt and return receivedAmount)

        console.log('✅ 交换交易成功');
        return { success: true, receivedAmount: ethers.toBigInt(0) /* Placeholder */ };

      } catch (error) {
        console.error(`❌ 交换执行失败 (第 ${attempt}/${MAX_RETRIES} 次尝试):`, error);
        if (attempt === MAX_RETRIES) {
          toast({
            title: isRebalancing ? "重组交易失败" : "换成USDT失败",
            description: `${error.message} (已重试${MAX_RETRIES}次)`,
            status: "error",
            duration: 5000,
            isClosable: true,
          });
          return { success: false, receivedAmount: ethers.toBigInt(0) };
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
      }
    }

    return { success: false, receivedAmount: ethers.toBigInt(0) };
  }, [privateKey, walletAddress, toast]); // 移除了不必要的checkTransactionStatus依赖

  // 修改 saveStrategyStates 函数，使用 useCallback 包装
  const saveStrategyStates = useCallback((walletAddress, states) => {
    try {
      localStorage.setItem(`strategies_${walletAddress}`, JSON.stringify(states));
    } catch (error) {
      console.error('保存策略状态失败:', error);
    }
  }, []); // 没有外部依赖

  // 定义 updatePositions 函数
  const updatePositions = useCallback((newPositions) => {
    try {
      console.log('更新positions数量:', newPositions.length);

      // 验证positions数据
      const validPositions = newPositions.filter(pos => {
        if (!pos || !pos.tokenId) {
          console.warn('发现无效的position对象');
          return false;
        }
        return true;
      });

      // 确保每个position都有必要的字段
      const processedPositions = validPositions.map(pos => {
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        
        // 从缓存中获取之前的position数据
        const prevPosition = positions.find(p => p.tokenId === pos.tokenId);
        
        // 如果是新position，使用当前价格作为历史价格
        if (!prevPosition) {
          return {
            ...pos,
            historicalPrice: pos.currentPrice,
            lastPriceUpdateTime: now
          };
        }
        
        // 如果已经过了5分钟，更新历史价格
        if (!prevPosition.lastPriceUpdateTime || (now - prevPosition.lastPriceUpdateTime) >= fiveMinutes) {
          console.log('检测到需要更新历史价格:', {
            tokenId: pos.tokenId,
            token0Symbol: pos.token0Symbol,
            token1Symbol: pos.token1Symbol,
            currentTime: new Date(now).toLocaleString(),
            lastUpdateTime: prevPosition.lastPriceUpdateTime ? new Date(prevPosition.lastPriceUpdateTime).toLocaleString() : 'never',
            timeSinceLastUpdate: prevPosition.lastPriceUpdateTime ? `${Math.floor((now - prevPosition.lastPriceUpdateTime) / 1000 / 60)}分钟` : 'N/A',
            oldPrice: prevPosition.historicalPrice,
            newPrice: pos.currentPrice
          });
            
          return {
            ...pos,
            historicalPrice: pos.currentPrice,  // 直接更新为当前价格
            lastPriceUpdateTime: now
          };
        }
        
        // 如果不到5分钟，保持原有的历史价格和更新时间
        return {
          ...pos,
          historicalPrice: prevPosition.historicalPrice || pos.currentPrice,
          lastPriceUpdateTime: prevPosition.lastPriceUpdateTime
        };
      });

      console.log('处理后的positions数量:', processedPositions.length, '第一个position示例:', 
        processedPositions[0] ? {
          tokenId: processedPositions[0].tokenId,
          token0Symbol: processedPositions[0].token0Symbol,
          token1Symbol: processedPositions[0].token1Symbol,
          isActive: processedPositions[0].isActive,
          currentPrice: processedPositions[0].currentPrice,
          historicalPrice: processedPositions[0].historicalPrice,
          lastPriceUpdateTime: new Date(processedPositions[0].lastPriceUpdateTime).toLocaleString()
        } : null
      );

      // 更新状态
      setPositions(processedPositions);
      
      // 更新缓存
      savePositionsCache(walletAddress, processedPositions);
    } catch (error) {
      console.error('处理positions时出错:', error);
    }
  }, [walletAddress, positions]);

  // 修改策略状态初始化
  const [strategies, setStrategies] = useState(() => {
    try {
      // 从localStorage获取状态
      const saved = localStorage.getItem(`strategies_${walletAddress}`);
      if (!saved) {
        // 如果没有保存的状态，为所有position创建默认开启的策略
        const defaultStrategies = {};
        positions.forEach(pos => {
          defaultStrategies[pos.tokenId] = {
            upperBoundRebalance: true,
            lowerBoundWithdraw: true,
            priceDropWithdraw: false,
            priceDropThreshold: 5
          };
        });
        return defaultStrategies;
      }
      const parsed = JSON.parse(saved);
      // 确保新的position也被设置为开启状态
      positions.forEach(pos => {
        if (!parsed[pos.tokenId]) {
          parsed[pos.tokenId] = {
            upperBoundRebalance: true,
            lowerBoundWithdraw: true,
            priceDropWithdraw: false,
            priceDropThreshold: 5
          };
        }
      });
      return parsed;
    } catch {
      // 如果出错，返回全部开启的状态
      const defaultStrategies = {};
      positions.forEach(pos => {
        defaultStrategies[pos.tokenId] = {
          upperBoundRebalance: true,
          lowerBoundWithdraw: true,
          priceDropWithdraw: false,
          priceDropThreshold: 5
        };
      });
      return defaultStrategies;
    }
  });

  // 修改 fetchPositions 函数为V4版本
  const fetchPositions = useCallback(async (force = false) => {
    console.log("========== fetchPositions 开始执行 ==========");
    
    // 强制刷新时，先重置loading状态
    if (force) {
      console.log("强制刷新，重置loading状态");
      setLoading(false);
    }
    
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;

    // 如果不是强制刷新，检查是否满足刷新间隔
    if (!force && timeSinceLastRefresh < MIN_MANUAL_REFRESH_INTERVAL) {
      const remainingTime = Math.ceil((MIN_MANUAL_REFRESH_INTERVAL - timeSinceLastRefresh) / 1000);
        toast({
        title: "刷新太频繁",
        description: `请等待 ${remainingTime} 秒后再试`,
        status: "warning",
        duration: 3000,
          isClosable: true,
        });
      console.log("刷新间隔过短，拒绝刷新");
      return;
    }

    if (loading || !walletAddress) {
      console.log("已经在加载中或钱包地址为空，拒绝刷新", { loading, walletAddress });
      return;
    }
    
    // 添加30秒超时，防止无限加载
    const timeoutId = setTimeout(() => {
      console.log("获取LP仓位超时，自动重置loading状态");
      setLoading(false);
      toast({
        title: "查询超时",
        description: "获取LP仓位超时，请稍后重试",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    }, 30000); // 30秒超时
    
    console.log("设置loading=true，开始查询LP仓位...");
    setLoading(true);
    try {
      console.log("尝试获取provider...");
          const provider = await getWorkingProvider();
      console.log("成功获取provider:", provider);
      
      try {
        console.log("尝试连接Uniswap V4 PositionManager合约:", V4_POSITION_MANAGER_ADDRESS);
        
        // 尝试调用合约方法前，先检查合约是否存在
        console.log("检查合约是否存在...");
        const code = await provider.getCode(V4_POSITION_MANAGER_ADDRESS);
        console.log("合约代码:", code.substring(0, 20) + "..." + (code.length > 40 ? code.substring(code.length - 20) : ""));
        
        if (code === "0x" || code === "") {
          console.warn("❌ PositionManager合约在该网络上不存在");
          // 显示一个更友好的消息
          toast({
            title: "提示",
            description: "Unichain网络上的Uniswap V4 NFT LP功能尚未完全支持",
            status: "info",
            duration: 5000,
            isClosable: true,
          });
        setPositions([]);
          clearTimeout(timeoutId);
          setLoading(false);
          console.log("合约不存在，退出查询");
                            return;
                          }

        console.log("✅ 合约代码存在，长度:", code.length);
        
        // 打印连接的网络信息，有助于调试
        try {
          const network = await provider.getNetwork();
          console.log("当前连接网络:", {
            chainId: network.chainId,
            name: network.name || "未知"
          });
        } catch (networkError) {
          console.error("获取网络信息失败:", networkError);
        }
        
        // 简化查询逻辑 - 不再尝试使用可能失败的balanceOf和tokenOfOwnerByIndex方法
        console.log("开始获取Uniswap V4 NFT LP仓位...");
        
        // 尝试读取本地存储中的已知tokenIds
        let knownTokenIds = [];
        try {
          const savedTokenIds = localStorage.getItem(`known_nft_ids_${walletAddress}`);
          if (savedTokenIds) {
            knownTokenIds = JSON.parse(savedTokenIds);
            console.log(`从本地存储加载到 ${knownTokenIds.length} 个已知的NFT ID`);
          }
        } catch (storageError) {
          console.error("读取本地存储的NFT IDs失败:", storageError);
        }
        
        // 收集位置信息
        const positionPromises = [];
        const processedTokenIds = new Set();
        
        // 为每个已知的tokenId获取位置信息
        if (knownTokenIds.length > 0) {
          console.log(`尝试获取 ${knownTokenIds.length} 个已知NFT的详情...`);
          for (const tokenId of knownTokenIds) {
            if (processedTokenIds.has(tokenId)) continue;
            processedTokenIds.add(tokenId);
            positionPromises.push(getV4PositionById(tokenId, provider));
          }
        }
        
        // 执行所有Promise并过滤失败的结果
        console.log(`等待 ${positionPromises.length} 个查询完成...`);
        const positions = (await Promise.all(positionPromises)).filter(Boolean);
        console.log(`成功获取 ${positions.length} 个LP头寸信息`);
        
        // 如果没有找到任何位置，显示提示
        if (positions.length === 0) {
          console.log("未找到Uniswap V4 LP仓位");
          toast({
            title: "没有找到LP仓位",
            description: "您可以尝试手动输入NFT ID查询特定LP仓位",
            status: "info",
            duration: 5000,
            isClosable: true,
          });
          setPositions([]);
          clearTimeout(timeoutId);
          setLoading(false);
          return;
        }
        
        // 转换为组件使用的格式
        const formattedPositions = positions.map(pos => {
          // 计算价格（使用tick近似）
          const currentTick = Number(pos.tickLower) + 
            (Number(pos.tickUpper) - Number(pos.tickLower)) / 2; // 使用范围中点作为近似
          const estimatedCurrentPrice = tickToPrice(currentTick);
          
          const lowerPrice = tickToPrice(Number(pos.tickLower));
          const upperPrice = tickToPrice(Number(pos.tickUpper));
          
          return {
            tokenId: pos.tokenId,
            token0: pos.token0,
            token1: pos.token1,
            fee: pos.fee,
            tickLower: Number(pos.tickLower),
            tickUpper: Number(pos.tickUpper),
            liquidity: pos.liquidity,
            currentTick: currentTick,
            amount0: pos.tokensOwed0,
            amount1: pos.tokensOwed1,
            token0Symbol: pos.token0Symbol,
            token1Symbol: pos.token1Symbol,
            token0Decimals: pos.token0Decimals,
            token1Decimals: pos.token1Decimals,
            isActive: true, // 假设NFT头寸总是活跃的
            currentPrice: formatPriceString(estimatedCurrentPrice),
            lowerPrice: formatPriceString(lowerPrice),
            upperPrice: formatPriceString(upperPrice),
            feesEarned0: pos.tokensOwed0,
            feesEarned1: pos.tokensOwed1,
            historicalPrice: formatPriceString(estimatedCurrentPrice),
            lastPriceUpdateTime: now
          };
        });
        
        // 保存成功查询的tokenIds到本地存储
        try {
          const successIds = formattedPositions.map(pos => pos.tokenId);
          localStorage.setItem(`known_nft_ids_${walletAddress}`, JSON.stringify(successIds));
          console.log(`保存 ${successIds.length} 个NFT ID到本地存储`);
        } catch (saveError) {
          console.error("保存NFT IDs到本地存储失败:", saveError);
        }

        console.log("更新仓位列表...");
        // 更新仓位列表
        updatePositions(formattedPositions);
        console.log(`成功获取到${formattedPositions.length}个Uniswap V4 NFT LP仓位`);
        clearTimeout(timeoutId);
        setLoading(false);
      } catch (contractError) {
        console.error("PositionManager合约调用失败:", contractError);
        console.error("错误堆栈:", contractError.stack);
        
        // 提供更明确的错误信息
        toast({
          title: "提示",
          description: "Unichain网络上的Uniswap V4 LP功能尚未完全支持，我们正在适配中",
          status: "info",
          duration: 5000,
          isClosable: true,
        });
        
        // 设置空数组
        setPositions([]);
        clearTimeout(timeoutId);
        setLoading(false);
      }
      
      setLastRefreshTime(now);
                } catch (error) {
      console.error('获取LP仓位失败:', error);
      console.error('错误堆栈:', error.stack);
      toast({
        title: "获取失败",
        description: "无法获取LP仓位信息，请检查网络连接",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      clearTimeout(timeoutId);
    } finally {
      console.log("fetchPositions执行完成，清除超时计时器");
      clearTimeout(timeoutId);
      
      // 始终重置loading状态
      console.log("重置loading状态为false");
      setLoading(false);
      console.log("========== fetchPositions 执行结束 ==========");
    }
  }, [loading, walletAddress, updatePositions, toast, lastRefreshTime, MIN_MANUAL_REFRESH_INTERVAL]);
  
  // 临时函数：从poolId获取代币信息 (实际项目中应使用合约调用)
  const getTokenInfoFromPoolId = useCallback(async (poolId, provider) => {
    // 在实际项目中，您应该调用合约方法获取这些信息
    // 这里使用假数据进行演示
    
    // 为常用代币对创建映射
    const tokenPairs = {
      "ETH-USDT": {
        token0: UNICHAIN_TOKENS.NATIVE.address,
        token1: UNICHAIN_TOKENS.USDT.address,
        token0Symbol: "ETH",
        token1Symbol: "USDT",
        token0Decimals: 18,
        token1Decimals: 6,
        fee: 3000
      },
      "WBTC-ETH": {
        token0: UNICHAIN_TOKENS.WBTC.address,
        token1: UNICHAIN_TOKENS.NATIVE.address,
        token0Symbol: "WBTC",
        token1Symbol: "ETH",
        token0Decimals: 8,
        token1Decimals: 18,
        fee: 3000
      },
      "WBTC-USDT": {
        token0: UNICHAIN_TOKENS.WBTC.address,
        token1: UNICHAIN_TOKENS.USDT.address,
        token0Symbol: "WBTC",
        token1Symbol: "USDT",
        token0Decimals: 8,
        token1Decimals: 6,
        fee: 3000
      }
    };
    
    // 模拟随机选择一个代币对
    const pairs = Object.values(tokenPairs);
    const randomPair = pairs[Math.floor(Math.random() * pairs.length)];
    
    return {
      ...randomPair,
      amount0: (Math.random() * 10).toFixed(4),
      amount1: (Math.random() * 1000).toFixed(4)
    };
  }, []);

  const handleMonitoringChange = useCallback((tokenId, isEnabled) => {
    const newStates = {
      ...monitoringStates,
      [tokenId]: isEnabled
    };
    setMonitoringStates(newStates);
    // 保存到localStorage
    try {
      localStorage.setItem(`monitoringStates_${walletAddress}`, JSON.stringify(newStates));
    } catch (error) {
      console.error('保存监控状态失败:', error);
    }
  }, [monitoringStates, walletAddress]);

  // 修改 initializeStrategyState 函数
  const initializeStrategyState = useCallback((tokenId) => {
    const defaultState = {
      upperBoundRebalance: true,
      lowerBoundWithdraw: true,
      priceDropWithdraw: true, // 默认开启价格下跌撤池开关
      priceDropThreshold: 5 // 默认5%
    };
    
    // 首先从内存中的状态获取
    if (strategies[tokenId]) {
      return strategies[tokenId];
    }

    try {
      // 如果内存中没有，尝试从localStorage获取
      const saved = localStorage.getItem(`strategy_${walletAddress}_${tokenId}`);
      const loadedStrategy = saved ? JSON.parse(saved) : defaultState;
      
      // 更新内存中的状态
      setStrategies(prev => ({
        ...prev,
        [tokenId]: loadedStrategy
      }));
      
      return loadedStrategy;
    } catch {
      return defaultState;
    }
  }, [walletAddress, strategies]);

  // 修改 handleStrategyChange 函数
  const handleStrategyChange = useCallback((tokenId, strategyType, value) => {
    try {
      const currentStrategy = initializeStrategyState(tokenId);
      const newStrategy = {
        ...currentStrategy,
        [strategyType]: value
      };

      // 更新内存中的状态
      setStrategies(prev => ({
        ...prev,
        [tokenId]: newStrategy
      }));

      // 保存到localStorage
      localStorage.setItem(`strategy_${walletAddress}_${tokenId}`, JSON.stringify(newStrategy));
      localStorage.setItem(`strategies_${walletAddress}`, JSON.stringify({
        ...strategies,
        [tokenId]: newStrategy
      }));

      // 添加提示信息
      const strategyName = strategyType === 'upperBoundRebalance' ? '涨超区间自动重组' : '跌超区间自动撤池';
      const actionStatus = value ? '启用' : '关闭';
        toast({
        title: `${actionStatus}${strategyName}`,
        description: `TokenID ${tokenId} 的${strategyName}策略已${actionStatus}`,
        status: value ? 'success' : 'info',
        duration: 3000,
          isClosable: true,
        });
    } catch (error) {
      console.error('保存策略设置失败:', error);
      toast({
        title: "设置失败",
        description: "无法保存策略设置，请重试",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [walletAddress, initializeStrategyState, strategies, toast]);

  // 修改策略表格渲染函数
  const renderStrategyTable = (position) => {
    const strategy = initializeStrategyState(position.tokenId);
    return (
      <Table variant="simple" size="sm" border="1px" borderColor="gray.200">
        <Thead>
          <Tr>
            <Th>类型</Th>
            <Th>配置</Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr>
            <Td>涨超区间,自动重组</Td>
            <Td>
              <Switch
                colorScheme="green"
                isChecked={strategy.upperBoundRebalance}
                onChange={(e) => handleStrategyChange(position.tokenId, 'upperBoundRebalance', e.target.checked)}
                size="sm"
                sx={{
                  '& .chakra-switch__track': {
                    transition: 'background-color 0.3s ease',
                  },
                  '& .chakra-switch__thumb': {
                    transition: 'transform 0.3s ease',
                  }
                }}
              />
            </Td>
          </Tr>
          <Tr>
            <Td>跌超区间,自动撤池,卖出代币</Td>
            <Td>
              <Switch
                colorScheme="green"
                isChecked={strategy.lowerBoundWithdraw}
                onChange={(e) => handleStrategyChange(position.tokenId, 'lowerBoundWithdraw', e.target.checked)}
                size="sm"
                sx={{
                  '& .chakra-switch__track': {
                    transition: 'background-color 0.3s ease',
                  },
                  '& .chakra-switch__thumb': {
                    transition: 'transform 0.3s ease',
                  }
                }}
              />
            </Td>
          </Tr>
          <Tr>
            <Td>价格下跌撤池</Td>
            <Td>
              <HStack spacing={2}>
                <Switch
                  colorScheme="green"
                  isChecked={strategy.priceDropWithdraw}
                  onChange={(e) => handleStrategyChange(position.tokenId, 'priceDropWithdraw', e.target.checked)}
                  size="sm"
                  sx={{
                    '& .chakra-switch__track': {
                      transition: 'background-color 0.3s ease',
                    },
                    '& .chakra-switch__thumb': {
                      transition: 'transform 0.3s ease',
                    }
                  }}
                />
                                  <HStack spacing={2}>
                    <InputGroup size="sm" width="120px">
                      <InputLeftElement>
                        <IconButton
                          aria-label="减少阈值"
                          icon={<MinusIcon />}
                          size="xs"
                          onClick={() => {
                            if (!strategy.priceDropWithdraw) return;
                            const currentValue = parseFloat(position.tempPriceDropThreshold || strategy.priceDropThreshold);
                            if (!isNaN(currentValue) && currentValue > 0.01) {
                              // 使用 toFixed(2) 保留两位小数，避免精度问题
                              const newValue = Math.max(0.01, (currentValue - 0.01)).toFixed(2);
                              // 只更新临时值
                              setPositions(prev => {
                                const newPositions = [...prev];
                                const index = newPositions.findIndex(p => p.tokenId === position.tokenId);
                                if (index !== -1) {
                                  newPositions[index].tempPriceDropThreshold = newValue;
                                }
                                return newPositions;
                              });
                            }
                          }}
                          disabled={!strategy.priceDropWithdraw}
                          variant="outline"
                        />
                      </InputLeftElement>
                      <Input
                        pl="24px"
                        pr="24px"
                        textAlign="center"
                        value={position.tempPriceDropThreshold !== undefined ? position.tempPriceDropThreshold : strategy.priceDropThreshold}
                        onChange={(e) => {
                          const value = e.target.value;
                          // 允许数字和小数点
                          if (/^[0-9]*\.?[0-9]*$/.test(value)) {
                            // 只在本地更新显示值
                            setPositions(prev => {
                              const newPositions = [...prev];
                              const index = newPositions.findIndex(p => p.tokenId === position.tokenId);
                              if (index !== -1) {
                                newPositions[index].tempPriceDropThreshold = value;
                              }
                              return newPositions;
                            });
                          }
                        }}
                        placeholder="5"
                        disabled={!strategy.priceDropWithdraw}
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label="增加阈值"
                          icon={<AddIcon />}
                          size="xs"
                          onClick={() => {
                            if (!strategy.priceDropWithdraw) return;
                            const currentValue = parseFloat(position.tempPriceDropThreshold || strategy.priceDropThreshold);
                            if (!isNaN(currentValue)) {
                              // 使用 toFixed(2) 保留两位小数，避免精度问题
                              const newValue = (currentValue + 0.01).toFixed(2);
                              // 只更新临时值
                              setPositions(prev => {
                                const newPositions = [...prev];
                                const index = newPositions.findIndex(p => p.tokenId === position.tokenId);
                                if (index !== -1) {
                                  newPositions[index].tempPriceDropThreshold = newValue;
                                }
                                return newPositions;
                              });
                            }
                          }}
                          disabled={!strategy.priceDropWithdraw}
                          variant="outline"
                        />
                      </InputRightElement>
                    </InputGroup>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      onClick={() => {
                        const value = parseFloat(position.tempPriceDropThreshold);
                        if (!isNaN(value)) {
                          handleStrategyChange(position.tokenId, 'priceDropThreshold', Math.floor(value * 100) / 100);
                          toast({
                            title: "设置成功",
                            description: `价格下跌阈值已更新为 ${Math.floor(value * 100) / 100}%`,
                            status: "success",
                            duration: 2000,
                            isClosable: true,
                          });
                        }
                      }}
                      isDisabled={!strategy.priceDropWithdraw}
                    >
                      确认
                    </Button>
                  </HStack>
                <Text>%</Text>
              </HStack>
            </Td>
          </Tr>
        </Tbody>
      </Table>
    );
  };

  // 修改表格渲染逻辑
  const renderPositionsTable = () => {
    if (loading && positions.length === 0) {
      return (
        <Tr>
          <Td colSpan={6} textAlign="center" py={6}>
            <Spinner size="sm" speed="0.8s" emptyColor="gray.200" color="blue.500" />
          </Td>
        </Tr>
      );
    }

    if (positions.length === 0) {
      return (
        <Tr>
          <Td colSpan={6} textAlign="center" py={6}>
            <Text color="gray.500">暂无LP仓位</Text>
          </Td>
        </Tr>
      );
    }

    return positions.map((position) => {
      // 计算价格范围百分比
      const leftPercentage = ((Number(position.currentTick) - Number(position.tickLower)) / 10000 * 100).toFixed(2);
      const rightPercentage = ((Number(position.tickUpper) - Number(position.currentTick)) / 10000 * 100).toFixed(2);
      
      return (
        <Tr 
          key={position.tokenId}
          onClick={() => setSelectedPosition(position)}
          cursor="pointer"
          _hover={{ bg: "gray.50" }}
          bg={selectedPosition?.tokenId === position.tokenId ? "blue.50" : ""}
        >
          <Td minWidth="80px" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
            {position.tokenId}
          </Td>
          <Td minWidth="100px">
            <Tooltip label={`${position.token0Symbol}/${position.token1Symbol}`}>
              <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {position.token0Symbol}/{position.token1Symbol}
              </Text>
            </Tooltip>
          </Td>
          <Td minWidth="180px">
            <Tooltip label={`当前Tick: ${position.currentTick?.toString()}
最小Tick: ${position.tickLower?.toString()}
最大Tick: ${position.tickUpper?.toString()}
当前价格: ${position.currentPrice}
价格区间: ${position.lowerPrice} - ${position.upperPrice}`}>
              <Text fontSize="sm" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                {position.tickLower?.toString()} ~ {position.currentTick?.toString()} ~ {position.tickUpper?.toString()}
              </Text>
            </Tooltip>
          </Td>
          <Td minWidth="120px">
            <Tooltip label={`左边界距离: ${leftPercentage}%
右边界距离: ${rightPercentage}%
当前价格: ${position.currentPrice}
价格区间: ${position.lowerPrice} - ${position.upperPrice}
状态: ${position.isActive ? '价格在区间内' : '价格超出区间'}`}>
              <Box
                p={1}
                borderRadius="md"
                bg={position.isActive ? 'green.100' : 'red.100'}
                color={position.isActive ? 'green.800' : 'red.800'}
              >
                <Text overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
                  {leftPercentage}% ~ {rightPercentage}%
                </Text>
              </Box>
            </Tooltip>
          </Td>
          <Td minWidth="80px">
            <Switch
              colorScheme="green"
              isChecked={Boolean(monitoringStates[position.tokenId])}
              onChange={(e) => {
                e.stopPropagation();
                console.log('切换监控状态:', {
                  tokenId: position.tokenId,
                  currentState: monitoringStates[position.tokenId],
                  newState: e.target.checked,
                  allStates: monitoringStates
                });
                handleMonitoringChange(position.tokenId, e.target.checked);
              }}
              size="md"
            />
          </Td>
          <Td minWidth="80px">
            <Button
              size="sm"
              colorScheme="red"
              isLoading={removingLiquidity}
              onClick={(e) => {
                setSelectedPosition(position);
                onOpen();
                e.stopPropagation();
              }}
            >
              撤池
            </Button>
          </Td>
        </Tr>
      );
    });
  };

  // 修改 updateClosedPool 函数
  const updateClosedPool = useCallback((tokenId) => {
    setClosedPool(prev => {
      // 确保 tokenId 是字符串类型
      const tokenIdStr = tokenId.toString();
      // 如果已经存在该 TokenID，直接返回原数组
      if (prev.includes(tokenIdStr)) {
        return prev;
      }
      // 添加新的 TokenID
      const newPool = [...prev, tokenIdStr];
      // 保存到 localStorage
      saveClosedPool(walletAddress, newPool);
      return newPool;
    });
  }, [walletAddress]);

  // 修改获取历史记录的函数
  const getHistoryPositions = useCallback(async () => {
    try {
      console.log('开始获取历史记录, closedPool:', closedPool);
      if (!Array.isArray(closedPool) || closedPool.length === 0) {
        console.log('没有历史记录');
        return [];
      }

      // 确保 TokenID 唯一并按数值大小排序
      const sortedPositions = [...new Set(closedPool)]
        .map(tokenId => ({
          tokenId: tokenId.toString(),
          uniswapUrl: `https://app.uniswap.org/pools/${tokenId}?chain=mainnet` // Placeholder URL
        }))
        .sort((a, b) => parseInt(b.tokenId) - parseInt(a.tokenId))
        .slice(0, 20);

      return sortedPositions;
    } catch (error) {
      console.error('获取历史记录失败:', error);
      return [];
    }
  }, [closedPool]);

  // 处理查看历史记录
  const handleViewHistory = useCallback(async () => {
    console.log('点击查看历史记录');
    setLoadingHistory(true);
    try {
      const positions = await getHistoryPositions();
      console.log('加载到的历史记录:', positions);
      setHistoryPositions(positions);
      onHistoryOpen();
    } catch (error) {
      console.error('加载历史记录失败:', error);
      toast({
        title: "加载失败",
        description: "无法加载历史记录",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setLoadingHistory(false);
    }
  }, [getHistoryPositions, onHistoryOpen, toast]);

  // 清理历史记录
  const clearHistory = useCallback(() => {
    setClosedPool([]);
    localStorage.removeItem(`closedPool_${walletAddress}`);
    setHistoryPositions([]);
    onHistoryClose();
    toast({
      title: "清理完成",
      description: "已清理历史撤池记录",
      status: "success",
      duration: 3000,
      isClosable: true,
    });
  }, [walletAddress, toast, onHistoryClose]);

  // 添加查看历史记录的状态
  const [historyPositions, setHistoryPositions] = useState([]);

  // 添加V4移除流动性的函数
  const handleRemoveLiquidity = useCallback(async (position, event) => {
    if (event) {
      event.stopPropagation();
    }
    if (!position || !privateKey || removingLiquidity) {
      return;
    }
    if (closedPool.includes(position.tokenId.toString())) {
      return;
    }

    setRemovingLiquidity(true);
    try {
      const provider = await getWorkingProvider();
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // 创建V4 Position Manager合约实例
      const positionManager = new ethers.Contract(
        V4_POSITION_MANAGER_ADDRESS,
        POSITION_MANAGER_ABI_V4,
        wallet
      );

      // 准备移除流动性的参数
      const params = {
        tokenId: position.tokenId,
        liquidity: position.liquidity,
        amount0Min: 0,
        amount1Min: 0,
        deadline: Math.floor(Date.now() / 1000) + 3600 // 1小时后过期
      };

      const MAX_RETRIES = 3;
      const RETRY_DELAY = 5000; // 5秒延迟

      let receipt;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`📤 执行撤池操作... (第 ${attempt}/${MAX_RETRIES} 次尝试)`);
          
          // 发送decreaseLiquidity交易
          console.log("撤销流动性参数:", params);
          const decreaseLiquidityTx = await positionManager.decreaseLiquidity(params, {
            gasLimit: 500000
          });
          
          console.log(`⏳ 等待交易确认...`, decreaseLiquidityTx.hash);
          receipt = await decreaseLiquidityTx.wait();
          
          if (receipt.status === 0) {
            throw new Error('Transaction failed');
          }

          console.log('✅ 撤池交易成功确认!');
          break;
        } catch (error) {
          console.error(`❌ 撤池操作失败 (第 ${attempt}/${MAX_RETRIES} 次尝试):`, error);
          
          if (attempt === MAX_RETRIES) {
            throw new Error('撤池操作失败: ' + (error.message || '未知错误'));
          }

          // 如果是RPC错误，尝试切换节点
          if (error.message.includes('failed to fetch') || 
              error.message.includes('network error') ||
              error.message.includes('timeout')) {
            try {
              const newProvider = await getWorkingProvider(true);
              // 使用新的provider重新创建wallet
              const newWallet = new ethers.Wallet(privateKey, newProvider);
              wallet = newWallet; // 更新wallet
              continue;
            } catch (e) {
              console.error('无法获取新的RPC节点:', e);
            }
          }

          // 计算下一次重试的延迟时间（指数退避）
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
          console.log(`等待 ${delay/1000} 秒后进行第 ${attempt + 1} 次尝试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // 准备收集费用的参数
      const collectParams = {
          tokenId: position.tokenId,
        recipient: walletAddress,
        amount0Max: "0xffffffffffffffffffffffffffffffff",
        amount1Max: "0xffffffffffffffffffffffffffffffff"
      };
          
      console.log("收集费用参数:", collectParams);
      
      // 发送collect交易
      const collectTx = await positionManager.collect(collectParams, {
        gasLimit: 300000
      });
      
      console.log(`⏳ 等待收集费用交易确认...`, collectTx.hash);
      const collectReceipt = await collectTx.wait();
      
      if (collectReceipt.status === 0) {
        throw new Error('Collect transaction failed');
      }
      
      console.log('✅ 费用收集交易成功确认!');
      
      // 解析事件获取收集到的金额
      let amount0 = ethers.toBigInt(0);
      let amount1 = ethers.toBigInt(0);
      
      for (const log of collectReceipt.logs) {
        try {
          const collectEvent = positionManager.interface.parseLog(log);
          if (collectEvent && collectEvent.name === 'Collect') {
            amount0 = collectEvent.args.amount0;
            amount1 = collectEvent.args.amount1;
            break;
          }
                  } catch (e) {
          continue;
        }
      }
      
      console.log(`✅ 撤池操作完成! 获得代币数量:`, {
        token0: position.token0Symbol,
        amount0: ethers.formatUnits(amount0, position.token0Decimals),
        token1: position.token1Symbol,
        amount1: ethers.formatUnits(amount1, position.token1Decimals)
      });

      // 更新已关闭的池子列表
      updateClosedPool(position.tokenId);

      // 刷新仓位列表
      await fetchPositions(true);

      toast({
        title: "撤池成功",
        description: `已成功移除LP仓位并收集了相关代币`,
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      // 关闭弹窗
      onClose();
    } catch (error) {
      console.error('移除流动性失败:', error);
      
      // 提供更详细的错误信息
      let errorMessage = '移除流动性时发生错误';
      if (error.message.includes('failed to fetch')) {
        errorMessage = 'RPC节点连接失败，请稍后重试';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = '余额不足以支付gas费';
      } else if (error.message.includes('user rejected')) {
        errorMessage = '用户取消了交易';
      } else if (error.message.includes('nonce')) {
        errorMessage = '交易nonce错误，请刷新页面重试';
      }
      
      toast({
        title: "撤池失败",
        description: errorMessage,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setRemovingLiquidity(false);
    }
  }, [privateKey, removingLiquidity, updateClosedPool, fetchPositions, toast, 
    onClose, walletAddress, closedPool]);

  // 添加自动撤池的处理函数
  const handleAutoWithdraw = useCallback(async (position) => {
    // 检查是否已经处理过这个position
    if (processedPositions.has(position.tokenId)) {
      return;
    }
    if (closedPool.includes(position.tokenId.toString())) {
      return;
    }
    

    const strategy = initializeStrategyState(position.tokenId);
    const isMonitored = monitoringStates[position.tokenId];

    // 检查是否满足自动撤池条件：
    // 1. 监控开启
    // 2. 跌超区间策略开启
    // 3. 价格超出区间  ｜｜  价格下跌超过阈值
    // 4. 未被处理过
    const priceDrop = (position.currentPrice - position.historicalPrice) / position.historicalPrice * 100;
    if (isMonitored && strategy.lowerBoundWithdraw 
      && (!position.isActive || priceDrop >= strategy.priceDropThreshold)) {
      try {
        console.log(`开始自动撤池 TokenID: ${position.tokenId}`);
        await handleRemoveLiquidity(position);
        // 添加到已处理集合
        setProcessedPositions(prev => new Set([...prev, position.tokenId]));
      } catch (error) {
        console.error(`自动撤池失败 TokenID: ${position.tokenId}:`, error);
      }
    }
  }, [processedPositions, closedPool, monitoringStates, initializeStrategyState, handleRemoveLiquidity]);

  // 添加批量检查的函数
  const checkPositionsForAutoWithdraw = useCallback(() => {
    if (!isMonitoringActive) return;

    positions.forEach(position => {
      handleAutoWithdraw(position);
    });
  }, [positions, isMonitoringActive, handleAutoWithdraw]);

  // 添加自动检查的 useEffect
  useEffect(() => {
    // 初始检查
    checkPositionsForAutoWithdraw();

    // 设置定期检查
    const checkInterval = setInterval(() => {
      checkPositionsForAutoWithdraw();
    }, 15000); // 每15秒检查一次，与自动刷新间隔相同

    return () => {
      clearInterval(checkInterval);
    };
  }, [checkPositionsForAutoWithdraw]);

  // 添加自动刷新的 useEffect
  useEffect(() => {
    let refreshTimer;

    if (isAutoRefreshEnabled && walletAddress) {
      refreshTimer = setInterval(() => {
        fetchPositions(true); // 使用 force = true 跳过最小间隔检查
      }, AUTO_REFRESH_INTERVAL);
    }

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [isAutoRefreshEnabled, walletAddress, fetchPositions, AUTO_REFRESH_INTERVAL]);

  // 添加自动刷新开关的处理函数
  const handleAutoRefreshToggle = useCallback(() => {
    setIsAutoRefreshEnabled(prev => {
      const newState = !prev;
      toast({
        title: newState ? "自动刷新已开启" : "自动刷新已关闭",
        description: newState ? "将每5分钟自动刷新一次" : "已停止自动刷新",
        status: "info",
        duration: 3000,
        isClosable: true,
      });
      return newState;
    });
  }, [toast]);

  // 添加监听positions变化的effect，自动为新的position设置默认状态
  useEffect(() => {
    // 更新监控状态
    setMonitoringStates(prev => {
      const newStates = { ...prev };
      let hasChanges = false;
      positions.forEach(pos => {
        if (newStates[pos.tokenId] === undefined) {
          newStates[pos.tokenId] = true;
          hasChanges = true;
        }
      });
      if (hasChanges) {
        localStorage.setItem(`monitoringStates_${walletAddress}`, JSON.stringify(newStates));
      }
      return hasChanges ? newStates : prev;
    });

    // 更新策略状态
    setStrategies(prev => {
      const newStrategies = { ...prev };
      let hasChanges = false;
      positions.forEach(pos => {
        if (!newStrategies[pos.tokenId]) {
          newStrategies[pos.tokenId] = {
            upperBoundRebalance: true,
            lowerBoundWithdraw: true,
            priceDropWithdraw: false,
            priceDropThreshold: 5
          };
          hasChanges = true;
        }
      });
      if (hasChanges) {
        localStorage.setItem(`strategies_${walletAddress}`, JSON.stringify(newStrategies));
      }
      return hasChanges ? newStrategies : prev;
    });
  }, [positions, walletAddress]);

  // 修改表格头部的 HStack，添加自动刷新开关
  const renderHeader = () => (
            <HStack justify="space-between" align="center">
              <Text fontSize="lg" fontWeight="bold">LP 仓位信息</Text>
      <HStack spacing={4}>
              <HStack>
          <Switch
            colorScheme="blue"
            isChecked={isAutoRefreshEnabled}
            onChange={handleAutoRefreshToggle}
            size="sm"
          />
          <Text fontSize="sm" color="gray.600">
            自动刷新
          </Text>
        </HStack>
                <Button
                  size="sm"
                  colorScheme="blue"
                  onClick={handleViewHistory}
                  isLoading={loadingHistory}
                >
                  历史记录
                </Button>
                <IconButton
                  aria-label="刷新数据"
                  icon={loading ? <Spinner size="sm" /> : <RepeatIcon />}
          onClick={() => fetchPositions(false)}
                  isLoading={loading}
                  size="sm"
                  colorScheme="blue"
                />
              </HStack>
            </HStack>
  );

  // 添加刷新详细信息的函数
  const refreshPositionDetails = useCallback(async () => {
    if (!selectedPosition || !selectedPosition.tokenId) return;

    try {
      const provider = await getWorkingProvider();
      const updatedPosition = await fetchSinglePosition(selectedPosition.tokenId, provider, closedPool);
      
      if (updatedPosition) {
        // 保留原有的历史价格和更新时间
        const mergedPosition = {
          ...updatedPosition,
          historicalPrice: selectedPosition.historicalPrice,
          lastPriceUpdateTime: selectedPosition.lastPriceUpdateTime
        };
        
        setSelectedPosition(mergedPosition);
        toast({
          title: "刷新成功",
          description: "已更新仓位详细信息",
          status: "success",
          duration: 2000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('刷新详细信息失败:', error);
      toast({
        title: "刷新失败",
        description: "无法更新仓位详细信息",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  }, [selectedPosition, closedPool, toast]);

  // 添加手动加载NFT的函数
  const loadNFTManually = useCallback(async () => {
    if (!manualNFTId || !manualNFTId.trim()) {
      toast({
        title: "请输入NFT ID",
        description: "请输入有效的NFT ID",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    try {
      const tokenId = manualNFTId.trim();
      console.log(`手动加载NFT ID: ${tokenId}`);
      setLoading(true);
      
      // 设置超时，避免加载状态卡住
      const timeoutId = setTimeout(() => {
        console.log("手动加载NFT超时");
        setLoading(false);
        toast({
          title: "加载超时",
          description: "加载NFT超时，请检查网络连接后重试",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }, 20000); // 20秒超时
      
      const provider = await getWorkingProvider();
      
      // 使用新的getV4PositionById方法获取NFT头寸信息
      console.log(`调用getV4PositionById获取NFT #${tokenId}的详细信息...`);
      const positionInfo = await getV4PositionById(tokenId, provider);
      
      if (!positionInfo) {
        toast({
          title: "加载失败",
          description: `无法获取NFT #${tokenId} 的详情，请确认ID是否正确`,
          status: "error",
          duration: 5000,
          isClosable: true,
        });
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }
      
      // 计算价格
      const currentTick = Number(positionInfo.tickLower) + 
        (Number(positionInfo.tickUpper) - Number(positionInfo.tickLower)) / 2; // 使用范围中点作为近似
      const estimatedCurrentPrice = tickToPrice(currentTick);
      const lowerPrice = tickToPrice(Number(positionInfo.tickLower));
      const upperPrice = tickToPrice(Number(positionInfo.tickUpper));
      
      // 构建组件使用的格式
      const formattedPosition = {
        tokenId: positionInfo.tokenId,
        token0: positionInfo.token0,
        token1: positionInfo.token1,
        token0Symbol: positionInfo.token0Symbol,
        token1Symbol: positionInfo.token1Symbol,
        token0Decimals: positionInfo.token0Decimals,
        token1Decimals: positionInfo.token1Decimals,
        fee: positionInfo.fee,
        tickLower: Number(positionInfo.tickLower),
        tickUpper: Number(positionInfo.tickUpper),
        liquidity: positionInfo.liquidity,
        currentTick: currentTick,
        amount0: positionInfo.tokensOwed0,
        amount1: positionInfo.tokensOwed1,
        isActive: true, // 假设活跃
        currentPrice: formatPriceString(estimatedCurrentPrice),
        lowerPrice: formatPriceString(lowerPrice),
        upperPrice: formatPriceString(upperPrice),
        feesEarned0: positionInfo.tokensOwed0,
        feesEarned1: positionInfo.tokensOwed1,
        historicalPrice: formatPriceString(estimatedCurrentPrice),
        lastPriceUpdateTime: Date.now()
      };
      
      // 更新仓位列表
      setPositions(prev => {
        const existing = prev.find(p => p.tokenId === tokenId);
        if (existing) {
          return prev.map(p => p.tokenId === tokenId ? formattedPosition : p);
        } else {
          return [...prev, formattedPosition];
        }
      });
      
      // 更新策略状态
      setStrategies(prev => {
        const newStrategies = { ...prev };
        if (!newStrategies[tokenId]) {
          newStrategies[tokenId] = {
            upperBoundRebalance: true,
            lowerBoundWithdraw: true,
            priceDropWithdraw: false,
            priceDropThreshold: 5
          };
        }
        return newStrategies;
      });
      
      // 更新监控状态
      setMonitoringStates(prev => {
        const newStates = { ...prev };
        if (newStates[tokenId] === undefined) {
          newStates[tokenId] = true;
        }
        return newStates;
      });
      
      toast({
        title: "加载成功",
        description: `成功加载NFT #${tokenId} (${positionInfo.token0Symbol}/${positionInfo.token1Symbol})`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      
      // 清空输入框
      setManualNFTId('');
      clearTimeout(timeoutId);
      setLoading(false);
    } catch (error) {
      console.error("手动加载NFT失败:", error);
      toast({
        title: "加载失败",
        description: "发生未知错误，请查看控制台日志",
        status: "error",
        duration: 3000,
        isClosable: true,
      });
      setLoading(false);
    }
  }, [manualNFTId, toast, getWorkingProvider, setPositions, setStrategies, setMonitoringStates]);

  // 修改渲染查询按钮的函数，只保留SDK查询
  const renderQueryButtons = () => (
    <Button
      size="sm"
      colorScheme="teal"
      leftIcon={<SearchIcon />}
      onClick={fetchPositionsFromSubgraph}
      isLoading={loading}
      loadingText="查询中"
    >
      查询LP仓位
    </Button>
  );
  
  // 添加使用Subgraph查询LP位置的函数
  const fetchPositionsFromSubgraph = useCallback(async () => {
    if (!walletAddress) {
      toast({
        title: "未连接钱包",
        description: "请先连接钱包",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const provider = await getWorkingProvider();
      
      console.log("使用Subgraph获取LP位置信息...");
      toast({
        title: "查询中",
        description: "正在获取LP位置信息...",
        status: "loading",
        duration: 3000,
        isClosable: true,
      });
      
      const positions = await getUserPositionsWithDetails(walletAddress, provider);
      
      if (positions.length === 0) {
        toast({
          title: "未找到LP位置",
          description: "未找到您的LP位置信息",
          status: "info",
          duration: 5000,
          isClosable: true,
        });
        setPositions([]);
        setLoading(false);
        return;
      }
      
      // 格式化位置信息
      const formattedPositions = await Promise.all(positions.map(async pos => {
        // 获取代币信息
        const [token0Info, token1Info] = await Promise.all([
          getTokenInfo(pos.token0, provider),
          getTokenInfo(pos.token1, provider)
        ]);
        
        // 计算价格（使用tick近似）
        const tickMiddle = (Number(pos.tickLower) + Number(pos.tickUpper)) / 2;
        const estimatedCurrentPrice = tickToPrice(tickMiddle);
        const lowerPrice = tickToPrice(Number(pos.tickLower));
        const upperPrice = tickToPrice(Number(pos.tickUpper));
        
        return {
          tokenId: pos.tokenId,
          token0: pos.token0,
          token1: pos.token1,
          token0Symbol: token0Info.symbol,
          token1Symbol: token1Info.symbol,
          token0Decimals: token0Info.decimals,
          token1Decimals: token1Info.decimals,
          fee: Number(pos.fee),
          tickLower: Number(pos.tickLower),
          tickUpper: Number(pos.tickUpper),
          liquidity: pos.liquidity,
          currentTick: tickMiddle,
          amount0: pos.tokensOwed0 || '0',
          amount1: pos.tokensOwed1 || '0',
          isActive: true, // 假设活跃
          currentPrice: formatPriceString(estimatedCurrentPrice),
          lowerPrice: formatPriceString(lowerPrice),
          upperPrice: formatPriceString(upperPrice),
          feesEarned0: pos.tokensOwed0 || '0',
          feesEarned1: pos.tokensOwed1 || '0',
          historicalPrice: formatPriceString(estimatedCurrentPrice),
          lastPriceUpdateTime: Date.now()
        };
      }));
      
      console.log(`成功获取 ${formattedPositions.length} 个LP位置信息`);
      
      // 更新位置列表
      updatePositions(formattedPositions);
      
      // 保存找到的TokenID到本地存储
      try {
        const tokenIds = formattedPositions.map(pos => pos.tokenId);
        localStorage.setItem(`known_nft_ids_${walletAddress}`, JSON.stringify(tokenIds));
        console.log(`保存 ${tokenIds.length} 个NFT ID到本地存储`);
      } catch (saveError) {
        console.error("保存TokenID到本地存储失败:", saveError);
      }
      
      toast({
        title: "查询成功",
        description: `成功获取 ${formattedPositions.length} 个LP位置信息`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error("获取LP位置失败:", error);
      toast({
        title: "查询失败",
        description: "无法获取LP位置信息",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [walletAddress, toast, getWorkingProvider, updatePositions]);

  // 添加getTokenInfo辅助函数
  async function getTokenInfo(tokenAddress, provider) {
    try {
      // ERC20代币ABI
      const erc20Abi = [
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)'
      ];
      
      const contract = new ethers.Contract(tokenAddress, erc20Abi, provider);
      
      const [symbol, decimals] = await Promise.all([
        contract.symbol().catch(() => 'Unknown'),
        contract.decimals().catch(() => 18)
      ]);
      
      return { 
        symbol, 
        decimals: Number(decimals)
      };
    } catch (error) {
      console.error(`获取代币 ${tokenAddress} 信息失败:`, error);
      return { 
        symbol: 'Unknown', 
        decimals: 18 
      };
    }
  }

  // 修改主要渲染函数中的按钮部分
  return (
    <Box>
      <VStack spacing={4} width="100%">
        <HStack width="100%" justify="space-between" align="center">
          <Text fontSize="xl" fontWeight="bold">LP 仓位信息</Text>
          <HStack>
            {renderQueryButtons()}
            
            {loading && (
              <Button
                size="sm"
                colorScheme="red"
                onClick={() => {
                  console.log("用户手动取消加载");
                  setLoading(false);
                }}
              >
                取消加载
              </Button>
            )}
          </HStack>
        </HStack>
        
        {!loading && positions.length === 0 && (
          <Box width="100%" p={4} borderWidth="1px" borderRadius="lg" textAlign="center">
            <Text>未找到LP仓位</Text>
            <Text fontSize="sm" color="gray.500" mt={2}>
              您还没有活跃的LP仓位，或者系统无法自动检测到它们
            </Text>
          </Box>
        )}

        {loading && (
          <Box width="100%" p={4} borderWidth="1px" borderRadius="lg" textAlign="center">
            <Spinner size="xl" />
            <Text mt={4}>正在获取LP仓位信息...</Text>
          </Box>
        )}
      </VStack>
    </Box>
  );
}

export default LPPositions; 