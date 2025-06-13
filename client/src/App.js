import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import {
  Box,
  Container,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  Text,
  Button,
  useToast,
  HStack,
  Tag,
  Select,
  Flex,
  useColorModeValue,
  ButtonGroup,
  Input,
  InputGroup,
  InputLeftElement,
  IconButton,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, SettingsIcon, ExternalLinkIcon, RepeatIcon } from '@chakra-ui/icons';
import axios from 'axios';
import { formatNumber } from './utils/format';
import TokenPair from './components/TokenPair';
import { getAddLiquidityUrl, getBscScanUrl } from './utils/urls';
import WalletManager from './pages/WalletManager';
import config from './config';
import ErrorBoundary from './components/ErrorBoundary';

function PoolList() {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFeeTier, setSelectedFeeTier] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'totalLiquidity', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [priceDirections, setPriceDirections] = useState({});  // 存储每个池子的价格显示方向
  const toast = useToast();

  const hoverBgColor = useColorModeValue('gray.50', 'gray.700');

  // Helper function to get fee tier label
  const getFeeLabel = (feeTier) => {
    switch (feeTier) {
      case 100:
        return 'LOWEST';
      case 500:
        return 'LOW';
      case 2500:
        return 'MEDIUM';
      case 10000:
        return 'HIGH';
      default:
        return 'UNKNOWN';
    }
  };

  // Helper function to get fee percentage
  const getFeePercentage = (feeTier) => {
    return (feeTier / 10000).toFixed(2);
  };

  useEffect(() => {
    const fetchPools = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${config.API_URL}/api/pools`);
        if (!response.data || !response.data.pools) {
          throw new Error('Invalid response format');
        }
        setPools(Array.isArray(response.data.pools) ? response.data.pools : []);
      } catch (error) {
        console.error('Error fetching pools:', error);
        setPools([]);
        toast({
          title: 'Error',
          description: 'Failed to fetch pools data',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };

    // 首次加载
    fetchPools();
    
    // 每5分钟刷新一次池子信息
    const intervalId = setInterval(fetchPools, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [toast]);

  // Handle sorting
  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  // Get sort icon
  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  // 获取价格显示文本
  const getPriceDisplay = (pool, isReverse) => {
    // 如果价格为0，返回错误信息
    if (parseFloat(pool.price) === 0) {
      return "获取代币价格失败";
    }

    if (isReverse) {
      return `1 ${pool.token1.symbol} = ${formatNumber(1 / pool.price)} ${pool.token0.symbol}`;
    }
    return `1 ${pool.token0.symbol} = ${formatNumber(pool.price)} ${pool.token1.symbol}`;
  };

  // Sort pools
  const sortedPools = (Array.isArray(pools) ? [...pools] : []).sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.key) {
      case 'totalLiquidity':
        return (parseFloat(a.liquidity) - parseFloat(b.liquidity)) * direction;
      case 'apr':
        return (parseFloat(a.apr || 0) - parseFloat(b.apr || 0)) * direction;
      case 'dailyVolume':
        return (parseFloat(a.volumeUSD || 0) - parseFloat(b.volumeUSD || 0)) * direction;
      case 'price':
        // 如果价格为0，将其排在最后
        const priceA = parseFloat(a.price) === 0 ? -Infinity : parseFloat(a.price);
        const priceB = parseFloat(b.price) === 0 ? -Infinity : parseFloat(b.price);
        return (priceA - priceB) * direction;
      case 'feeTier':
        return (a.feeTier - b.feeTier) * direction;
      default:
        return 0;
    }
  });

  // Filter pools by fee tier and search term
  const filteredPools = sortedPools.filter((pool) => {
    const matchesSearch = 
      pool.token0.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pool.token1.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pool.token0.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pool.token1.address.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFeeTier = selectedFeeTier === 'all' || getFeeLabel(pool.feeTier) === selectedFeeTier;

    return matchesSearch && matchesFeeTier;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredPools.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPools = filteredPools.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo(0, 0);
  };

  // Generate page numbers
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  // 切换价格显示方向
  const togglePriceDirection = (poolKey) => {
    setPriceDirections(prev => ({
      ...prev,
      [poolKey]: !prev[poolKey]
    }));
  };

  if (loading && pools.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <Spinner size="xl" color="blue.500" />
      </Box>
    );
  }

  return (
    <Container maxWidth="full" p={0}>
      <Box py={4} px={4}>
        <Flex justify="space-between" align="center" mb={4} px={2}>
          <Text fontSize="2xl">PancakeSwap V3 Pools</Text>
          <HStack spacing={4}>
                <InputGroup maxW="300px">
                  <InputLeftElement pointerEvents="none">
                    <SearchIcon color="gray.400" />
                  </InputLeftElement>
                  <Input
                    placeholder="Search pools or addresses"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    borderRadius="xl"
                  />
                </InputGroup>
            <Link to="/wallet">
              <IconButton
                icon={<SettingsIcon />}
                variant="ghost"
                colorScheme="gray"
                aria-label="Wallet settings"
              />
            </Link>
          </HStack>
              </Flex>
              
        <Box overflowX="auto">
          <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th>Pool</Th>
                <Th>
                  <HStack spacing={2}>
                    <Text>Fee Tier</Text>
                    <Select
                      value={selectedFeeTier}
                      onChange={(e) => {
                        setSelectedFeeTier(e.target.value);
                        setCurrentPage(1);
                      }}
                      size="sm"
                      width="120px"
                      variant="filled"
                      bg="gray.100"
                      _hover={{ bg: "gray.200" }}
                    >
                      <option value="all">All Tiers</option>
                      <option value="LOWEST">0.01%</option>
                      <option value="LOW">0.05%</option>
                      <option value="MEDIUM">0.25%</option>
                      <option value="HIGH">1%</option>
                    </Select>
                  </HStack>
                </Th>
                <Th>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('price')}
                    rightIcon={<Text as="span" ml={2}>{getSortIcon('price')}</Text>}
                    size="sm"
                    fontWeight="bold"
                  >
                    Price
                  </Button>
                </Th>
                <Th>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('totalLiquidity')}
                    rightIcon={<Text as="span" ml={2}>{getSortIcon('totalLiquidity')}</Text>}
                    size="sm"
                    fontWeight="bold"
                  >
                    Liquidity
                  </Button>
                </Th>
                <Th>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort('dailyVolume')}
                    rightIcon={<Text as="span" ml={2}>{getSortIcon('dailyVolume')}</Text>}
                    size="sm"
                    fontWeight="bold"
                  >
                    Volume 24H
                          </Button>
                        </Th>
                        <Th>
                          <Button
                            variant="ghost"
                            onClick={() => handleSort('apr')}
                            rightIcon={<Text as="span" ml={2}>{getSortIcon('apr')}</Text>}
                            size="sm"
                            fontWeight="bold"
                          >
                            APR
                          </Button>
                        </Th>
                        <Th>Actions</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {currentPools.map((pool) => (
                        <Tr
                          key={pool.key}
                          _hover={{ bg: hoverBgColor }}
                          cursor="pointer"
                        >
                          <Td>
                            <HStack spacing={2}>
                              <TokenPair
                                token0={pool.token0.symbol}
                                token1={pool.token1.symbol}
                                token0Address={pool.token0.address}
                                token1Address={pool.token1.address}
                              />
                              <Button
                                as="a"
                                href={getBscScanUrl(pool.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                size="xs"
                                variant="ghost"
                                colorScheme="gray"
                                rightIcon={<ExternalLinkIcon />}
                              >
                                {pool.address.slice(0, 6)}...{pool.address.slice(-4)}
                              </Button>
                            </HStack>
                          </Td>
                          <Td>
                            {getFeeLabel(pool.feeTier)} ({getFeePercentage(pool.feeTier)}%)
                          </Td>
                          <Td>
                            {parseFloat(pool.price) === 0 ? (
                              <Text color="red.500">获取代币价格失败</Text>
                            ) : (
                              <HStack spacing={2}>
                                <Text>
                                  {getPriceDisplay(pool, priceDirections[pool.key])}
                                </Text>
                                <IconButton
                                  icon={<RepeatIcon />}
                                  size="xs"
                                  variant="ghost"
                                  colorScheme="blue"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePriceDirection(pool.key);
                                  }}
                                  aria-label="Toggle price direction"
                                />
                              </HStack>
                            )}
                          </Td>
                          <Td>{formatNumber(pool.liquidity)}</Td>
                          <Td>${formatNumber(pool.volumeUSD)}</Td>
                          <Td>
                            <Tag
                              colorScheme={parseFloat(pool.apr) > 100 ? 'green' : 'blue'}
                              size="md"
                              borderRadius="full"
                            >
                              {formatNumber(pool.apr)}%
                            </Tag>
                          </Td>
                          <Td>
                            <Button
                              colorScheme="blue"
                              size="sm"
                              borderRadius="xl"
                              onClick={() => window.open(getAddLiquidityUrl(pool.token0.address, pool.token1.address), '_blank')}
                            >
                              Add Liquidity
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
        </Box>

                  {/* Pagination */}
        <Flex justify="space-between" align="center" mt="4" px={2}>
                    <HStack spacing="4">
                      <Text color="gray.600">
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredPools.length)} of {filteredPools.length} pools
                      </Text>
                      <HStack spacing="2">
                        <Text color="gray.600" whiteSpace="nowrap">Rows per page:</Text>
                        <Select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          width="80px"
                          size="sm"
                        >
                          <option value="10">10</option>
                          <option value="20">20</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </Select>
                      </HStack>
                    </HStack>
                    <ButtonGroup spacing="2">
                      <Button
                        leftIcon={<ChevronLeftIcon />}
                        onClick={() => handlePageChange(currentPage - 1)}
                        isDisabled={currentPage === 1}
                        size="sm"
                      >
                        Previous
                      </Button>
                      {getPageNumbers().map((pageNum) => (
                        <Button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          colorScheme={pageNum === currentPage ? "blue" : "gray"}
                          variant={pageNum === currentPage ? "solid" : "outline"}
                          size="sm"
                        >
                          {pageNum}
                        </Button>
                      ))}
                      <Button
                        rightIcon={<ChevronRightIcon />}
                        onClick={() => handlePageChange(currentPage + 1)}
                        isDisabled={currentPage === totalPages}
                        size="sm"
                      >
                        Next
                      </Button>
                    </ButtonGroup>
                  </Flex>
          </Box>
      </Container>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <HashRouter>
      <Routes>
        <Route path="/" element={<PoolList />} />
        <Route path="/wallet" element={<WalletManager />} />
      </Routes>
    </HashRouter>
    </ErrorBoundary>
  );
}

export default App; 