import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  VStack,
  HStack,
  Text,
  Input,
  Select,
  useToast,
  Box,
  Card,
  CardBody,
  Link,
  IconButton,
} from '@chakra-ui/react';
import { ArrowDownIcon, ExternalLinkIcon, RepeatIcon } from '@chakra-ui/icons';
import { ethers } from 'ethers';
import { 
  getQuote, 
  UNICHAIN_TOKENS,
  getSwapRoute,
  UNICHAIN_CONFIG,
  approveToken,
  checkAllowance as checkAllowanceService
} from '../services/uniswapService';
import { debounce } from 'lodash';

// ERC20代币ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];

function FastSwap({ isOpen, onClose, walletAddress, privateKey }) {
  const [fromToken, setFromToken] = useState('NATIVE');
  const [toToken, setToToken] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [approving, setApproving] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [fromTokenBalance, setFromTokenBalance] = useState('0');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const toast = useToast();

  // 自动获取报价的防抖处理
  const debouncedFetchQuote = useCallback(
    (amount, fromToken, toToken) => {
      if (!amount || amount <= 0 || !fromToken || !toToken) {
        console.log('跳过报价查询 - 无效参数:', { amount, fromToken, toToken });
        return;
      }

      const fetchQuote = async () => {
        try {
          setLoading(true);
          console.log('获取Uniswap报价，参数:', { fromToken, toToken, amount });
          
          const fromTokenInfo = UNICHAIN_TOKENS[fromToken];
          const toTokenInfo = UNICHAIN_TOKENS[toToken];
          const amountInWei = ethers.parseUnits(amount, fromTokenInfo.decimals).toString();

          const quoteResult = await getQuote({
            fromTokenAddress: fromTokenInfo.address,
            toTokenAddress: toTokenInfo.address,
            amount: amountInWei,
          });

          console.log('报价结果:', quoteResult);
          
          if (quoteResult && quoteResult.toTokenAmount) {
            setQuote(quoteResult);
          } else {
            throw new Error('获取报价失败: 返回数据格式不正确');
          }
        } catch (error) {
          console.error('获取报价错误:', error);
          console.error('错误详情:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
          
          let errorMessage = error.message;
          if (error.response) {
            try {
              const errorData = await error.response.text();
              errorMessage = `API错误: ${errorData}`;
            } catch (e) {
              errorMessage = `API错误: ${error.response.status}`;
            }
          }
          
          toast({
            title: '报价错误',
            description: errorMessage,
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
          
          setQuote(null);
        } finally {
          setLoading(false);
        }
      };

      const debouncedFetch = debounce(fetchQuote, 500);
      debouncedFetch();

      // 清理函数
      return () => {
        debouncedFetch.cancel();
      };
    },
    [toast, setLoading, setQuote] // 移除了不必要的walletAddress依赖
  );

  // 获取代币余额
  const fetchTokenBalance = useCallback(async () => {
    if (!walletAddress || !fromToken) return;

    try {
      const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
      
      if (fromToken === 'NATIVE') {
        const balance = await provider.getBalance(walletAddress);
        setFromTokenBalance(ethers.formatEther(balance));
      } else {
        const contract = new ethers.Contract(
          UNICHAIN_TOKENS[fromToken].address,
          ERC20_ABI,
          provider
        );
        const balance = await contract.balanceOf(walletAddress);
        setFromTokenBalance(ethers.formatUnits(balance, UNICHAIN_TOKENS[fromToken].decimals));
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
      setFromTokenBalance('0');
    }
  }, [walletAddress, fromToken]);

  // 当代币改变或钱包地址改变时更新余额
  useEffect(() => {
    fetchTokenBalance();
  }, [fromToken, walletAddress, fetchTokenBalance]);

  // 检查授权状态
  const checkAllowance = useCallback(async () => {
    if (!walletAddress || !amount || fromToken === 'NATIVE') {
      setNeedsApproval(false);
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
      const amountInWei = ethers.parseUnits(amount, UNICHAIN_TOKENS[fromToken].decimals);

      const isApproved = await checkAllowanceService({
        tokenAddress: UNICHAIN_TOKENS[fromToken].address,
        owner: walletAddress,
        spender: UNICHAIN_CONFIG.uniswap_router,
        amount: amountInWei,
        provider
      });

      setNeedsApproval(!isApproved);
    } catch (error) {
      console.error('检查授权错误:', error);
      setNeedsApproval(true);
    }
  }, [walletAddress, amount, fromToken]);

  // 当金额或代币改变时检查授权
  useEffect(() => {
    checkAllowance();
  }, [amount, fromToken, checkAllowance]);

  // 授权函数
  const handleApprove = async () => {
    if (!walletAddress || !privateKey || !amount) {
      console.log('跳过授权 - 缺少参数:', { walletAddress, hasPrivateKey: !!privateKey, amount });
      return;
    }

    try {
      setApproving(true);
      
      const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      const tx = await approveToken({
        tokenAddress: UNICHAIN_TOKENS[fromToken].address,
        spender: UNICHAIN_CONFIG.uniswap_router,
        wallet
      });
      
      console.log('授权交易已发送:', tx.hash);
      
      toast({
        title: '授权交易已发送',
        description: '请等待交易确认',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });

      await tx.wait();
      console.log('授权交易已确认');
      
      setNeedsApproval(false);
      toast({
        title: '授权成功',
        description: '代币已授权',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error('授权错误:', error);
      console.error('错误详情:', {
        message: error.message,
        stack: error.stack
      });
      
      toast({
        title: '授权失败',
        description: `授权失败: ${error.message}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setApproving(false);
    }
  };

  // 处理百分比按钮点击
  const handlePercentageClick = (percentage) => {
    if (fromTokenBalance === '0') return;
    
    const amount = (Number(fromTokenBalance) * percentage).toString();
    setAmount(amount);
  };

  // 处理兑换
  const handleSwap = async () => {
    if (!walletAddress || !privateKey || !amount || !quote) {
      console.log('跳过兑换 - 缺少参数:', {
        hasWallet: !!walletAddress,
        hasPrivateKey: !!privateKey,
        amount,
        hasQuote: !!quote
      });
      return;
    }

    try {
      setSwapping(true);
      console.log('🚀 开始执行Unichain链Uniswap V4交换...');
      const fromTokenInfo = UNICHAIN_TOKENS[fromToken];
      const toTokenInfo = UNICHAIN_TOKENS[toToken];
      const amountInWei = ethers.parseUnits(amount, fromTokenInfo.decimals);
      
      // 如果不是原生币，需要先检查并授权
      if (fromToken !== 'NATIVE') {
        const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // 检查授权
        const isApproved = await checkAllowanceService({
          tokenAddress: fromTokenInfo.address,
          owner: walletAddress,
          spender: UNICHAIN_CONFIG.uniswap_router,
          amount: amountInWei,
          provider
        });
        
        if (!isApproved) {
          console.log('需要授权代币，正在发送授权交易...');
          const approveTx = await approveToken({
            tokenAddress: fromTokenInfo.address,
            spender: UNICHAIN_CONFIG.uniswap_router,
            wallet
          });
          
          toast({
            title: '授权交易已发送',
            description: '请等待交易确认',
            status: 'info',
            duration: 5000,
            isClosable: true,
          });
          
          await approveTx.wait();
          
          toast({
            title: '授权成功',
            description: '代币已成功授权',
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        }
      }

      console.log('📊 获取交换路由数据...');
      const swapTxData = await getSwapRoute({
        fromTokenAddress: fromTokenInfo.address,
        toTokenAddress: toTokenInfo.address,
        amount: amountInWei.toString(),
        userWalletAddress: walletAddress,
        slippage: '0.005', // 0.5%
      });

      if (!swapTxData || !swapTxData.to || !swapTxData.data) {
        throw new Error('获取交换路由失败');
      }
      
      const provider = new ethers.JsonRpcProvider(UNICHAIN_CONFIG.rpcUrl);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // 估算gas
      const gasEstimate = await wallet.estimateGas({
        to: swapTxData.to,
        data: swapTxData.data,
        value: swapTxData.value || '0'
      }).catch(() => ethers.toBigInt('500000')); // 如果估算失败则使用默认值

      // 使用ethers.js的方式计算gas限制
      const gasLimitWithBuffer = gasEstimate * ethers.toBigInt('120') / ethers.toBigInt('100'); // 增加20%的gas余量

      const tx = {
        to: swapTxData.to,
        data: swapTxData.data,
        value: swapTxData.value || '0',
        gasLimit: gasLimitWithBuffer,
        gasPrice: await provider.getFeeData().then(data => data.gasPrice)
      };

      console.log('发送交易:', {
        to: tx.to,
        value: tx.value,
        gasLimit: tx.gasLimit.toString(),
        gasPrice: tx.gasPrice?.toString() || 'auto'
      });
      
      const sentTx = await wallet.sendTransaction(tx);
      setTxHash(sentTx.hash);
      
      toast({
        title: '交易已发送',
        description: `交易哈希: ${sentTx.hash}`,
        status: 'info',
        duration: 5000,
        isClosable: true,
      });

      // 等待交易确认
      console.log('⏳ 等待交易确认...');
      const receipt = await sentTx.wait();
      
      if (receipt.status === 1) {
        console.log('✅ 交换交易成功');
        toast({
          title: '交换成功',
          description: '代币交换已完成',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });

        // 刷新余额
        await fetchTokenBalance();
        
        // 清除输入和报价
      setAmount('');
      setQuote(null);
      } else {
        throw new Error('交易失败');
      }
    } catch (error) {
      console.error('❌ 交换执行失败:', error);
      console.error('错误详情:', {
        message: error.message,
        stack: error.stack
      });
      
      toast({
        title: '交换失败',
        description: `交换失败: ${error.message}`,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setSwapping(false);
    }
  };

  const handleSwapTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setAmount('');
    setQuote(null);
  };

  // 处理金额输入
  const handleAmountChange = (e) => {
    const newAmount = e.target.value;
    if (newAmount === '' || (!isNaN(newAmount) && Number(newAmount) >= 0)) {
      setAmount(newAmount);
      if (newAmount && Number(newAmount) > 0) {
        debouncedFetchQuote(newAmount, fromToken, toToken);
      } else {
        setQuote(null);
      }
    }
  };

  // 处理代币切换
  const handleFromTokenChange = (e) => {
    const newFromToken = e.target.value;
    if (newFromToken === toToken) {
      setToToken(fromToken);
    }
    setFromToken(newFromToken);
    setQuote(null);
    if (amount && Number(amount) > 0) {
      debouncedFetchQuote(amount, newFromToken, toToken);
    }
  };

  const handleToTokenChange = (e) => {
    const newToToken = e.target.value;
    if (newToToken === fromToken) {
      setFromToken(toToken);
    }
    setToToken(newToToken);
    setQuote(null);
    if (amount && Number(amount) > 0) {
      debouncedFetchQuote(amount, fromToken, newToToken);
    }
  };

  const formatTokenAmount = (amount, decimals) => {
    if (!amount) return '0';
    return ethers.formatUnits(amount, decimals);
  };

  // 自动刷新报价
  useEffect(() => {
    let intervalId;
    
    // 只在已有报价时才启动自动刷新
    if (isOpen && quote && amount && Number(amount) > 0) {
      console.log('启动自动刷新报价');
      
      // 立即执行一次刷新
      const refreshQuote = async () => {
        try {
          setIsRefreshing(true);
          
          const fromTokenInfo = UNICHAIN_TOKENS[fromToken];
          const toTokenInfo = UNICHAIN_TOKENS[toToken];
          const amountInWei = ethers.parseUnits(amount, fromTokenInfo.decimals).toString();
          
          const quoteResult = await getQuote({
            fromTokenAddress: fromTokenInfo.address,
            toTokenAddress: toTokenInfo.address,
            amount: amountInWei,
          });

          if (quoteResult) {
            setQuote(quoteResult);
          }
        } catch (error) {
          console.error('刷新报价错误:', error);
        } finally {
          setTimeout(() => {
            setIsRefreshing(false);
          }, 500);
        }
      };

      // 修改为5秒刷新一次
      intervalId = setInterval(refreshQuote, 5000);
      
      return () => {
        if (intervalId) {
          console.log('停止自动刷新报价');
          clearInterval(intervalId);
        }
      };
    }
  }, [isOpen, quote, amount, fromToken, toToken]);

  // 手动刷新报价
  const handleManualRefresh = async () => {
    if (!amount || Number(amount) <= 0) return;
    
    try {
      setIsRefreshing(true);

      const fromTokenInfo = UNICHAIN_TOKENS[fromToken];
      const toTokenInfo = UNICHAIN_TOKENS[toToken];
      const amountInWei = ethers.parseUnits(amount, fromTokenInfo.decimals).toString();
      
      const quoteResult = await getQuote({
        fromTokenAddress: fromTokenInfo.address,
        toTokenAddress: toTokenInfo.address,
        amount: amountInWei,
      });

      console.log('手动刷新报价结果:', quoteResult);
      
      if (quoteResult) {
        setQuote(quoteResult);
        toast({
          title: '报价已更新',
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('手动刷新报价错误:', error);
      toast({
        title: '刷新失败',
        description: error.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack justify="space-between" align="center" width="100%">
            <Text fontSize="lg" fontWeight="bold">Fast Swap</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <VStack spacing={1}>
            <Card width="100%" variant="outline">
              <CardBody>
                <VStack spacing={2}>
                  <HStack width="100%" justify="space-between">
                    <Text fontSize="sm">From</Text>
                    <Text fontSize="sm">Balance: {Number(fromTokenBalance).toFixed(6)}</Text>
                  </HStack>
                  <HStack width="100%" spacing={4}>
                    <Input
                      placeholder="0.0"
                      value={amount}
                      onChange={handleAmountChange}
                      type="number"
                      fontSize="2xl"
                      fontWeight="bold"
                    />
                    <Select
                      value={fromToken}
                      onChange={handleFromTokenChange}
                      width="40%"
                    >
                      {Object.keys(UNICHAIN_TOKENS).map((token) => (
                        <option key={token} value={token}>
                          {UNICHAIN_TOKENS[token].symbol}
                        </option>
                      ))}
                    </Select>
                  </HStack>
                  <HStack width="100%" spacing={2} mt={2}>
                    <Button size="sm" onClick={() => handlePercentageClick(0.25)} flex={1}>
                      25%
                    </Button>
                    <Button size="sm" onClick={() => handlePercentageClick(0.5)} flex={1}>
                      50%
                    </Button>
                    <Button size="sm" onClick={() => handlePercentageClick(1)} flex={1}>
                      MAX
                    </Button>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>

            <Box position="relative" width="100%" height="8">
              <Button
                size="sm"
                position="absolute"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                onClick={handleSwapTokens}
                zIndex={2}
              >
                <ArrowDownIcon />
              </Button>
            </Box>

            <Card width="100%" variant="outline">
              <CardBody>
                <VStack spacing={2}>
                  <Text fontSize="sm">To (Estimated)</Text>
                  <HStack width="100%" spacing={4}>
                    <Input
                      value={quote ? formatTokenAmount(quote.toTokenAmount, UNICHAIN_TOKENS[toToken].decimals) : ''}
                      isReadOnly
                      placeholder="0.0"
                      fontSize="2xl"
                      fontWeight="bold"
                    />
                    <Select
                      value={toToken}
                      onChange={handleToTokenChange}
                      width="40%"
                    >
                      {Object.keys(UNICHAIN_TOKENS).map((token) => (
                        <option key={token} value={token}>
                          {UNICHAIN_TOKENS[token].symbol}
                        </option>
                      ))}
                    </Select>
                  </HStack>
                </VStack>
              </CardBody>
            </Card>

            <Button
              width="100%"
              colorScheme="blue"
              mt={4}
              onClick={needsApproval ? handleApprove : handleSwap}
              isLoading={needsApproval ? approving : (swapping || isRefreshing)}
              loadingText={needsApproval ? "Approving..." : (isRefreshing ? "Refreshing..." : "Swapping...")}
              disabled={!amount || (!quote && !needsApproval) || Number(amount) <= 0 || loading || !walletAddress || !privateKey || isRefreshing}
            >
              {!walletAddress ? 'Connect Wallet to Swap' : 
               !privateKey ? 'Private Key Required' : 
               needsApproval ? 'Approve Token' : 
               isRefreshing ? 'Refreshing Price...' : 'Swap'}
            </Button>

            {txHash && (
              <Link
                href={`${UNICHAIN_CONFIG.explorerUrl}/tx/${txHash}`}
                isExternal
                color="blue.500"
                fontSize="sm"
                mt={2}
              >
                View transaction on Explorer <ExternalLinkIcon mx="2px" />
              </Link>
            )}

            {quote && (
              <Card width="100%" variant="outline" mt={4}>
                <CardBody>
                  <VStack width="100%" align="start" spacing={2}>
                    <HStack width="100%" justify="space-between" align="center">
                      <HStack spacing={2}>
                      <Text fontSize="sm">Price Impact</Text>
                        <IconButton
                          size="xs"
                          icon={<RepeatIcon />}
                          isLoading={isRefreshing}
                          onClick={handleManualRefresh}
                          aria-label="手动刷新报价"
                          title="手动刷新报价"
                          disabled={!amount || Number(amount) <= 0}
                          variant="ghost"
                          color="blue.500"
                          _hover={{ bg: 'blue.50' }}
                        />
                      </HStack>
                      <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                        {Number(quote.priceImpactPercentage || 0).toFixed(2)}%
                      </Text>
                    </HStack>
                    <HStack width="100%" justify="space-between">
                      <Text fontSize="sm">Estimated Gas Fee</Text>
                      <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                        {ethers.formatEther(quote.estimateGasFee || '0')} ETH
                      </Text>
                    </HStack>
                    <HStack width="100%" justify="space-between">
                      <Text fontSize="sm">Trading Fee</Text>
                      <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                        {Number(quote.tradeFee || 0).toFixed(4)}%
                      </Text>
                    </HStack>
                    {quote.dexRouterList && quote.dexRouterList[0] && quote.dexRouterList[0].subRouterList && quote.dexRouterList[0].subRouterList[0] && (
                      <HStack width="100%" justify="space-between">
                        <Text fontSize="sm">Route</Text>
                        <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                          {quote.dexRouterList[0].subRouterList[0].dexProtocol?.[0]?.dexName || 'Uniswap V3'}
                        </Text>
                      </HStack>
                    )}
                  </VStack>
                </CardBody>
              </Card>
            )}
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default FastSwap; 