const express = require('express');
const cors = require('cors');
const { Web3 } = require('web3');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from project root
dotenv.config({ path: path.join(__dirname, '../../.env') });

// 添加调试信息
console.log('环境变量加载情况:', {
    BSC_RPC_NODE_1: process.env.BSC_RPC_NODE_1,
    BSC_RPC_NODE_2: process.env.BSC_RPC_NODE_2,
    BSC_RPC_NODE_3: process.env.BSC_RPC_NODE_3
});

// 从环境变量获取RPC节点配置
const BSC_RPC_NODES = [
    process.env.BSC_RPC_NODE_1 || 'https://bsc.publicnode.com',
    process.env.BSC_RPC_NODE_2,
    process.env.BSC_RPC_NODE_3
].filter(Boolean); // 过滤掉未定义的值

if (BSC_RPC_NODES.length === 0) {
    console.error('错误: 未配置任何BSC RPC节点。请在.env文件中设置至少一个RPC节点。');
    process.exit(1);
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// PancakeSwap V3 Contract Addresses
const PANCAKE_V3_ADDRESSES = {
    // Core contracts
    factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    poolDeployer: '0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9',
    
    // Periphery contracts
    swapRouter: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    v3Migrator: '0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2',
    nonfungiblePositionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    quoterV2: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
    tickLens: '0x9a489505a00cE272eAa5e07Dba6491314CaE3796',
    pancakeInterfaceMulticall: '0xac1cE734566f390A94b00eb9bf561c2625BF44ea',
    
    // Smart Router
    smartRouter: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
    
    // MasterChef V3
    masterChefV3: '0x556B9306565093C855AEA9AE92A594704c2Cd59e'
}; 

// PancakeSwap V3 Factory ABI
const FACTORY_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "tokenA", "type": "address"},
            {"internalType": "address", "name": "tokenB", "type": "address"},
            {"internalType": "uint24", "name": "fee", "type": "uint24"}
        ],
        "name": "getPool",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    }
];

// Complete PancakeSwap V3 Pool ABI
const POOL_V3_ABI = [
    {
        "inputs": [],
        "name": "slot0",
        "outputs": [
            {"internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160"},
            {"internalType": "int24", "name": "tick", "type": "int24"},
            {"internalType": "uint16", "name": "observationIndex", "type": "uint16"},
            {"internalType": "uint16", "name": "observationCardinality", "type": "uint16"},
            {"internalType": "uint16", "name": "observationCardinalityNext", "type": "uint16"},
            {"internalType": "uint8", "name": "feeProtocol", "type": "uint8"},
            {"internalType": "bool", "name": "unlocked", "type": "bool"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "token0",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "token1",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "fee",
        "outputs": [{"internalType": "uint24", "name": "", "type": "uint24"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "liquidity",
        "outputs": [{"internalType": "uint128", "name": "", "type": "uint128"}],
        "stateMutability": "view",
        "type": "function"
    }
];

// Add ERC20 ABI for token balance checking
const ERC20_ABI = [
    {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
    },
    {
        "constant": true,
        "inputs": [],
        "name": "symbol",
        "outputs": [{"name": "", "type": "string"}],
        "type": "function"
    }
];

// Rate limiter implementation
class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.tokens = maxRequests;
        this.lastRefill = Date.now();
    }

    async getToken() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = Math.floor(timePassed * (this.maxRequests / this.timeWindow));

        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.maxRequests, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }

        if (this.tokens > 0) {
            this.tokens--;
            return true;
        }

        // Calculate wait time
        const waitTime = Math.ceil((this.timeWindow / this.maxRequests) - timePassed);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.getToken();
    }
}

let currentNodeIndex = 0;

// Initialize Web3 with provider options
function createWeb3Instance() {
    const options = {
        timeout: 30000, // 30 seconds
        reconnect: {
            auto: true,
            delay: 5000,
            maxAttempts: 5,
            onTimeout: false
        },
        keepAlive: true
    };
    
    const provider = new Web3.providers.HttpProvider(BSC_RPC_NODES[currentNodeIndex], options);
    return new Web3(provider);
}

let web3 = createWeb3Instance(); 

// Helper function to switch to next node
async function switchToNextNode() {
    try {
        currentNodeIndex = (currentNodeIndex + 1) % BSC_RPC_NODES.length;
        console.log(`Switching to BSC node: ${BSC_RPC_NODES[currentNodeIndex]}`);
        web3 = createWeb3Instance();
        
        // Test the new connection
        await web3.eth.getBlockNumber();
        console.log('Successfully connected to new node');
        return true;
    } catch (error) {
        console.error('Failed to switch node:', error);
        return false;
    }
}

