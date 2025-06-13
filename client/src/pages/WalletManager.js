import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  VStack,
  Heading,
  Input,
  Button,
  Text,
  useToast,
  FormControl,
  FormLabel,
  InputGroup,
  InputRightElement,
  IconButton,
  Alert,
  AlertIcon,
  HStack,
  Divider,
  Link,
  Tooltip,
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon, ArrowBackIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import TokenBalance from '../components/TokenBalance';
import LPPositions from '../components/LPPositions';
import { encryptData, decryptData } from '../utils/encryption';

function WalletManager() {
  const navigate = useNavigate();
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [isWeb3Available, setIsWeb3Available] = useState(false);
  const toast = useToast();

  // 添加自动刷新逻辑
  useEffect(() => {
    // 30分钟的毫秒数
    const REFRESH_INTERVAL = 30 * 60 * 1000;
    
    // 设置定时器
    const refreshTimer = setInterval(() => {
      // 显示刷新提示
      toast({
        title: "Refreshing page",
        description: "Auto-refreshing page to keep data up to date",
        status: "info",
        duration: 3000,
        isClosable: true,
      });
      
      // 延迟1秒后刷新，让用户能看到提示
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }, REFRESH_INTERVAL);

    // 清理定时器
    return () => {
      clearInterval(refreshTimer);
    };
  }, [toast]);

  // 在组件加载时尝试恢复缓存的钱包信息
  useEffect(() => {
    const loadCachedWallet = () => {
      const encryptedWallet = localStorage.getItem('encryptedWallet');
      if (encryptedWallet) {
        const decryptedWallet = decryptData(encryptedWallet);
        if (decryptedWallet) {
          setWalletInfo(decryptedWallet);
          setPrivateKey(decryptedWallet.privateKey);
        }
      }
    };

    loadCachedWallet();

    // Check for Web3 availability
    const checkWeb3 = () => {
      if (typeof window.ethereum !== 'undefined') {
        setIsWeb3Available(true);
      } else {
        setIsWeb3Available(false);
      }
    };

    checkWeb3();
    
    // Handle ethereum injection
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', checkWeb3);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', checkWeb3);
      }
    };
  }, []);

  const handleImportWallet = async () => {
    try {
      // 验证私钥格式
      if (!privateKey.startsWith('0x')) {
        throw new Error('Private key must start with 0x');
      }
      if (privateKey.length !== 66) {
        throw new Error('Invalid private key length');
      }

      // 创建钱包实例
      const wallet = new ethers.Wallet(privateKey);
      
      // 获取钱包信息
      const address = await wallet.getAddress();
      
      const walletData = {
        address,
        privateKey: wallet.privateKey,
      };

      // 加密存储钱包信息
      const encryptedWallet = encryptData(walletData);
      if (encryptedWallet) {
        // 先清除旧的钱包信息
        localStorage.removeItem('encryptedWallet');
        
        // 保存新的钱包信息
        localStorage.setItem('encryptedWallet', encryptedWallet);
        
        // 更新状态
        setWalletInfo(walletData);

        toast({
          title: 'Wallet imported successfully',
          description: `Address: ${address}`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        throw new Error('Failed to encrypt wallet data');
      }
    } catch (error) {
      toast({
        title: 'Error importing wallet',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleClearWallet = () => {
    localStorage.removeItem('encryptedWallet');
    setWalletInfo(null);
    setPrivateKey('');
    toast({
      title: 'Wallet cleared',
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <IconButton
            icon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            variant="ghost"
            aria-label="Back to home"
            size="lg"
          />
          <Heading size="lg">Wallet Manager</Heading>
          <Box w={10} /> {/* 为了保持标题居中的占位元素 */}
        </HStack>
        
        {walletInfo ? (
          <Box borderWidth={1} borderRadius="lg" p={4}>
            <VStack align="stretch" spacing={4}>
              <Alert status="success">
                <AlertIcon />
                Wallet connected
              </Alert>
              <HStack>
                <Text><strong>Address:</strong> {walletInfo.address}</Text>
                <Tooltip label="View on BSCScan" placement="top">
                  <Link
                    href={`https://bscscan.com/address/${walletInfo.address}`}
                    isExternal
                    ml={2}
                  >
                    <IconButton
                      icon={<ExternalLinkIcon />}
                      size="sm"
                      variant="ghost"
                      aria-label="View on BSCScan"
                    />
                  </Link>
                </Tooltip>
              </HStack>
              <Button colorScheme="red" onClick={handleClearWallet}>
                Clear Wallet
              </Button>
              
              <Divider my={2} />
              
              <Box>
                <TokenBalance address={walletInfo.address} />
              </Box>
              
              <Divider my={2} />
              
              <Box>
                <LPPositions walletAddress={walletInfo.address} privateKey={walletInfo.privateKey} />
              </Box>
            </VStack>
          </Box>
        ) : (
          <Box borderWidth={1} borderRadius="lg" p={4}>
            <form onSubmit={(e) => { e.preventDefault(); handleImportWallet(); }}>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel>Import Private Key</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPrivateKey ? "text" : "password"}
                      placeholder="Enter your private key (0x...)"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                    />
                    <InputRightElement>
                      <IconButton
                        icon={showPrivateKey ? <ViewOffIcon /> : <ViewIcon />}
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        variant="ghost"
                        aria-label={showPrivateKey ? "Hide private key" : "Show private key"}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>
                <Button type="submit" colorScheme="blue" width="full">
                  Import
                </Button>
              </VStack>
            </form>
          </Box>
        )}

        {!isWeb3Available && (
          <Text color="red.500">
            No Web3 wallet detected. Please install MetaMask or another Web3 wallet.
          </Text>
        )}
      </VStack>
    </Container>
  );
}

export default WalletManager; 