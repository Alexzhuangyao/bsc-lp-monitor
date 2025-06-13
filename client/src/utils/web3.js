import { Web3 } from 'web3';

let web3Instance = null;

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