// Common token addresses
const COMMON_TOKENS = {
    USDT: '0x55d398326f99059fF775485246999027B3197955',  // BSC USDT Address
    BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'  // BSC BNB Address
};

const BINANCE_ALPHA_TOKEN = {
    ZKJ:        '0xc71b5f631354be6853efe9c3ab6b9590f8302e81',
    MERL:       '0xa0c56a8c0692bd10b3fa8f8ba79cf5332b7107f9',
    KOGE:       '0xe6df05ce8c8301223373cf5b969afcb1498c5528',
    XTER:       '0x103071da56e7cd95b415320760d6a0ddc4da1ca5',
    B:          '0x6bdcce4a559076e37755a78ce0c06214e59e4444',
    RWA:        '0x9c8b5ca345247396bdfac0395638ca9045c6586e',
    B2:         '0x783c3f003f172c6ac5ac700218a357d2d66ee2a2',
    PORT3:      '0xb4357054c3da8d46ed642383f03139ac7f090343',
    FHE:        '0xd55c9fb62e176a8eb6968f32958fefdd0962727e',
    BR:         '0xff7d6a96ae471bbcd7713af9cb1feeb16cf56b41',
    SOON:       '0xb9e1fd5a02d3a33b25a14d661414e6ed6954a721',
    BANK:       '0x3aee7602b612de36088f3ffed8c8f10e86ebf2bf',
    PUFFER:     '0x87d00066cf131ff54b72b134a217d5401e5392b6',
    SKYAI:      '0x92aa03137385f18539301349dcfc9ebc923ffb10',
    AIOT:       '0x55ad16bd573b3365f43a9daeb0cc66a73821b4a5',
    AGT:        '0x5dbde81fce337ff4bcaaee4ca3466c00aecae274',
    TAIKO:      '0x30C60b20C25b2810cA524810467A0c342294FC61',
    AFT:        '0xabd834a7823567673e1ac07635d5d9857b34a8d3',
    REX:        '0x90869b3a42e399951bd5f5ff278b8cc5ee1dc0fe',
    SIREN:      '0x997a58129890bbda032231a52ed1ddc845fc18e1',
    OBT:        '0xcef5b397051fc92026249670e918c0ad7b8585e4',
    RDO:        '0xd86e6ef14b96d942ef0abf0720c549197ea8c528',
    ELDE:       '0x799a290f9cc4085a0ce5b42b5f2c30193a7a872b',
    MYX:        '0xd82544bf0dfe8385ef8fa34d67e6e4940cc63e16',
    ASRR:       '0xf7626c7ff7b778aaf187d508d056a9398d9545d1',
    TGT:        '0x6c58e4a513d3a8062e57f41a1442e003af14ebb5',
    BOB:        '0x51363f073b1e4920fda7aa9e9d84ba97ede1560e',
    PRAI:       '0x899357e54c2c4b014ea50a9a7bf140ba6df2ec73',
    EPT:        '0x3dc8e2d80b6215a1bccae4d38715c3520581e77c',
    BOOP:       '0x9a70815dfb644a24b57358e1041f8d0324c8f6e1',
    VINU:       '0xfebe8c1ed424dbf688551d4e2267e7a53698f0aa',
    KILO:       '0x503fa24b7972677f00c4618e5fbe237780c1df53',
    BUBB:       '0xd5369a3cac0f4448a9a96bb98af9c887c92fc37b',
    gorilla:    '0xcf640fdf9b3d9e45cbd69fda91d7e22579c14444',
    Jager:      '0x74836cc0e821a6be18e407e6388e430b689c66e9',
    KOMA:       '0xd5eaaac47bd1993d661bc087e15dfb079a7f3c19',
    DONKEY:     '0xa49fa5e8106e2d6d6a69e78df9b6a20aab9c4444',
    WHY:        '0x9ec02756a559700d8d9e79ece56809f7bcc5dc27',
    AGON:       '0x3ca729bfd4bbad155f072752510226b37a5b7723',
    DOOD:       '0x722294f6c97102fb0ddb5b907c8d16bdeab3f6d9',
    AITECH:     '0x2d060ef4d6bf7f9e5edde373ab735513c0e4f944',
    Broccoli:   '0x12b4356c65340fb02cdff01293f95febb1512f3b',
    TOKEN:      '0x4507cef57c46789ef8d1a19ea45f4216bae2b528',
    GM:         '0xd8002d4bd1d50136a731c141e3206d516e6d3b3d',
    quq:        '0x4fa7c69a7b69f8bc48233024d546bc299d6b03bf',
    AVL:        '0x9beee89723ceec27d7c2834bec6834208ffdc202',
    Mubarakah:  '0x3199a64bc8aabdfd9a3937a346cc59c3d81d8a9a',
    APX:        '0x78f5d389f5cdccfc41594abab4b0ed02f31398b3',
    BNBCard:    '0xdc06717f367e57a16e06cce0c4761604460da8fc',
    FAIR3:      '0x6952c5408b9822295ba4a7e694d0c5ffdb8fe320',
    BROCCOLI:   '0x23d3f4eaaa515403c6765bb623f287a8cca28f2b',
    CKP:        '0x2b5d9adea07b590b638ffc165792b2c610eda649',
    FROG:       '0x4ad663403df2f0e7987bc9c74561687472e1611c',
    PUMP:       '0xb7c0007ab75350c582d5eab1862b872b5cf53f0c',
    TAT:        '0x996d1b997203a024e205069a304161ba618d1c61',
    BNBXBT:     '0xa18bbdcd86e4178d10ecd9316667cfe4c4aa8717',
    BID:        '0xa1832f7f4e534ae557f9b5ab76de54b1873e498b',
    Ghibli:     '0x795d2710e383f33fbebe980a155b29757b6703f3',
    PERRY:      '0x5043f271095350c5ac7db2384a0d9337e27c1055',
    AICell:     '0xde04da55b74435d7b9f2c5c62d9f1b53929b09aa',
    MGP:        '0xd06716e1ff2e492cc5034c2e81805562dd3b45fa',
    MILK:       '0x7b4bf9feccff207ef2cb7101ceb15b8516021acd'
}

