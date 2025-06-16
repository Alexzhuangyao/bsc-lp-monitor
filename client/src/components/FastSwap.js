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
  BSC_TOKENS,
  sendSwapTransaction,
  BSC_CONFIG 
} from '../services/okxService';
import { debounce } from 'lodash';

// BSC RPC节点
const BSC_RPC = 'https://binance.nodereal.io';

// ERC20代币ABI
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)'
];

function FastSwap({ isOpen, onClose, walletAddress, privateKey }) {
  const [fromToken, setFromToken] = useState('BNB');
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
    debounce((amount, fromToken, toToken) => {
      if (!amount || amount <= 0 || !fromToken || !toToken) {
        console.log('跳过报价查询 - 无效参数:', { amount, fromToken, toToken });
        return;
      }

      const fetchQuote = async () => {
    try {
      setLoading(true);
          console.log('获取报价，参数:', { fromToken, toToken, amount });
          
      const fromTokenDecimals = BSC_TOKENS[fromToken].decimals;
      const amountInWei = ethers.parseUnits(amount, fromTokenDecimals).toString();

          console.log('准备参数:', {
            fromTokenAddress: BSC_TOKENS[fromToken].address,
            toTokenAddress: BSC_TOKENS[toToken].address,
            amountInWei,
            userWalletAddress: walletAddress
          });

          const quoteResult = await getQuote({
          fromTokenAddress: BSC_TOKENS[fromToken].address,
          toTokenAddress: BSC_TOKENS[toToken].address,
          amount: amountInWei,
          slippage: '0.005',
          userWalletAddress: walletAddress
      });

          console.log('报价结果:', quoteResult);
          
          // 检查返回的数据结构
          if (quoteResult && 
              typeof quoteResult === 'object' && 
              'toTokenAmount' in quoteResult &&
              'priceImpactPercentage' in quoteResult) {
            setQuote(quoteResult);
      } else {
            console.error('无效的报价数据:', quoteResult);
            throw new Error('获取报价失败: 返回数据格式不正确');
      }
    } catch (error) {
          console.error('获取报价错误:', error);
          console.error('错误详情:', {
            message: error.message,
            stack: error.stack,
            name: error.name
          });
          
          // 更详细的错误提示
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
          
          // 清除之前的报价
          setQuote(null);
    } finally {
      setLoading(false);
    }
      };

      fetchQuote();
    }, 500),
    [walletAddress, toast, setLoading, setQuote]
  );

  // 获取代币余额
  const fetchTokenBalance = useCallback(async () => {
    if (!walletAddress || !fromToken) return;

    try {
      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      
      if (fromToken === 'BNB') {
        const balance = await provider.getBalance(walletAddress);
        setFromTokenBalance(ethers.formatEther(balance));
      } else {
        const contract = new ethers.Contract(
          BSC_TOKENS[fromToken].address,
          ERC20_ABI,
          provider
        );
        const balance = await contract.balanceOf(walletAddress);
        setFromTokenBalance(ethers.formatUnits(balance, BSC_TOKENS[fromToken].decimals));
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
    if (!walletAddress || !amount || fromToken === 'BNB') {
      setNeedsApproval(false);
      return;
    }

    try {
      console.log('检查授权状态:', {
          tokenAddress: BSC_TOKENS[fromToken].address,
        walletAddress,
        amount
      });

      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      const tokenContract = new ethers.Contract(
        BSC_TOKENS[fromToken].address,
        ERC20_ABI,
        provider
      );

      const amountInWei = ethers.parseUnits(amount, BSC_TOKENS[fromToken].decimals);
      const allowance = await tokenContract.allowance(walletAddress, BSC_CONFIG.APPROVE_ROUTER);

      console.log('当前授权额度:', {
        allowance: allowance.toString(),
        required: amountInWei.toString()
      });

      setNeedsApproval(allowance < amountInWei);
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
      console.log('开始授权:', {
        tokenAddress: BSC_TOKENS[fromToken].address,
        amount
      });

      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      const wallet = new ethers.Wallet(privateKey, provider);
      const tokenContract = new ethers.Contract(
        BSC_TOKENS[fromToken].address,
        ERC20_ABI,
        wallet
      );

      // 使用最大值进行授权
      const maxApprovalAmount = ethers.MaxUint256;
      
      console.log('发送授权交易');
      const tx = await tokenContract.approve(BSC_CONFIG.APPROVE_ROUTER, maxApprovalAmount, {
        gasLimit: 100000, // 设置一个合理的 gas limit
        gasPrice: await provider.getFeeData().then(data => data.gasPrice) // 获取当前 gas price
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
      console.log('🚀 开始执行BSC链代币交换...');

      const provider = new ethers.JsonRpcProvider(BSC_RPC);
      const wallet = new ethers.Wallet(privateKey, provider);

      // 1. 获取交换数据
      const amountInWei = ethers.parseUnits(amount, BSC_TOKENS[fromToken].decimals).toString();

      console.log('📊 获取交换交易数据...');
      const swapResult = await sendSwapTransaction({
          fromTokenAddress: BSC_TOKENS[fromToken].address,
          toTokenAddress: BSC_TOKENS[toToken].address,
          amount: amountInWei,
          slippage: '0.5',
          userWalletAddress: walletAddress,
          privateKey
      });

      if (!swapResult || !swapResult.hash) {
        throw new Error('获取交换数据失败');
      }

      console.log('📡 交易已发送:', swapResult.hash);
      setTxHash(swapResult.hash);
      
      toast({
        title: '交易已发送',
        description: '请等待交易确认',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });

      // 等待交易确认
      console.log('⏳ 等待交易确认...');
      const receipt = await swapResult.wait();
      
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
          console.log('刷新报价，参数:', { fromToken, toToken, amount });
          
          const fromTokenDecimals = BSC_TOKENS[fromToken].decimals;
          const amountInWei = ethers.parseUnits(amount, fromTokenDecimals).toString();
          
          const quoteResult = await getQuote({
            fromTokenAddress: BSC_TOKENS[fromToken].address,
            toTokenAddress: BSC_TOKENS[toToken].address,
            amount: amountInWei,
            slippage: '1'
          });

          console.log('刷新报价结果:', quoteResult);
          
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
      console.log('手动刷新报价，参数:', { fromToken, toToken, amount });
      
      const fromTokenDecimals = BSC_TOKENS[fromToken].decimals;
      const amountInWei = ethers.parseUnits(amount, fromTokenDecimals).toString();
      
      const quoteResult = await getQuote({
        fromTokenAddress: BSC_TOKENS[fromToken].address,
        toTokenAddress: BSC_TOKENS[toToken].address,
        amount: amountInWei,
        slippage: '1'
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
                      {Object.keys(BSC_TOKENS).map((token) => (
                        <option key={token} value={token}>
                          {BSC_TOKENS[token].symbol}
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
                      value={quote ? formatTokenAmount(quote.toTokenAmount, BSC_TOKENS[toToken].decimals) : ''}
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
                      {Object.keys(BSC_TOKENS).map((token) => (
                        <option key={token} value={token}>
                          {BSC_TOKENS[token].symbol}
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
                href={`https://bscscan.com/tx/${txHash}`}
                isExternal
                color="blue.500"
                fontSize="sm"
                mt={2}
              >
                View transaction on BscScan <ExternalLinkIcon mx="2px" />
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
                        {Number(quote.priceImpactPercentage).toFixed(2)}%
                      </Text>
                    </HStack>
                    <HStack width="100%" justify="space-between">
                      <Text fontSize="sm">Estimated Gas Fee</Text>
                      <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                        {ethers.formatEther(quote.estimateGasFee)} BNB
                      </Text>
                    </HStack>
                    <HStack width="100%" justify="space-between">
                      <Text fontSize="sm">Trading Fee</Text>
                      <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                        {Number(quote.tradeFee).toFixed(4)}%
                      </Text>
                    </HStack>
                    {quote.dexRouterList && quote.dexRouterList[0] && quote.dexRouterList[0].subRouterList && quote.dexRouterList[0].subRouterList[0] && (
                      <HStack width="100%" justify="space-between">
                        <Text fontSize="sm">Route</Text>
                        <Text fontSize="sm" color={isRefreshing ? "gray.500" : "inherit"}>
                          {quote.dexRouterList[0].subRouterList[0].dexProtocol?.[0]?.dexName || 'Unknown DEX'}
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