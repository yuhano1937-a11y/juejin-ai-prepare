// postcss.config.cjs
// 防止 Vite 向上递归查找 PostCSS 配置导致测试环境报错
module.exports = {
  plugins: {},
};
