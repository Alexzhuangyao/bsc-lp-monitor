import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  Text,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  IconButton,
  Tooltip,
  useDisclosure,
  createIcon,
} from '@chakra-ui/react';
import { RepeatIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import { priceService } from '../utils/priceService';
import FastSwap from './FastSwap';
import { decryptData } from '../utils/encryption';

const ExchangeIcon = createIcon({
  displayName: 'ExchangeIcon',
  viewBox: '0 0 24 24',
  path: (
    <path
      fill="currentColor"
      d="M20 9H4l4-4v2h12V9zM4 15h16l-4 4v-2H4v-2z"
    />
  ),
});

// ERC20代币的ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

// BSC RPC节点
const BSC_RPC = 'https://bsc-dataseed.binance.org';

// 常见代币列表
const COMMON_TOKENS = {
  WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
};

function TokenBalance({ address }) {
  const [balances, setBalances] = useState({});
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [privateKey, setPrivateKey] = useState(null);

  // 在组件加载时获取私钥
  useEffect(() => {
    const loadPrivateKey = () => {
      const encryptedWallet = localStorage.getItem('encryptedWallet');
      if (encryptedWallet) {
        const decryptedWallet = decryptData(encryptedWallet);
        if (decryptedWallet && decryptedWallet.privateKey) {
          setPrivateKey(decryptedWallet.privateKey);
        }
      }
    };

    loadPrivateKey();
  }, []);

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setLoading(false);
      setBalances({});
      setPrices({});
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      
      // 获取BNB余额
      const bnbBalance = await provider.getBalance(address);
      const bnbFormatted = ethers.formatEther(bnbBalance);
      
      // 获取其他代币余额
      const balancePromises = Object.entries(COMMON_TOKENS).map(async ([name, tokenAddress]) => {
        try {
          const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
          const [balance, decimals, symbol] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals(),
            contract.symbol()
          ]);
          
          const formattedBalance = ethers.formatUnits(balance, decimals);
          return {
            name,
            symbol,
            balance: formattedBalance,
            address: tokenAddress
          };
        } catch (error) {
          console.error(`Error fetching ${name} balance:`, error);
          return {
            name,
            symbol: name,
            balance: '0',
            address: tokenAddress,
            error: true
          };
        }
      });

      const results = await Promise.all(balancePromises);
      const balanceMap = {
        BNB: {
          name: 'BNB',
          symbol: 'BNB',
          balance: bnbFormatted,
          address: COMMON_TOKENS.WBNB
        },
        ...results.reduce((acc, curr) => {
          acc[curr.name] = curr;
          return acc;
        }, {})
      };

      // 获取所有代币的价格
      const tokenAddresses = Object.values(balanceMap).map(token => token.address);
      const tokenPrices = await priceService.getTokenPrices(tokenAddresses);
      
      setPrices(tokenPrices);
      setBalances(balanceMap);
      setError(null);
    } catch (error) {
      console.error('Error fetching balances:', error);
      setError('Failed to fetch token balances');
      setBalances({});
      setPrices({});
    } finally {
      setLoading(false);
    }
  }, [address]);

  // 监听地址变化，重新获取余额
  useEffect(() => {
    if (address) {
      fetchBalances();
    } else {
      setBalances({});
      setPrices({});
      setLoading(false);
    }
  }, [address, fetchBalances]);

  const handleRefresh = () => {
    fetchBalances();
  };

  const formatUSDValue = (balance, tokenAddress) => {
    const price = prices[tokenAddress.toLowerCase()] || 0;
    const value = Number(balance) * price;
    return value.toFixed(2);
  };

  if (error) {
    return (
      <Box color="red.500" py={4}>
        <HStack justify="space-between" align="center">
          <Text>{error}</Text>
          <Tooltip label="Retry" placement="top">
            <IconButton
              icon={<RepeatIcon />}
              onClick={handleRefresh}
              size="sm"
              colorScheme="red"
              variant="ghost"
            />
          </Tooltip>
        </HStack>
      </Box>
    );
  }

  return (
    <Box>
      <VStack spacing={4} align="stretch">
        <HStack justify="space-between" align="center">
          <Text fontSize="lg" fontWeight="bold">Token Balances</Text>
          <HStack spacing={2}>
            <Tooltip label="Refresh balances" placement="top">
              <IconButton
                icon={<RepeatIcon />}
                onClick={handleRefresh}
                isLoading={loading}
                size="sm"
                aria-label="Refresh balances"
              />
            </Tooltip>
            <Tooltip label="Fast Swap" placement="top">
              <IconButton
                icon={<ExchangeIcon boxSize="20px" />}
                onClick={onOpen}
                size="sm"
                colorScheme="blue"
                aria-label="Fast Swap"
              />
            </Tooltip>
          </HStack>
        </HStack>
      
        {loading ? (
          <Box textAlign="center" py={4}>
            <Spinner />
          </Box>
        ) : (
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th>Token</Th>
                <Th isNumeric>Balance</Th>
                <Th isNumeric>Value (USDT)</Th>
              </Tr>
            </Thead>
            <Tbody>
              {Object.values(balances).map((token) => (
                <Tr key={token.name}>
                  <Td>{token.symbol}</Td>
                  <Td isNumeric>{Number(token.balance).toFixed(6)}</Td>
                  <Td isNumeric>${formatUSDValue(token.balance, token.address)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </VStack>

      <FastSwap 
        isOpen={isOpen} 
        onClose={onClose} 
        walletAddress={address}
        privateKey={privateKey}
      />
    </Box>
  );
}

export default TokenBalance; 