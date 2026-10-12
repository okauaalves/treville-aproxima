// Temporário (não commitar): ativa web.output=server só no export do EAS Hosting.
module.exports = ({ config }) =>
  process.env.TREVILLE_WEB_OUTPUT === 'server' ? { ...config, web: { ...config.web, output: 'server' } } : config;