// Fee tiers in PancakeSwap V3
const FEE_TIERS = {
    LOWEST: 100,    // 0.01%
    LOW: 500,       // 0.05%
    MEDIUM: 2500,   // 0.25%
    HIGH: 10000     // 1%
}; 

// Helper function to retry contract calls
async function retryContractCall(call, maxRetries = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await call();
            return result;
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                const delay = attempt * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                await switchToNextNode();
            }
        }
    }
    throw lastError;
}

// Function to safely get pool data
async function getPoolData(poolAddress) {
    try {
        console.log(`Getting pool data for ${poolAddress}...`);
        const poolContract = new web3.eth.Contract(POOL_V3_ABI, poolAddress);
        
        // Get basic pool info with retry mechanism
        let token0Address, token1Address, fee;
        try {
            console.log('Fetching basic pool info...');
            [token0Address, token1Address, fee] = await Promise.all([
                retryContractCall(() => poolContract.methods.token0().call()),
                retryContractCall(() => poolContract.methods.token1().call()),
                retryContractCall(() => poolContract.methods.fee().call())
            ]);
            console.log('Basic pool info:', { token0Address, token1Address, fee });
        } catch (error) {
            console.error('Error getting basic pool info:', error);
            return null;
        }

        // Get token info
        console.log('Fetching token info...');
        const [token0Info, token1Info] = await Promise.all([
            getTokenInfo(token0Address),
            getTokenInfo(token1Address)
        ]);
        console.log('Token info:', { token0Info, token1Info });

        // Get slot0 data with raw call to avoid decoding issues
        let sqrtPriceX96 = '0';
        let tick = 0;
        try {
            console.log('Fetching slot0 data...');
            const slot0Result = await web3.eth.call({
                to: poolAddress,
                data: poolContract.methods.slot0().encodeABI()
            });
            
            if (slot0Result && slot0Result.length >= 130) {
                // Manually decode the raw response
                const sqrtPriceHex = slot0Result.slice(2, 66);
                const tickHex = slot0Result.slice(66, 130);
                console.log('Raw slot0 data:', { sqrtPriceHex, tickHex });

                try {
                    sqrtPriceX96 = web3.utils.toBigInt('0x' + sqrtPriceHex).toString();
                } catch (error) {
                    console.error('Error converting sqrtPrice:', error);
                    sqrtPriceX96 = '0';
                }

                try {
                    // Handle negative numbers for tick
                    const tickBigInt = web3.utils.toBigInt('0x' + tickHex);
                    // Convert to number safely handling negative values
                    // If the number is negative (has the sign bit set)
                    if (tickBigInt > BigInt(8388607)) { // 2^23 - 1
                        // Calculate two's complement
                        tick = Number(tickBigInt - BigInt(16777216)); // 2^24
                    } else {
                        tick = Number(tickBigInt);
                    }
                    console.log('Tick conversion:', { tickBigInt: tickBigInt.toString(), tick });
                } catch (error) {
                    console.error('Error converting tick:', error);
                    tick = 0;
                }
            } else {
                console.error('Invalid slot0 result:', slot0Result);
            }
            console.log('Decoded slot0 data:', { sqrtPriceX96, tick });
        } catch (error) {
            console.error('Error getting slot0 data:', error);
        }

        // Get liquidity data separately with retry
        let liquidity = '0';
        try {
            console.log('Fetching liquidity data...');
            liquidity = await retryContractCall(() => poolContract.methods.liquidity().call());
            console.log('Liquidity:', liquidity);
        } catch (error) {
            console.error('Error getting liquidity:', error);
        }

        // Calculate current price from sqrtPriceX96
        let price = 0;
        try {
            console.log('Calculating price...');
            if (sqrtPriceX96 !== '0') {
                const sqrtPriceBigInt = BigInt(sqrtPriceX96);
                const base = BigInt(1000000); // 1e6
                const denominator = BigInt(2) ** BigInt(192);
                
                console.log('Price calculation values:', {
                    sqrtPriceBigInt: sqrtPriceBigInt.toString(),
                    base: base.toString(),
                    denominator: denominator.toString()
                });

                const rawPrice = (sqrtPriceBigInt * sqrtPriceBigInt * base) / denominator;
                price = Number(rawPrice) / 1000000;
                
                // Adjust price based on token decimals
                if (token0Info.decimals !== token1Info.decimals) {
                    const decimalAdjustment = Math.pow(10, token1Info.decimals - token0Info.decimals);
                    price = price / decimalAdjustment;
                }
                console.log('Calculated price:', price);
            }
        } catch (error) {
            console.error('Error calculating price:', error);
            console.error('Price calculation values:', {
                sqrtPriceX96,
                token0Decimals: token0Info.decimals,
                token1Decimals: token1Info.decimals
            });
        }

        // Get token symbols
        const token0Symbol = Object.entries(BINANCE_ALPHA_TOKEN)
            .find(([_, address]) => address.toLowerCase() === token0Address.toLowerCase())?.[0] ||
            Object.entries(COMMON_TOKENS)
            .find(([_, address]) => address.toLowerCase() === token0Address.toLowerCase())?.[0] ||
            token0Info.symbol;

        const token1Symbol = Object.entries(BINANCE_ALPHA_TOKEN)
            .find(([_, address]) => address.toLowerCase() === token1Address.toLowerCase())?.[0] ||
            Object.entries(COMMON_TOKENS)
            .find(([_, address]) => address.toLowerCase() === token1Address.toLowerCase())?.[0] ||
            token1Info.symbol;

        const poolData = {
            address: poolAddress,
            token0: {
                address: token0Address,
                symbol: token0Symbol,
                decimals: token0Info.decimals
            },
            token1: {
                address: token1Address,
                symbol: token1Symbol,
                decimals: token1Info.decimals
            },
            feeTier: parseInt(fee),
            liquidity: liquidity.toString(),
            sqrtPriceX96: sqrtPriceX96,
            tick: tick,
            price,
            lastUpdate: Date.now()
        };

        console.log('Final pool data:', poolData);
        return poolData;
    } catch (error) {
        console.error('Error getting pool data:', error);
        return null;
    }
}

