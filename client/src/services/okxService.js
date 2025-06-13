import crypto from 'crypto-js';
import { ethers, JsonRpcProvider, Wallet, parseUnits } from 'ethers';

const BASE_URL = 'https://web3.okx.com/api/v5';  // 修改基础URL，移除api/v5
const PROJECT_ID = '9d968a69b402cec5d8b4c99297876f63';
const ACCESS_KEY = 'efc9f38f-761a-43b6-ac11-64f85060621b';
const SECRET_KEY = 'FC46AA60301DC450A68114BBD7FAA8B4'; // 需要替换为实际的密钥
const PASSPHRASE = 'J6AuhK-kTeZ-pG2';

// OKX DEX Router合约地址
const OKX_DEX_ROUTER = '0x9b9efa5Efa731EA9Bbb0369E91fA17Abf249CFD4';

// OKX DEX Router ABI
const OKX_DEX_ROUTER_ABI = [
  'function WETH() external pure returns (address)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)'
];

// BSC链的配置
const BSC_CONFIG = {
  chainIndex: '56',
  BNB: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
  DEX_ROUTER: '0x9b9efa5Efa731EA9Bbb0369E91fA17Abf249CFD4',
  APPROVE_ROUTER: '0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6',
  WNATIVE_RELAYER: '0x0B5f474ad0e3f7ef629BD10dbf9e4a8Fd60d9A48',
  TOKEN_APPROVE_PROXY: '0xd99cAE3FAC551f6b6Ba7B9f19bDD316951eeEE98',
  RPC_URL: 'https://bsc-dataseed.binance.org',
  
  // DEX适配器地址
  ADAPTERS: {
    UNIV2: '0x363FB85314c5d7BAF27e9e5AC3b6E8bDa9ae9b85',
    UNIV3: '0xAe7fCEf300495de4aFDa82c1A369fa312b0ED9b8',
    BAKERY: '0xeB1426f967D9642317148b401EbB6a687E1a174a',
    KYBER: '0x595Da5C1b445493f5C5dB7fb8813de594c760bee',
    PANCAKE: '0x1cB017EC34cCD9B808e4F125163807885AB70338',
    PANCAKE_V3: '0xCa9326C4c307dc84e676E6c9C7095BDe2eFA981D',
    MARKET_MAKER: '0x478c2F5B9b7a4C24b5F7D4c4f727dBC67D2f8382',
    PMM: '0x51A66d4ec8Df5eF8Fc7915fe64c4cb070FA8e8a7',
    DODO_V1: '0x1d0524ad45399FD03f602666f1076C96608EfD28',
    DODO_V2: '0x9631d2f87DD05500c3542D0ebc6E69fA94e6733D',
    DODO_V3: '0xdce40846CAbaED9064A3bf5A7445235dB8fF0fF3',
    SYNAPSE: '0x92470640a2904467adc88a0b026DBc876a2160a4',
    ELLIPSIS: '0x72e3eE933EaF568EA35049f30C01990cb6c2544b',
    WOMBAT: '0xd4Bbd03e18A6102D267B003e7CCad6BD78669248',
    SMOOTHY_V1: '0x471418aA966f5ef906A319D2ceF14b81a181cCfA',
    KYBER_ELASTIC: '0xe3bBF2FBdc2D4C1a9F9012294ddc6ADDe36C6C83',
    NOMISWAP: '0x40B7c771c78B50D5bb4D191F9B1D58D12a201C0d',
    MULTICHAIN: '0xC6703c539A76447cB8BF8B9210e91f7e474Eb68f',
    PANCAKE_STABLE: '0xAA2F2CFb5439330AF9412698d1f232db3DB8A49B',
    TRADER_JOE_V2: '0x4EAFD2C510405151f284afeB4aC7Dd7602C92768',
    TRADER_JOE_V2_P1: '0x56e6983D59bF472Ced0E63966A14d94A3A291589',
    WOOFI: '0x781ed5B8233394eAa56bFA7233C1aDFeA3C93FCC',
    IZUMI: '0xD35f165c03A27d21da5D7F5096Fd66668D5dFFA0',
    SOLIDLY_SERIES: '0x52f00F202A941f9B969690460f09A8853b889ea9',
    TRIDENT: '0x9Ac7b1FFEE0f58c0a3c89AA54Afb62efD25DC9fd',
    NERVE_FINANCE: '0x049C560cC466C2f74828A9c5b9338f9760493773',
    DOPPLE: '0x451723F4905E88348180D43366f1c817fcc39Aec',
    DNY: '0xA96A96669295e85aF046026bf714A26E84096889',
    ACSI_FINANCE: '0xa95E6797B0045dF37D13ea36F0FEa848dcb3a217',
    HASHFLOW: '0xABC7f0BEf82C4BF6A131758bbd92bdAFa63797DB',
    XSIGMA: '0x6667C8dC9fBFeC411E7C1EE2b24DE960149f930f',
    LIMIT: '0x21fD4D4e056E8022Eb13898D75F75670e16DfDC4',
    THENA_V2: '0xEdBaB5dfAA165919Dfa94101c266e48c4e82D8Fd',
    MAVRICK: '0x339e63b4CA123b6D5baD97057119c58e7EE7637b',
    SMARDEX: '0x3f7B48d5acafBA9793B6384912f568a1aBF78E9f',
    SPARTAN: '0x6E5d3aa32850B62711932db2e5CBc401AC3Cf17a',
    BABY_DOGE: '0xfb719654604f44Df1D5CbfeA736095444D5F6c88'
  }
};

