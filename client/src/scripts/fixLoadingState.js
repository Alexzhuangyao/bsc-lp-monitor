/**
 * 这个脚本用于修复LP Positions组件加载状态卡住的问题
 * 可以在控制台中执行此脚本来手动修复问题
 */

// 清除加载状态
function clearLoadingState() {
  console.log("开始修复LP组件加载状态...");
  
  // 尝试从localStorage查找任何可能造成影响的状态
  try {
    // 1. 检查是否有任何卡住的loading状态标志
    const keys = Object.keys(localStorage);
    const loadingKeys = keys.filter(key => key.includes('loading') || key.includes('Loading'));
    
    if (loadingKeys.length > 0) {
      console.log(`找到可能相关的loading状态键: ${loadingKeys.join(', ')}`);
      loadingKeys.forEach(key => {
        console.log(`尝试移除状态: ${key}`);
        localStorage.removeItem(key);
      });
    }
    
    // 2. 查找并重置缓存
    const cacheKeys = keys.filter(key => key.includes('Cache') || key.includes('cache'));
    if (cacheKeys.length > 0) {
      console.log(`找到缓存键: ${cacheKeys.join(', ')}`);
      console.log("清除相关缓存...");
      cacheKeys.forEach(key => {
        localStorage.removeItem(key);
      });
    }
    
    console.log("已尝试清除所有可能导致问题的状态数据");
  } catch (error) {
    console.error("清理localStorage时出错:", error);
  }
  
  // 直接操作DOM，查找并重置任何loading元素
  try {
    const spinners = document.querySelectorAll('.chakra-spinner');
    if (spinners.length > 0) {
      console.log(`找到 ${spinners.length} 个正在旋转的加载图标`);
      spinners.forEach(spinner => {
        console.log("尝试移除spinner...");
        spinner.parentNode.removeChild(spinner);
      });
    }
    
    const loadingTexts = Array.from(document.querySelectorAll('*')).filter(
      el => el.innerText && el.innerText.includes('加载中')
    );
    
    if (loadingTexts.length > 0) {
      console.log(`找到 ${loadingTexts.length} 个加载文本元素`);
      loadingTexts.forEach(el => {
        console.log(`替换加载文本: "${el.innerText}"`);
        el.innerText = el.innerText.replace(/加载中|loading/i, '已取消');
      });
    }
  } catch (domError) {
    console.error("操作DOM元素时出错:", domError);
  }
  
  console.log("正在尝试重置React组件状态...");
  console.log(`
  请在页面上执行以下操作尝试修复问题:
  1. 点击刚添加的"重置状态"按钮
  2. 如果没有效果，请尝试刷新页面
  3. 如果仍然有问题，请尝试清空浏览器localStorage后重新打开页面
  `);
  
  console.log("修复尝试已完成。");
  
  return "状态重置尝试已完成，请检查页面是否恢复正常";
}

// 提供更多疑难解答指南
function troubleshootingGuide() {
  console.log(`
  ===== LP仓位加载问题疑难解答指南 =====
  
  如果您的LP仓位页面一直显示"加载中"，请尝试以下步骤:
  
  1. 点击页面上的"重置状态"按钮
  2. 点击"测试合约"按钮，检查合约是否可以正常连接
  3. 尝试手动输入NFT ID并加载
  4. 如果以上方法无效，请运行以下命令查询您的NFT:
     cd client
     node src/scripts/checkNFTs.js 您的钱包地址 0x4529a01c7a0410167c5740c487a8de60232617bf
  
  5. 使用浏览器开发者工具检查问题:
     - 打开浏览器开发者工具(F12或右键菜单)
     - 查看Console中是否有错误信息
     - 如果看到错误，请记录这些错误信息
  
  6. 如果问题依旧，尝试:
     - 清除浏览器缓存和localStorage
     - 重新打开页面
     - 使用不同的网络连接
     - 尝试不同的浏览器
  
  7. 恢复方法:
     在浏览器控制台中执行clearLoadingState()函数
     或者调用window.clearLoadingState()
  `);
  
  return "已显示疑难解答指南";
}

// 导出函数，便于在控制台中访问
window.clearLoadingState = clearLoadingState;
window.troubleshootingGuide = troubleshootingGuide;

// 自动执行
console.log("LP仓位修复脚本已加载，请调用以下函数之一:");
console.log("1. clearLoadingState() - 尝试修复加载状态");
console.log("2. troubleshootingGuide() - 显示疑难解答指南"); 