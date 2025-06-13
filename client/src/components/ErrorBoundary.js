import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
    
    // 在构造函数中设置错误处理
    this.setupErrorHandlers();
  }

  setupErrorHandlers = () => {
    // 保存原始的 console.error
    this.originalConsoleError = console.error;
    this.originalOnError = window.onerror;
    this.originalOnUnhandledRejection = window.onunhandledrejection;

    // 重写 console.error
    console.error = (...args) => {
      const errorString = args.join(' ');
      if (this.shouldIgnoreError(errorString)) {
        return;
      }
      this.originalConsoleError.apply(console, args);
    };

    // 设置全局错误处理
    window.onerror = (message, source, lineno, colno, error) => {
      if (this.shouldIgnoreError(message) || this.shouldIgnoreError(source)) {
        return true;
      }
      if (this.originalOnError) {
        return this.originalOnError(message, source, lineno, colno, error);
      }
      return false;
    };

    // 设置未捕获的Promise错误处理
    window.onunhandledrejection = (event) => {
      if (
        this.shouldIgnoreError(event.reason?.stack) ||
        this.shouldIgnoreError(event.reason?.message)
      ) {
        event.preventDefault();
        return;
      }
      if (this.originalOnUnhandledRejection) {
        return this.originalOnUnhandledRejection(event);
      }
    };
  }

  shouldIgnoreError = (errorString) => {
    if (!errorString) return false;
    
    const ignoredPatterns = [
      'chrome-extension://',
      'Cannot set property tron',
      'mfgccjchihfkkindfppnaooecgfneiii',
      'inpage.js',
      'MetaMask',
      'wallet_watchAsset',
      'Tron',
      'TronLink'
    ];

    return ignoredPatterns.some(pattern => 
      errorString.includes(pattern)
    );
  }

  componentDidCatch(error, errorInfo) {
    if (!this.shouldIgnoreError(error.message) && !this.shouldIgnoreError(error.stack)) {
      this.setState({ hasError: true });
      // 可以在这里添加错误日志记录
      console.log('Component Error:', error, errorInfo);
    }
  }

  componentWillUnmount() {
    // 恢复原始的错误处理
    console.error = this.originalConsoleError;
    window.onerror = this.originalOnError;
    window.onunhandledrejection = this.originalOnUnhandledRejection;
  }

  render() {
    if (this.state.hasError) {
      // 你可以渲染任何自定义的错误界面
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 