// Function to get token info with retries
async function getTokenInfo(tokenAddress) {
    try {
        const tokenContract = new web3.eth.Contract(ERC20_ABI, tokenAddress);
        
        // Get symbol with retry
        let symbol = 'UNKNOWN';
        try {
            symbol = await retryContractCall(() => tokenContract.methods.symbol().call());
        } catch (error) {
            console.error('Error getting token symbol:', error);
        }

        // Get decimals with retry
        let decimals = 18;
        try {
            decimals = parseInt(await retryContractCall(() => tokenContract.methods.decimals().call())) || 18;
        } catch (error) {
            console.error('Error getting token decimals:', error);
        }

        return { symbol, decimals };
    } catch (error) {
        console.error('Error getting token info:', error);
        return { symbol: 'UNKNOWN', decimals: 18 };
    }
}

// Function to get pool address
async function getPoolAddress(token0Address, token1Address, fee) {
    try {
        const factoryContract = new web3.eth.Contract(FACTORY_ABI, PANCAKE_V3_ADDRESSES.factory);
        
        // Sort token addresses to match PancakeSwap's ordering
        const [tokenA, tokenB] = token0Address.toLowerCase() < token1Address.toLowerCase() 
            ? [token0Address, token1Address] 
            : [token1Address, token0Address];
        
        // Get pool address with retry mechanism
        const poolAddress = await retryContractCall(() => 
            factoryContract.methods.getPool(tokenA, tokenB, fee).call()
        );

        if (poolAddress === '0x0000000000000000000000000000000000000000') {
            console.log(`No pool found for ${tokenA}/${tokenB} with fee ${fee}`);
            return null;
        }

        return poolAddress;
    } catch (error) {
        console.error('Error getting pool address:', error);
        return null;
    }
}

