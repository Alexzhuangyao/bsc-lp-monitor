/**
 * 使用Uniswap V4 Subgraph查询用户Position ID和详情的服务
 * 基于官方文档: https://docs.uniswap.org/sdk/v4/guides/liquidity/position-fetching
 */

import { ethers } from 'ethers';
import { UNICHAIN_CONFIG } from './uniswapService';

// Subgraph相关常量
const UNICHAIN_SUBGRAPH_URL = 'https://gateway.thegraph.com/api/subgraphs/id/EoCvJ5tyMLMJcTnLQwWpjAtPdn74PcrZgzfcT5bYxNBH';
const POSITION_MANAGER_ADDRESS = '0x4529a01c7a0410167c5740c487a8de60232617bf'; // Uniswap V4 Position Manager on Unichain

// GraphQL查询
const GET_POSITIONS_QUERY = `
  query GetPositions($owner: String!) {
    positions(where: { owner: $owner }) {
      tokenId
      owner
      id
    }
  }
`;

// Position Manager ABI (关键函数)
const POSITION_MANAGER_ABI = [
  {
    name: 'getPoolAndPositionInfo',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [
          { name: 'currency0', type: 'address' },
          { name: 'currency1', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'tickSpacing', type: 'int24' },
          { name: 'hooks', type: 'address' },
        ],
      },
      { name: 'info', type: 'uint256' },
    ],
  },
  {
    name: 'getPositionLiquidity',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
  // 添加ERC721基础方法，用于检查所有权
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  // 添加获取头寸详细信息的方法 (v3/v4兼容)
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
];

/**
 * 从Subgraph获取用户的Position IDs
 * @param {string} ownerAddress - 用户地址
 * @returns {Promise<Array<string>>} - TokenID数组
 */
export async function getPositionIdsFromSubgraph(ownerAddress) {
  try {
    console.log(`从Subgraph查询用户 ${ownerAddress} 的Position IDs...`);
    
    // 创建请求头 (可以添加API key如果有的话)
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer 7103aabcfffdfd5975882983e8d69f44', // 如果需要API key
    };
    
    // 准备查询参数
    const queryParams = {
      query: GET_POSITIONS_QUERY,
      variables: {
        owner: ownerAddress.toLowerCase(),
      },
    };
    
    // 发送请求到Subgraph
    const response = await fetch(UNICHAIN_SUBGRAPH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(queryParams),
    });
    
    if (!response.ok) {
      throw new Error(`Subgraph请求失败: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`Subgraph查询错误: ${data.errors[0].message}`);
    }
    
    if (!data.data || !data.data.positions) {
      console.log('Subgraph没有返回Position数据');
      return [];
    }
    
    // 提取TokenID
    const tokenIds = data.data.positions.map(position => position.tokenId);
    console.log(`从Subgraph找到 ${tokenIds.length} 个Position IDs:`, tokenIds);
    
    return tokenIds;
  } catch (error) {
    console.error('获取Position IDs失败:', error);
    return [];
  }
}

/**
 * 解码Position压缩信息
 * @param {bigint} value - 压缩的Position信息
 * @returns {Object} - 解码后的Position信息
 */
function decodePositionInfo(value) {
  return {
    getTickUpper: () => {
      const raw = Number((value >> 32n) & 0xffffffn);
      return raw >= 0x800000 ? raw - 0x1000000 : raw;
    },
    
    getTickLower: () => {
      const raw = Number((value >> 8n) & 0xffffffn);
      return raw >= 0x800000 ? raw - 0x1000000 : raw;
    },
    
    hasSubscriber: () => (value & 0xffn) !== 0n,
  };
}

/**
 * 从合约获取Position详情
 * @param {string|number} tokenId - Position Token ID
 * @param {ethers.Provider} provider - Ethers Provider
 * @returns {Promise<Object|null>} - Position详情
 */
export async function getPositionDetails(tokenId, provider) {
  try {
    console.log(`获取Position #${tokenId} 的详情...`);
    
    const contract = new ethers.Contract(
      POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI,
      provider
    );
    
    // 尝试使用v4特有的方法
    try {
      console.log('使用V4特有方法获取Position详情...');
      // 获取池子信息和压缩的Position信息
      const [poolKey, infoValue] = await contract.getPoolAndPositionInfo(tokenId);
      
      // 获取当前流动性
      const liquidity = await contract.getPositionLiquidity(tokenId);
      
      // 解码压缩的Position信息
      const positionInfo = decodePositionInfo(infoValue);
      const tickLower = positionInfo.getTickLower();
      const tickUpper = positionInfo.getTickUpper();
      
      return {
        tokenId: tokenId.toString(),
        tickLower,
        tickUpper,
        liquidity: liquidity.toString(),
        token0: poolKey.currency0,
        token1: poolKey.currency1,
        fee: poolKey.fee,
        hooks: poolKey.hooks,
        hasSubscriber: positionInfo.hasSubscriber(),
        sourceMethod: 'v4-specific'
      };
    } catch (v4Error) {
      console.warn('V4特有方法失败，尝试通用方法:', v4Error.message);
      
      // 回退到通用方法
      const position = await contract.positions(tokenId);
      
      return {
        tokenId: tokenId.toString(),
        token0: position.token0,
        token1: position.token1,
        fee: position.fee,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity.toString(),
        tokensOwed0: position.tokensOwed0.toString(),
        tokensOwed1: position.tokensOwed1.toString(),
        sourceMethod: 'fallback'
      };
    }
  } catch (error) {
    console.error(`获取Position #${tokenId} 详情失败:`, error);
    return null;
  }
}

