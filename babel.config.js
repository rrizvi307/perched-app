module.exports = function(api) {
  api.cache.using(() => process.env.NODE_ENV || 'development');
  const plugins = [];

  if (api.env('production')) {
    plugins.push(require.resolve('./babel-plugin-strip-console'));
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
