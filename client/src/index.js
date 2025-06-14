import React from 'react';
import ReactDOM from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import WalletManager from './pages/WalletManager';
import { initWeb3 } from './utils/web3';
import theme from './theme';
import ErrorBoundary from './components/ErrorBoundary';

// Initialize Web3
initWeb3();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <ErrorBoundary>
        <HashRouter>
          <Routes>
            <Route path="*" element={<WalletManager />} />
          </Routes>
        </HashRouter>
      </ErrorBoundary>
    </ChakraProvider>
  </React.StrictMode>
); 