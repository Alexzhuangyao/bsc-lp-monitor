export const getAddLiquidityUrl = (token0Address, token1Address) => {
  return `https://pancakeswap.finance/add/${token0Address}/${token1Address}`;
};
 
// 获取 BSCScan 地址链接
export const getBscScanUrl = (address) => {
    return `https://bscscan.com/address/${address}`;
}; 