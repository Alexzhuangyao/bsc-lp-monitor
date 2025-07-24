import { ethers } from "ethers";

/**
 * 这个脚本专门用于通过多种方法查询用户拥有的NFT
 * 包括:
 * 1. 直接使用ERC721标准方法
 * 2. 通过Transfer事件查询
 * 3. 批量检查可能的tokenId范围
 */

// ERC721基本ABI
const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function tokenByIndex(uint256 index) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

/**
 * 从Transfer事件中查找用户的NFT
 * @param {string} userAddress 用户地址
 * @param {string} contractAddress NFT合约地址
 * @param {ethers.providers.Provider} provider 提供者
 */
async function findNFTsFromTransferEvents(userAddress, contractAddress, provider) {
  console.log(`\n从Transfer事件中查找NFT...`);
  
  try {
    // 创建合约实例
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    // 查找转入用户的Transfer事件
    const filterTo = {
      address: contractAddress,
      topics: [
        ethers.id("Transfer(address,address,uint256)"),
        null,
        ethers.zeroPadValue(ethers.getAddress(userAddress), 32)
      ],
      fromBlock: -100000 // 查询更多区块
    };
    
    // 查找从用户转出的Transfer事件
    const filterFrom = {
      address: contractAddress,
      topics: [
        ethers.id("Transfer(address,address,uint256)"),
        ethers.zeroPadValue(ethers.getAddress(userAddress), 32)
      ],
      fromBlock: -100000
    };
    
    // 获取日志
    console.log("获取Transfer(to)事件...");
    const toLogs = await provider.getLogs(filterTo);
    console.log(`找到 ${toLogs.length} 条转入事件`);
    
    console.log("获取Transfer(from)事件...");
    const fromLogs = await provider.getLogs(filterFrom);
    console.log(`找到 ${fromLogs.length} 条转出事件`);
    
    // 分析交易历史确定当前拥有的NFT
    const transfersTo = new Map();
    const transfersFrom = new Map();
    
    // 处理转入事件
    for (const log of toLogs) {
      try {
        const parsedLog = contract.interface.parseLog(log);
        if (parsedLog && parsedLog.name === "Transfer") {
          const tokenId = parsedLog.args.tokenId;
          transfersTo.set(tokenId.toString(), true);
          console.log(`用户收到TokenID: ${tokenId.toString()}`);
        }
      } catch (e) {
        console.warn("解析转入日志失败:", e.message);
      }
    }
    
    // 处理转出事件
    for (const log of fromLogs) {
      try {
        const parsedLog = contract.interface.parseLog(log);
        if (parsedLog && parsedLog.name === "Transfer") {
          const tokenId = parsedLog.args.tokenId;
          transfersFrom.set(tokenId.toString(), true);
          console.log(`用户转出TokenID: ${tokenId.toString()}`);
        }
      } catch (e) {
        console.warn("解析转出日志失败:", e.message);
      }
    }
    
    // 通过转入减去转出确定当前拥有的NFT
    const ownedTokenIds = [];
    for (const tokenId of transfersTo.keys()) {
      if (!transfersFrom.has(tokenId)) {
        ownedTokenIds.push(tokenId);
      }
    }
    
    // 验证这些NFT确实属于用户
    const confirmedTokenIds = [];
    for (const tokenId of ownedTokenIds) {
      try {
        const owner = await contract.ownerOf(tokenId);
        if (owner.toLowerCase() === userAddress.toLowerCase()) {
          console.log(`✅ 确认用户拥有TokenID: ${tokenId}`);
          confirmedTokenIds.push(tokenId);
        } else {
          console.log(`❌ TokenID ${tokenId} 的所有者是 ${owner}, 而不是用户 ${userAddress}`);
        }
      } catch (e) {
        console.warn(`检查TokenID ${tokenId} 所有权失败:`, e.message);
      }
    }
    
    console.log(`\n通过事件分析找到 ${confirmedTokenIds.length} 个NFT: ${confirmedTokenIds.join(', ')}`);
    return confirmedTokenIds;
  } catch (error) {
    console.error("从事件查询NFT失败:", error);
    return [];
  }
}

/**
 * 使用ERC721标准方法查询用户的NFT
 * @param {string} userAddress 用户地址
 * @param {string} contractAddress NFT合约地址
 * @param {ethers.providers.Provider} provider 提供者
 */
