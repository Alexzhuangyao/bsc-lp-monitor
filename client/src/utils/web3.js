import { Web3 } from 'web3';
import { UNICHAIN_CONFIG } from '../services/uniswapService';

let web3Instance = null;

// Unichain网络配置
const UNICHAIN_NETWORK = {
    chainId: '0x82', // 十六进制的130
    chainName: 'Unichain Mainnet',
    nativeCurrency: {
        name: 'ETH',
        symbol: 'ETH',
        decimals: 18
    },
    rpcUrls: [UNICHAIN_CONFIG.rpcUrl],
    blockExplorerUrls: [UNICHAIN_CONFIG.explorerUrl]
};

export const initWeb3 = () => {
    if (typeof window === 'undefined') return null;

    // 防止重复定义 ethereum
    if (!window.ethereum && !Object.getOwnPropertyDescriptor(window, 'ethereum')) {
        Object.defineProperty(window, 'ethereum', {
            value: null,
            writable: true,
            configurable: true
        });
    }

    if (window.ethereum) {
        web3Instance = new Web3(window.ethereum);
        return web3Instance;
    }

    return null;
};

export const getWeb3 = () => {
    if (!web3Instance) {
        return initWeb3();
    }
    return web3Instance;
};

// 检查钱包是否已连接
export const isWalletConnected = async () => {
    try {
        const web3 = getWeb3();
        if (!web3) return false;
        
        const accounts = await web3.eth.getAccounts();
        return accounts.length > 0;
    } catch (error) {
        console.error('Error checking wallet connection:', error);
        return false;
    }
};

// 请求连接钱包
export const connectWallet = async () => {
    try {
        if (!window.ethereum) {
            throw new Error('No Web3 wallet found');
        }

        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        return accounts[0];
    } catch (error) {
        console.error('Error connecting wallet:', error);
        throw error;
    }
};

// 切换到 Unichain 网络
export const switchToUnichainNetwork = async () => {
    try {
        if (!window.ethereum) {
            throw new Error('No Web3 wallet found');
        }

        try {
            // 尝试切换到 Unichain 网络
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: UNICHAIN_NETWORK.chainId }],
            });
        } catch (switchError) {
            // 如果错误代码是 4902，说明需要添加网络
            if (switchError.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [UNICHAIN_NETWORK],
                    });
                } catch (addError) {
                    console.error('Failed to add Unichain network:', addError);
                    throw addError;
                }
            } else {
                console.error('Failed to switch to Unichain network:', switchError);
                throw switchError;
            }
        }

        return true;
    } catch (error) {
        console.error('Error switching to Unichain network:', error);
        throw error;
    }
};

// 检查当前网络是否是 Unichain
export const checkIsUnichainNetwork = async () => {
    try {
        if (!window.ethereum) {
            throw new Error('No Web3 wallet found');
        }

        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        return chainId === UNICHAIN_NETWORK.chainId;
    } catch (error) {
        console.error('Error checking network:', error);
        return false;
    }
}; 