// Constants for caching and updates
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 5; // Number of pools to process in parallel
const BATCH_DELAY = 500; // Delay between batches in milliseconds

// Initialize pool cache
const poolCache = new Map();

// Function to refresh pool data
async function refreshPoolData() {
    console.log('Starting to fetch all pool combinations...');
    const timestamp = Date.now();
    const pools = [];

    try {
        const whitelistedTokens = Object.values(BINANCE_ALPHA_TOKEN);
        const commonTokens = Object.values(COMMON_TOKENS);
        const feeTiers = [100, 500, 2500, 10000];

        console.log(`Checking ${whitelistedTokens.length} whitelisted tokens with ${commonTokens.length} common tokens across ${feeTiers.length} fee tiers`);

        // Process pools in smaller batches
        const combinations = [];

        // Generate all combinations
        for (const token0 of whitelistedTokens) {
            for (const token1 of commonTokens) {
                if (token0.toLowerCase() === token1.toLowerCase()) continue;
                for (const fee of feeTiers) {
                    combinations.push({ token0, token1, fee });
                }
            }
        }

        // Process combinations in batches
        for (let i = 0; i < combinations.length; i += BATCH_SIZE) {
            const batch = combinations.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(async ({ token0, token1, fee }) => {
                try {
                    console.log(`Checking pool: ${token0}/${token1} with fee ${fee}`);
                    const poolAddress = await getPoolAddress(token0, token1, fee);
                    
                    if (poolAddress) {
                        console.log(`Found pool at ${poolAddress}, fetching data...`);
                        const poolData = await getPoolData(poolAddress);
                        if (poolData && poolData.liquidity !== '0') {
                            const key = `${poolData.token0.address}-${poolData.token1.address}-${poolData.feeTier}`;
                            poolData.key = key;
                            pools.push(poolData);
                            
                            // Update cache
                            poolCache.set(poolAddress, {
                                data: poolData,
                                timestamp,
                                key
                            });
                            
                            console.log(`Added pool: ${poolAddress} - ${poolData.token0.symbol}/${poolData.token1.symbol} (${fee})`);
                        } else {
                            console.log(`Skipping pool ${poolAddress} due to zero liquidity or failed data fetch`);
                        }
                    }
                } catch (error) {
                    console.error(`Error processing pool combination:`, error);
                }
            });

            // Wait for batch to complete
            await Promise.all(batchPromises);
            
            // Add a small delay between batches
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }

        console.log(`Refreshed data for ${poolCache.size} unique pools (deduplicated from ${pools.length} total pools)`);
        return Array.from(poolCache.values()).map(entry => entry.data);
    } catch (error) {
        console.error('Error refreshing pool data:', error);
        return [];
    }
}


// API endpoint for getting all pools
app.get('/api/pools', async (req, res) => {
    try {
        // Convert poolCache Map to array of pool data
        const pools = Array.from(poolCache.values())
            .map(entry => entry.data)
            .filter(pool => pool != null);

        res.json({
            timestamp: Date.now(),
            poolCount: pools.length,
            pools: pools || [] // Ensure pools is always an array
        });
    } catch (error) {
        console.error('Error getting pools from cache:', error);
        res.status(500).json({ 
            error: 'Failed to fetch pools',
            message: error.message,
            pools: [] // Return empty array on error
        });
    }
});

// Get specific pool data
app.get('/api/pool/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const now = Date.now();
        const cached = poolCache.get(address);

        if (cached && now - cached.timestamp < CACHE_DURATION) {
            res.json(cached.data);
        } else {
            const poolData = await getPoolData(address);
            if (poolData) {
                poolCache.set(address, {
                    data: poolData,
                    timestamp: now,
                    key: getPoolKey(poolData.token0.address, poolData.token1.address, poolData.feeTier)
                });
                res.json(poolData);
            } else {
                res.status(404).json({ error: 'Pool not found' });
            }
        }
    } catch (error) {
        console.error('Error fetching pool:', error);
        res.status(500).json({ error: 'Failed to fetch pool data' });
    }
});

// Start server
const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    // Initial data fetch
    refreshPoolData();
}); 


// Start initial data fetch
refreshPoolData().catch(console.error);

// Schedule regular updates
setInterval(refreshPoolData, UPDATE_INTERVAL);