async function findNFTsWithStandardMethods(userAddress, contractAddress, provider) {
  console.log(`\n使用标准ERC721方法查询NFT...`);
  
  try {
    // 创建合约实例
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    // 获取合约基本信息
    const name = await contract.name().catch(() => "未知");
    const symbol = await contract.symbol().catch(() => "未知");
    console.log(`合约名称: ${name}, 符号: ${symbol}`);
    
    // 获取用户NFT余额
    const balance = await contract.balanceOf(userAddress);
    console.log(`用户NFT余额: ${balance.toString()}`);
    
    const tokenIds = [];
    const balanceNumber = Number(balance);
    
    // 获取所有NFT的TokenID
    for (let i = 0; i < balanceNumber; i++) {
      try {
        const tokenId = await contract.tokenOfOwnerByIndex(userAddress, i);
        console.log(`通过索引${i}获取的TokenID: ${tokenId.toString()}`);
        tokenIds.push(tokenId.toString());
      } catch (error) {
        console.error(`获取TokenID ${i} 失败:`, error.message);
      }
    }
    
    console.log(`\n通过标准方法找到 ${tokenIds.length} 个NFT: ${tokenIds.join(', ')}`);
    return tokenIds;
  } catch (error) {
    console.error("使用标准方法查询NFT失败:", error);
    return [];
  }
}

/**
 * 通过批量检查可能的tokenId范围查找用户的NFT
 * @param {string} userAddress 用户地址
 * @param {string} contractAddress NFT合约地址
 * @param {ethers.providers.Provider} provider 提供者
 * @param {number} maxId 要检查的最大ID
 */
async function findNFTsByBruteForce(userAddress, contractAddress, provider, maxId = 100) {
  console.log(`\n通过暴力查询检查用户NFT (检查ID范围: 1-${maxId})...`);
  
  try {
    // 创建合约实例
    const contract = new ethers.Contract(contractAddress, ERC721_ABI, provider);
    
    const ownedTokenIds = [];
    const batchSize = 10; // 每批检查的数量
    
    // 批量检查可能的tokenId
    for (let start = 1; start <= maxId; start += batchSize) {
      const end = Math.min(start + batchSize - 1, maxId);
      console.log(`检查ID范围 ${start}-${end}...`);
      
      const promises = [];
      for (let tokenId = start; tokenId <= end; tokenId++) {
        promises.push(
          (async () => {
            try {
              const owner = await contract.ownerOf(tokenId);
              if (owner.toLowerCase() === userAddress.toLowerCase()) {
                console.log(`✅ TokenID ${tokenId} 属于用户!`);
                return tokenId.toString();
              }
            } catch (e) {
              // 忽略错误，可能是不存在的TokenID
            }
            return null;
          })()
        );
      }
      
      // 等待所有查询完成
      const results = await Promise.all(promises);
      results.filter(Boolean).forEach(id => ownedTokenIds.push(id));
    }
    
    console.log(`\n通过暴力查询找到 ${ownedTokenIds.length} 个NFT: ${ownedTokenIds.join(', ')}`);
    return ownedTokenIds;
  } catch (error) {
    console.error("暴力查询NFT失败:", error);
    return [];
  }
}

/**
 * 综合使用多种方法查询用户的NFT
 * @param {string} userAddress 用户地址
 * @param {string} contractAddress NFT合约地址
 * @param {string} rpcUrl RPC URL
 */
async function findAllNFTs(userAddress, contractAddress, rpcUrl) {
  console.log(`\n开始查询地址 ${userAddress} 在合约 ${contractAddress} 上的NFT...`);
  
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  try {
    // 检查连接的网络
    const network = await provider.getNetwork();
    console.log(`当前连接的网络: chainId=${network.chainId}, name=${network.name || '未知'}`);
    
    // 检查合约是否存在
    const code = await provider.getCode(contractAddress);
    if (code === "0x" || code === "") {
      console.error("❌ 合约在该网络上不存在!");
      return [];
    }
    console.log("✅ 合约存在于该网络");
    
    // 使用三种不同方法查询
    const standardResults = await findNFTsWithStandardMethods(userAddress, contractAddress, provider);
    const eventResults = await findNFTsFromTransferEvents(userAddress, contractAddress, provider);
    const bruteForceResults = await findNFTsByBruteForce(userAddress, contractAddress, provider, 100);
    
    // 合并结果并去重
    const allTokenIds = new Set([
      ...standardResults, 
      ...eventResults, 
      ...bruteForceResults
    ]);
    
    console.log(`\n=========== 综合查询结果 ===========`);
    console.log(`用户拥有 ${allTokenIds.size} 个NFT: ${Array.from(allTokenIds).join(', ')}`);
    return Array.from(allTokenIds);
  } catch (error) {
    console.error("查询NFT失败:", error);
    return [];
  }
}

// 主函数
async function main() {
  // 替换为您的参数
  const userAddress = "0xYourWalletAddress";
  const contractAddress = "0x943e6e07a7E8E791dAFC44083e54041D743C46E9"; // 您的NFT合约地址
  const rpcUrl = "https://mainnet.unichain.org";
  
  await findAllNFTs(userAddress, contractAddress, rpcUrl);
}

// 如果直接运行此脚本
if (typeof require !== 'undefined' && require.main === module) {
  main().catch(console.error);
}

// 导出函数，以便其他文件使用
export { 
  findNFTsWithStandardMethods, 
  findNFTsFromTransferEvents,
  findNFTsByBruteForce,
  findAllNFTs 
}; 