import { ethers } from 'ethers';

export const getStoredWallet = () => {
    const storedWallet = localStorage.getItem('encryptedWallet');
    if (storedWallet) {
        return JSON.parse(storedWallet);
    }
    return null;
};

export const createWalletFromPrivateKey = (privateKey) => {
    try {
        return new ethers.Wallet(privateKey);
    } catch (error) {
        throw new Error('Invalid private key');
    }
};

export const validatePrivateKey = (privateKey) => {
    if (!privateKey.startsWith('0x')) {
        throw new Error('Private key must start with 0x');
    }
    if (privateKey.length !== 66) {
        throw new Error('Invalid private key length');
    }
    return true;
}; 