/**
 * 直接检查用户是否拥有特定TokenID
 * @param {string} tokenId - Position Token ID
 * @param {string} ownerAddress - 用户地址
 * @param {ethers.Provider} provider - Ethers Provider
 * @returns {Promise<boolean>} - 是否拥有
 */
export async function checkPositionOwnership(tokenId, ownerAddress, provider) {
  try {
    const contract = new ethers.Contract(
      POSITION_MANAGER_ADDRESS,
      POSITION_MANAGER_ABI,
      provider
    );
    
    const owner = await contract.ownerOf(tokenId);
    return owner.toLowerCase() === ownerAddress.toLowerCase();
  } catch (error) {
    return false;
  }
}

/**
 * 获取用户的所有LP Position详情
 * @param {string} ownerAddress - 用户地址
 * @param {ethers.Provider} provider - Ethers Provider
 * @returns {Promise<Array<Object>>} - Position详情数组
 */
export async function getUserPositionsWithDetails(ownerAddress, provider) {
  try {
    // 从Subgraph获取TokenIDs
    let tokenIds = await getPositionIdsFromSubgraph(ownerAddress);
    
    // 如果Subgraph失败，尝试直接从用户提供的ID列表获取
    if (tokenIds.length === 0) {
      console.log('Subgraph没有返回结果，尝试从已知ID列表获取...');
      
      // 尝试从localStorage读取缓存的TokenID
      try {
        const cachedIds = localStorage.getItem(`known_nft_ids_${ownerAddress}`);
        if (cachedIds) {
          tokenIds = JSON.parse(cachedIds);
          console.log(`从缓存找到 ${tokenIds.length} 个TokenIDs:`, tokenIds);
        }
      } catch (cacheError) {
        console.warn('读取缓存的TokenIDs失败:', cacheError.message);
      }
    }
    
    if (tokenIds.length === 0) {
      console.log('无法获取Position IDs，请尝试手动输入');
      return [];
    }
    
    // 获取每个Position的详情
    console.log(`获取 ${tokenIds.length} 个Position的详情...`);
    const positionPromises = tokenIds.map(id => getPositionDetails(id, provider));
    const positions = await Promise.all(positionPromises);
    
    // 过滤掉失败的请求
    const validPositions = positions.filter(Boolean);
    console.log(`成功获取 ${validPositions.length}/${tokenIds.length} 个Position的详情`);
    
    return validPositions;
  } catch (error) {
    console.error('获取用户Position失败:', error);
    return [];
  }
}

export default {
  getPositionIdsFromSubgraph,
  getPositionDetails,
  checkPositionOwnership,
  getUserPositionsWithDetails,
}; 