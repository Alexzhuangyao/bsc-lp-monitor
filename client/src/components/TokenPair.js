import React, { useEffect, useState } from 'react';
import { Box, Image, Text, Link, VStack, HStack } from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import axios from 'axios';

// Token list cache
const TOKEN_LIST_URL = 'https://tokens.pancakeswap.finance/pancakeswap-extended.json';
let tokenListCache = null;

// Inline SVG as base64
const unknownTokenIcon = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KICA8Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMSIgZmlsbD0iI0U5RUFFQiIgc3Ryb2tlPSIjRTlFQUVCIiBzdHJva2Utd2lkdGg9IjIiLz4KICA8cGF0aCBkPSJNMTIgMTcuNUMxMS43MjM5IDE3LjUgMTEuNSAxNy4yNzYxIDExLjUgMTdDMTEuNSAxNi43MjM5IDExLjcyMzkgMTYuNSAxMiAxNi41QzEyLjI3NjEgMTYuNSAxMi41IDE2LjcyMzkgMTIuNSAxN0MxMi41IDE3LjI3NjEgMTIuMjc2MSAxNy41IDEyIDE3LjVaIiBmaWxsPSIjN0E2RUFBIi8+CiAgPHBhdGggZD0iTTEyIDZDMTAuNDA4NyA2IDkgNy40MDg3MyA5IDlDOC45OTk5OSA5Ljc0MDE0IDkuMjU3ODkgMTAuNDUyNyA5LjczMDcyIDExTTEyIDE0VjExLjVDMTIuODc1MiAxMS41IDEzLjcwNjYgMTEuMTcwOCAxNC4zMzMzIDEwLjU4MzNDMTQuOTYwMSA5Ljk5NTgxIDE1LjMzMzMgOS4yMDcyNSAxNS4zMzMzIDguMzgwODdDMTUuMzMzMyA3LjU1NDQ5IDE0Ljk2MDEgNi43NjU5NCAxNC4zMzMzIDYuMTc4NDJDMTMuNzA2NiA1LjU5MDkgMTIuODc1MiA1LjI2MTc1IDEyIDUuMjYxNzUiIHN0cm9rZT0iIzdBNkVBQSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+";

const fetchTokenList = async () => {
  if (tokenListCache) return tokenListCache;
  
  try {
    const response = await axios.get(TOKEN_LIST_URL);
    tokenListCache = response.data.tokens.reduce((acc, token) => {
      acc[token.address.toLowerCase()] = {
        symbol: token.symbol,
        logoURI: token.logoURI
      };
      return acc;
    }, {});
    return tokenListCache;
  } catch (error) {
    console.error('Error fetching token list:', error);
    return {};
  }
};

const TokenPair = ({ token0, token1, token0Address, token1Address }) => {
  const [tokenImages, setTokenImages] = useState({
    token0: unknownTokenIcon,
    token1: unknownTokenIcon
  });

  // Format address to show first 6 and last 4 characters
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Get BSCScan URL for token
  const getBscScanUrl = (address) => {
    return `https://bscscan.com/token/${address}`;
  };

  useEffect(() => {
    const loadTokenImages = async () => {
      try {
        const tokenList = await fetchTokenList();
        setTokenImages({
          token0: tokenList[token0Address?.toLowerCase()]?.logoURI || unknownTokenIcon,
          token1: tokenList[token1Address?.toLowerCase()]?.logoURI || unknownTokenIcon
        });
      } catch (error) {
        console.error('Error loading token images:', error);
        setTokenImages({
          token0: unknownTokenIcon,
          token1: unknownTokenIcon
        });
      }
    };
    
    if (token0Address && token1Address) {
      loadTokenImages();
    }
  }, [token0Address, token1Address]);

  if (!token0 || !token1) {
    return null;
  }

  return (
    <VStack spacing="1" align="start">
      <HStack spacing="2">
        <Box position="relative" width="50px" height="25px">
          <Image
            src={tokenImages.token0}
            fallbackSrc={unknownTokenIcon}
            width="25px"
            height="25px"
            position="absolute"
            left="0"
            zIndex="1"
            borderRadius="full"
            alt={`${token0} token`}
          />
          <Image
            src={tokenImages.token1}
            fallbackSrc={unknownTokenIcon}
            width="25px"
            height="25px"
            position="absolute"
            left="15px"
            borderRadius="full"
            alt={`${token1} token`}
          />
        </Box>
        <Text fontWeight="bold">{token0}/{token1}</Text>
      </HStack>
      <VStack spacing="0" align="start" fontSize="xs" color="gray.500">
        <Link 
          href={getBscScanUrl(token0Address)} 
          target="_blank" 
          rel="noopener noreferrer"
          _hover={{ color: 'blue.500', textDecoration: 'none' }}
          display="inline-flex"
          alignItems="center"
        >
          <Text>{formatAddress(token0Address)}</Text>
          <ExternalLinkIcon ml="1" boxSize="3" />
        </Link>
        <Link 
          href={getBscScanUrl(token1Address)} 
          target="_blank" 
          rel="noopener noreferrer"
          _hover={{ color: 'blue.500', textDecoration: 'none' }}
          display="inline-flex"
          alignItems="center"
        >
          <Text>{formatAddress(token1Address)}</Text>
          <ExternalLinkIcon ml="1" boxSize="3" />
        </Link>
      </VStack>
    </VStack>
  );
};

export default TokenPair; 