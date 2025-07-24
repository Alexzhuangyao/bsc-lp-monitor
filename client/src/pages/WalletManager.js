import React, { useState, useEffect } from 'react';
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
import { ViewIcon, ViewOffIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import TokenBalance from '../components/TokenBalance';
import LPPositions from '../components/LPPositions';
import { encryptData, decryptData } from '../utils/encryption';
import { switchToUnichainNetwork, checkIsUnichainNetwork } from '../utils/web3';
import { UNICHAIN_CONFIG } from '../services/uniswapService';

function WalletManager() {
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [walletInfo, setWalletInfo] = useState(null);
  const [isWeb3Available, setIsWeb3Available] = useState(false);
  const [isUnichainNetwork, setIsUnichainNetwork] = useState(false);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const toast = useToast();

  // 添加自动刷新逻辑
  useEffect(() => {
    // 30分钟的毫秒数
    const REFRESH_INTERVAL = 30 * 60 * 1000;
    
    // 设置定时器
    const refreshTimer = setInterval(() => {
      // 显示刷新提示
      toast({
        title: "页面刷新",
        description: "自动刷新页面以保持数据最新",
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

    // Check for Web3 availability and network
    const checkWeb3AndNetwork = async () => {
      if (typeof window.ethereum !== 'undefined') {
        setIsWeb3Available(true);
        const isUnichain = await checkIsUnichainNetwork();
        setIsUnichainNetwork(isUnichain);
      } else {
        setIsWeb3Available(false);
      }
    };

    checkWeb3AndNetwork();
    
    // Handle ethereum injection and chain changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', checkWeb3AndNetwork);
      window.ethereum.on('chainChanged', checkWeb3AndNetwork);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', checkWeb3AndNetwork);
        window.ethereum.removeListener('chainChanged', checkWeb3AndNetwork);
      }
    };
  }, []);

  const handleSwitchNetwork = async () => {
    try {
      setSwitchingNetwork(true);
      await switchToUnichainNetwork();
      setIsUnichainNetwork(true);
      toast({
        title: "网络切换成功",
        description: "已连接到Unichain网络",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "网络切换失败",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSwitchingNetwork(false);
    }
  };

  const handleImportWallet = async () => {
    try {
      // 验证私钥格式
      if (!privateKey.startsWith('0x')) {
        throw new Error('私钥必须以0x开头');
      }
      if (privateKey.length !== 66) {
        throw new Error('私钥长度无效');
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
          title: '钱包导入成功',
          description: `地址: ${address}`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      } else {
        throw new Error('加密钱包数据失败');
      }
    } catch (error) {
      toast({
        title: '导入钱包出错',
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
      title: '钱包已清除',
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  return (
    <Container maxW="container.md" py={8}>
      <VStack spacing={6} align="stretch">
        <HStack justify="space-between" align="center">
          <Heading size="lg">钱包管理</Heading>
          {isWeb3Available && (
            <Button
              colorScheme={isUnichainNetwork ? "green" : "orange"}
              size="sm"
              onClick={handleSwitchNetwork}
              isLoading={switchingNetwork}
              isDisabled={isUnichainNetwork}
            >
              {isUnichainNetwork ? "已连接Unichain" : "切换到Unichain"}
            </Button>
          )}
        </HStack>
        
        {walletInfo ? (
          <Box borderWidth={1} borderRadius="lg" p={4}>
            <VStack align="stretch" spacing={4}>
              <Alert status="success">
                <AlertIcon />
                钱包已连接
              </Alert>
              <HStack>
                <Text><strong>地址:</strong> {walletInfo.address}</Text>
                <Tooltip label="在区块浏览器中查看" placement="top">
                  <Link
                    href={`${UNICHAIN_CONFIG.explorerUrl}/address/${walletInfo.address}`}
                    isExternal
                    ml={2}
                  >
                    <IconButton
                      icon={<ExternalLinkIcon />}
                      size="sm"
                      variant="ghost"
                      aria-label="在区块浏览器中查看"
                    />
                  </Link>
                </Tooltip>
              </HStack>
              <Button colorScheme="red" onClick={handleClearWallet}>
                清除钱包
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
                  <FormLabel>导入私钥</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPrivateKey ? "text" : "password"}
                      placeholder="输入您的私钥 (0x...)"
                      value={privateKey}
                      onChange={(e) => setPrivateKey(e.target.value)}
                    />
                    <InputRightElement>
                      <IconButton
                        icon={showPrivateKey ? <ViewOffIcon /> : <ViewIcon />}
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        variant="ghost"
                        aria-label={showPrivateKey ? "隐藏私钥" : "显示私钥"}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>
                <Button type="submit" colorScheme="blue" width="full">
                  导入
                </Button>
              </VStack>
            </form>
          </Box>
        )}

        {!isWeb3Available && (
          <Text color="red.500">
            未检测到Web3钱包。请安装MetaMask或其他Web3钱包。
          </Text>
        )}
      </VStack>
    </Container>
  );
}

export default WalletManager; 