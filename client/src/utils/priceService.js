import { ethers } from 'ethers';

const BSC_RPC = 'https://bsc-dataseed.binance.org';

// PancakeSwap V3 Factory
const FACTORY_ADDRESS = '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865';
const FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

// PancakeSwap V3 Pool
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)'
];

// 常见代币列表
export const PRICE_TOKENS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
};

// 最常见的费率
const COMMON_FEE_TIERS = [100, 500, 2500, 10000];

class PriceService {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(BSC_RPC);
    this.factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, this.provider);
    this.priceCache = new Map();
    this.lastUpdateTime = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
    this.poolCache = new Map(); // 缓存池子地址
  }

  async getPool(tokenA, tokenB, fee) {
    const tokens = [tokenA, tokenB].sort((a, b) => 
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    const poolKey = `${tokens[0]}-${tokens[1]}-${fee}`;
    
    if (!this.poolCache.has(poolKey)) {
      const poolAddress = await this.factory.getPool(tokens[0], tokens[1], fee);
      if (poolAddress !== ethers.ZeroAddress) {
        this.poolCache.set(poolKey, poolAddress);
      }
    }
    
    return this.poolCache.get(poolKey);
  }

  async findBestPool(tokenAddress) {
    let bestPool = null;

    for (const fee of COMMON_FEE_TIERS) {
      const poolAddress = await this.getPool(tokenAddress, PRICE_TOKENS.USDT, fee);
      if (!poolAddress) continue;

      const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
      try {
        const [sqrtPriceX96] = await pool.slot0();
        // 如果能获取到价格，说明池子是活跃的
        if (sqrtPriceX96 > 0) {
          const token0 = await pool.token0();
          bestPool = {
            address: poolAddress,
            sqrtPriceX96,
            token0: token0.toLowerCase()
          };
          break; // 找到第一个有效池子就使用
        }
      } catch (error) {
        continue;
      }
    }

    return bestPool;
  }

  async getTokenPrice(tokenAddress) {
    try {
      // 如果是USDT，直接返回1
      if (tokenAddress.toLowerCase() === PRICE_TOKENS.USDT.toLowerCase()) {
        return 1;
      }

      // 检查缓存
      const now = Date.now();
      const cacheKey = tokenAddress.toLowerCase();
      const lastUpdate = this.lastUpdateTime.get(cacheKey) || 0;
      
      if (now - lastUpdate < this.CACHE_DURATION) {
        const cachedPrice = this.priceCache.get(cacheKey);
        if (cachedPrice !== undefined) {
          return cachedPrice;
        }
      }

      // 查找最佳池子
      const pool = await this.findBestPool(tokenAddress);
      if (!pool) {
        console.warn(`No active pool found for token ${tokenAddress}`);
        return 0;
      }

      // 计算价格
      const sqrtPriceX96 = pool.sqrtPriceX96;
      const isToken0 = pool.token0 === tokenAddress.toLowerCase();
      
      // 将 sqrtPriceX96 转换为实际价格
      const Q96 = 2n ** 96n;
      const sqrtPriceBigInt = ethers.toBigInt(sqrtPriceX96);
      const price = Number((sqrtPriceBigInt * sqrtPriceBigInt) / Q96) / Number(Q96);
      
      // 如果token是token1，需要取倒数
      const finalPrice = isToken0 ? price : 1 / price;

      // 更新缓存
      this.priceCache.set(cacheKey, finalPrice);
      this.lastUpdateTime.set(cacheKey, now);

      return finalPrice;
    } catch (error) {
      console.error('Error fetching token price:', error);
      return 0;
    }
  }

  // 批量获取价格
  async getTokenPrices(tokenAddresses) {
    const prices = await Promise.all(
      tokenAddresses.map(address => this.getTokenPrice(address))
    );
    return tokenAddresses.reduce((acc, address, index) => {
      acc[address.toLowerCase()] = prices[index];
      return acc;
    }, {});
  }
}

export const priceService = new PriceService(); 