// DEX Router ABI
const DEX_ROUTER_ABI = [
  'function WETH() external pure returns (address)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactETHForTokens(uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external payable returns (uint256[] memory amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)'
];

// 生成签名
const generateSignature = (timestamp, method, requestPath, body = '') => {
  try {
  // 确保时间戳格式正确
    const message = `${timestamp}${method}${requestPath}${body}`;
    console.log('Signing message:', {
      timestamp,
      method,
      requestPath,
      body,
      fullMessage: message
    });
    
    const hmac = crypto.HmacSHA256(message, SECRET_KEY);
    const signature = crypto.enc.Base64.stringify(hmac);
    
    console.log('Generated signature:', signature);
    return signature;
  } catch (error) {
    console.error('Error generating signature:', error);
    throw error;
  }
};

// 获取报价
const getQuote = async ({ fromTokenAddress, toTokenAddress, amount, slippage, userWalletAddress }) => {
  try {
    console.log('获取报价，参数:', { fromTokenAddress, toTokenAddress, amount, slippage, userWalletAddress });

    const timestamp = new Date().toISOString();
    const method = 'GET';
    const queryParams = {
      chainIndex: '56',  // BSC链的chainIndex
      amount,
      swapMode: 'exactIn',  // 使用exactIn模式，表示amount是输入金额
      fromTokenAddress,
      toTokenAddress,
      slippage: slippage || '0.005',
      userWalletAddress,
    };
    
    const queryString = new URLSearchParams(queryParams).toString();
    const requestPath = `/api/v5/dex/aggregator/quote?${queryString}`;
    const signature = generateSignature(timestamp, method, requestPath);

    const headers = {
      'OK-ACCESS-KEY': ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'OK-ACCESS-PROJECT': PROJECT_ID,
    };

    console.log('发送请求:', {
      url: `https://web3.okx.com${requestPath}`,
      method,
      headers: { ...headers, 'OK-ACCESS-SIGN': '***' }
    });

    const response = await fetch(`https://web3.okx.com${requestPath}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API响应错误:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`获取报价失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API响应数据:', data);

    if (data.code === '0' && data.data && data.data[0]) {
      const quoteData = data.data[0];
      
      // 验证返回数据的完整性
      if (!quoteData.toTokenAmount || !quoteData.priceImpactPercentage) {
        console.error('API返回数据不完整:', quoteData);
        throw new Error('获取报价失败: 返回数据不完整');
      }
      
      return {
        toTokenAmount: quoteData.toTokenAmount,
        priceImpactPercentage: quoteData.priceImpactPercentage,
        estimateGasFee: quoteData.estimateGasFee,
        dexRouterList: quoteData.dexRouterList,
        fromToken: quoteData.fromToken,
        toToken: quoteData.toToken,
        tradeFee: quoteData.tradeFee
      };
    } else {
      console.error('API返回错误:', data);
      throw new Error(data.msg || '获取报价失败: 无效响应');
    }
  } catch (error) {
    console.error('获取报价出错:', error);
    throw error;
  }
};

// 检查代币授权并在需要时进行授权
const checkAndApproveToken = async (tokenAddress, walletAddress, amount, provider) => {
  try {
    // 创建ERC20代币合约实例
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function allowance(address owner, address spender) external view returns (uint256)'],
      provider
    );

    // 检查当前授权额度
    const currentAllowance = await tokenContract.allowance(walletAddress, BSC_CONFIG.APPROVE_ROUTER);
    console.log('Current allowance:', currentAllowance.toString());
    
    // 如果当前授权额度小于要交易的金额，则需要授权
    if (currentAllowance < amount) {
      console.log('Token needs approval');
      
      // 获取授权交易数据
      const timestamp = new Date().toISOString();
      const method = 'GET';
      const queryString = new URLSearchParams({
        chainIndex: BSC_CONFIG.chainIndex,
        tokenContractAddress: tokenAddress,
        approveAmount: ethers.MaxUint256.toString() // 使用最大值进行授权
      }).toString();

      const requestPath = `/api/v5/dex/aggregator/approve-transaction?${queryString}`;
      const signature = generateSignature(timestamp, method, requestPath);

      const headers = {
        'OK-ACCESS-KEY': ACCESS_KEY,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': PASSPHRASE,
        'OK-ACCESS-PROJECT': PROJECT_ID,
        'Content-Type': 'application/json'
      };

      console.log('Requesting approve transaction:', `${BASE_URL}${requestPath}`);
      
      const response = await fetch(`${BASE_URL}${requestPath}`, {
        method: 'GET',
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }

      const data = await response.json();
      console.log('Approve transaction response:', data);

      if (data.code === '0' && data.data.length > 0) {
        const approveData = data.data[0];
        
        // 构建授权交易
        const txRequest = {
          to: approveData.dexContractAddress,
          data: approveData.data,
          gasLimit: ethers.toBigInt(approveData.gasLimit),
          gasPrice: ethers.parseUnits('0.1', 'gwei')
        };

        console.log('Sending approve transaction:', txRequest);

        // 发送授权交易
        const tx = await provider.sendTransaction(txRequest);
        console.log('Approve transaction sent:', tx.hash);

        // 等待交易确认
        const receipt = await tx.wait();
        console.log('Approve transaction confirmed:', receipt);

        return true;
      }

      throw new Error(data.msg || 'Failed to get approve transaction data');
    }
    
    console.log('Token already approved');
    return true;
  } catch (error) {
    console.error('Error in token approval:', error);
    throw error;
  }
};

// 获取swap交易数据
const getSwapTransactionData = async (params) => {
  try {
    const timestamp = new Date().toISOString();
    const method = 'POST';
    const requestPath = '/api/v5/dex/aggregator/swap';
    
    const body = JSON.stringify({
      chainIndex: BSC_CONFIG.chainIndex,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippage: '1',
      userWalletAddress: params.userWalletAddress,
      swapMode: 'exactIn',
      deadline: Math.floor(Date.now() / 1000) + 60 * 20 // 20分钟后过期
    });

    const signature = generateSignature(timestamp, method, requestPath, body);

    const headers = {
      'OK-ACCESS-KEY': ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'OK-ACCESS-PROJECT': PROJECT_ID,
      'Content-Type': 'application/json'
    };

    const response = await fetch(`${BASE_URL}${requestPath}`, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }

    const data = await response.json();
    if (data.code === '0') {
      return data.data[0];
    }
    throw new Error(data.msg || 'Failed to get swap transaction data');
  } catch (error) {
    console.error('Error getting swap transaction:', error);
    throw error;
  }
};

// 修改sendSwapTransaction函数
const sendSwapTransaction = async (params) => {
  try {
    console.log('🚀 准备交换交易...');
    console.log('参数:', {
      fromToken: params.fromTokenAddress,
      toToken: params.toTokenAddress,
      amount: params.amount,
      userWallet: params.userWalletAddress
    });

    // 获取swap数据
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const queryParams = {
      chainIndex: '56',
      amount: params.amount,
      swapMode: 'exactIn',
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      slippage: params.slippage || '0.5',
      userWalletAddress: params.userWalletAddress,
      autoSlippage: true
    };
    
    const queryString = new URLSearchParams(queryParams).toString();
    const requestPath = `/api/v5/dex/aggregator/swap?${queryString}`;
    const signature = generateSignature(timestamp, method, requestPath);

    const headers = {
      'OK-ACCESS-KEY': ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'OK-ACCESS-PROJECT': PROJECT_ID,
    };

    console.log('📊 获取交换数据...');
    const response = await fetch(`https://web3.okx.com${requestPath}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取交易数据失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('交换数据响应:', data);

    if (data.code !== '0' || !data.data || !data.data[0] || !data.data[0].tx) {
      throw new Error(data.msg || '获取交易数据失败');
    }

    const txData = data.data[0].tx;
    const provider = new ethers.JsonRpcProvider(BSC_CONFIG.RPC_URL);
    const wallet = new ethers.Wallet(params.privateKey, provider);

    // 获取当前gas价格
    console.log('⛽ 获取gas价格...');
    const feeData = await provider.getFeeData();
    const gasPrice = ethers.toBigInt(feeData.gasPrice) * ethers.toBigInt(12) / ethers.toBigInt(10); // 使用1.2倍gas价格

    // 获取nonce
    const nonce = await provider.getTransactionCount(params.userWalletAddress, 'latest');

    // 构建交易对象
    const transaction = {
      to: txData.to,
      data: txData.data,
      value: txData.value || '0',
      gasLimit: ethers.toBigInt('500000'), // 固定gas限制
      gasPrice: gasPrice,
      nonce: nonce,
      chainId: 56 // BSC的chainId
    };

    // 验证交易数据
    if (!transaction.data || transaction.data === '0x') {
      throw new Error('无效的交易数据');
    }

    console.log('📝 发送交易:', {
      to: transaction.to,
      value: transaction.value.toString(),
      gasLimit: transaction.gasLimit.toString(),
      gasPrice: transaction.gasPrice.toString(),
      nonce: transaction.nonce,
      dataLength: transaction.data.length
    });

    // 发送交易
    const tx = await wallet.sendTransaction(transaction);
    console.log('📡 交易已发送:', tx.hash);

    return tx;
  } catch (error) {
    console.error('❌ 交换交易失败:', error);
    throw error;
  }
};

// 获取授权交易数据
const getApproveTransaction = async (params) => {
  try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const queryString = new URLSearchParams({
      chainIndex: BSC_CONFIG.chainIndex,
      tokenContractAddress: params.tokenAddress,
      spenderContractAddress: BSC_CONFIG.APPROVE_ROUTER // 使用授权合约地址
    }).toString();

    const requestPath = `/api/v5/dex/aggregator/approve-transaction?${queryString}`;
    const signature = generateSignature(timestamp, method, requestPath);

    const headers = {
      'OK-ACCESS-KEY': ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'OK-ACCESS-PROJECT': PROJECT_ID,
    };

    const response = await fetch(`https://web3.okx.com${requestPath}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取授权数据失败: ${response.status}, ${errorText}`);
    }

    const data = await response.json();
    if (data.code === '0' && data.data && data.data[0]) {
      return data.data[0];
    }
    throw new Error(data.msg || '获取授权数据失败');
  } catch (error) {
    console.error('Error getting approve transaction:', error);
    throw error;
  }
};

// 检查授权状态
const checkAllowanceFromService = async ({ tokenAddress, spenderContractAddress, amount, userWalletAddress }) => {
  try {
    console.log('检查代币授权状态:', {
      tokenAddress,
      spenderContractAddress,
      amount,
      userWalletAddress
    });

    const timestamp = new Date().toISOString();
    const method = 'GET';
    const queryParams = {
      chainIndex: BSC_CONFIG.chainIndex,
      tokenContractAddress: tokenAddress,
      spenderContractAddress: spenderContractAddress,
      amount: amount,
      userWalletAddress: userWalletAddress
    };

    const queryString = new URLSearchParams(queryParams).toString();
    const requestPath = `/api/v5/dex/aggregator/allowance?${queryString}`;
    const signature = generateSignature(timestamp, method, requestPath);

    const headers = {
      'OK-ACCESS-KEY': ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'OK-ACCESS-PROJECT': PROJECT_ID,
    };

    const response = await fetch(`https://web3.okx.com${requestPath}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`检查授权失败: ${response.status}, ${errorText}`);
    }

    const data = await response.json();
    console.log('授权检查响应:', data);

    if (data.code === '0' && data.data && data.data[0]) {
      return data.data[0].isApproved;
    }
    
    throw new Error(data.msg || '检查授权失败');
  } catch (error) {
    console.error('检查授权出错:', error);
    throw error;
  }
};

// 直接调用合约进行兑换
const executeSwap = async (params) => {
  try {
    const timestamp = new Date().toISOString();
    const method = 'POST';
    const requestPath = '/api/v5/dex/aggregator/swap';
    
    const body = JSON.stringify({
      chainIndex: BSC_CONFIG.chainIndex,
      fromTokenAddress: params.fromTokenAddress,
      toTokenAddress: params.toTokenAddress,
      amount: params.amount,
      slippage: params.slippage || '1',
      swapMode: 'exactIn',
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20分钟后过期
    });

    const signature = generateSignature(timestamp, method, requestPath, body);

    const headers = {
      'OK-ACCESS-KEY': ACCESS_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': PASSPHRASE,
      'OK-ACCESS-PROJECT': PROJECT_ID,
      'Content-Type': 'application/json'
    };

    const response = await fetch(`${BASE_URL}/dex/aggregator/swap`, {
      method: 'POST',
      headers,
      body
    });

    const data = await response.json();
    if (data.code === '0') {
      return data.data[0];
    }
    throw new Error(data.msg || 'Failed to execute swap');
  } catch (error) {
    console.error('Error executing swap:', error);
    throw error;
  }
};

// BSC代币配置
const BSC_TOKENS = {
  BNB: {
    address: BSC_CONFIG.BNB,
    symbol: 'BNB',
    decimals: 18
  },
  WBNB: {
    address: BSC_CONFIG.WBNB,
    symbol: 'WBNB',
    decimals: 18
  },
  USDT: {
    address: BSC_CONFIG.USDT,
    symbol: 'USDT',
    decimals: 18
  },
  USDC: {
    address: BSC_CONFIG.USDC,
    symbol: 'USDC',
    decimals: 18
  }
};

// 统一导出
export {
  BSC_CONFIG,
  BSC_TOKENS,
  getQuote,
  sendSwapTransaction,
  checkAllowanceFromService,
  getApproveTransaction,
  executeSwap
}; 